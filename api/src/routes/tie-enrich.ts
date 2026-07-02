import type { Context } from 'hono';
import type { Env } from '../env';
import { badRequest, notFound, internalError, serviceUnavailable } from '../lib/api-error';
import type { AgentState } from '../lib/agent/types';

const CACHE_TTL = 60;

export async function tieEnrichHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  let body: { ioc?: string; ioc_type?: string; deep?: boolean };
  try {
    body = await c.req.json<{ ioc?: string; ioc_type?: string; deep?: boolean }>();
  } catch {
    return badRequest(c, 'Invalid JSON body');
  }

  const ioc = body.ioc?.trim();
  const iocType = body.ioc_type?.trim() as 'ip' | 'hash' | 'domain' | 'url' | undefined;

  if (!ioc) return badRequest(c, 'ioc is required');
  if (!iocType || !['ip', 'hash', 'domain', 'url'].includes(iocType)) {
    return badRequest(c, 'ioc_type must be one of: ip, hash, domain, url');
  }
  if (ioc.length > 2000) return badRequest(c, 'ioc too long (max 2000 chars)');

  // Fast path: deterministic enrichment via SELF
  if (!body.deep) {
    const self = c.env.SELF;
    if (!self) return serviceUnavailable(c, 'SELF binding not available');

    const { enrichIoc } = await import('../lib/tie-enrich');
    const result = await enrichIoc(self, ioc, iocType);
    return c.json(result, 200, { 'Cache-Control': `public, max-age=${CACHE_TTL}` });
  }

  // Deep path: trigger the investigator DO
  const doNamespace = c.env.INVESTIGATOR_AGENT;
  if (!doNamespace) return serviceUnavailable(c, 'Investigator agent not configured');

  const id = crypto.randomUUID();
  const doId = doNamespace.idFromName(id);
  const stub = doNamespace.get(doId);

  const prompt = `Enrich this IOC: ${ioc} (type: ${iocType}). Investigate thoroughly — check reputation across multiple providers, map to known malware/actors if applicable, extract MITRE ATT&CK techniques, and assess overall risk. Return a structured threat assessment with an executive summary, key findings, risk score, and recommended actions.`;

  const doRes = await stub.fetch('https://agent/investigate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, query: prompt, queryType: iocType, maxSteps: 4 }),
  });

  if (!doRes.ok) {
    const err = await doRes.text().catch(() => 'unknown error');
    return internalError(c, err);
  }

  return c.json({ id, ioc, iocType, status: 'running' }, 201);
}

/** GET /api/v1/tie/enrich/:id — poll deep-analysis state from the DO. */
export async function tieEnrichStateHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const id = c.req.param('id');
  if (!id) return badRequest(c, 'id required');

  const doNamespace = c.env.INVESTIGATOR_AGENT;
  if (!doNamespace) return serviceUnavailable(c, 'Investigator agent not configured');

  const doId = doNamespace.idFromName(id);
  const stub = doNamespace.get(doId);

  const doRes = await stub.fetch(`https://agent/state?id=${encodeURIComponent(id)}`);
  if (!doRes.ok) return notFound(c);

  const state = (await doRes.json()) as AgentState;
  return c.json(state, 200, { 'Cache-Control': `public, max-age=${CACHE_TTL}` });
}

/** GET /api/v1/tie/enrich/:id/stream — SSE stream for deep analysis. */
export async function tieEnrichStreamHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const id = c.req.param('id');
  if (!id) return badRequest(c, 'id required');

  const doNamespace = c.env.INVESTIGATOR_AGENT;
  if (!doNamespace) return serviceUnavailable(c, 'Investigator agent not configured');

  const doId = doNamespace.idFromName(id);
  const stub = doNamespace.get(doId);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let lastStep = -1;
      let closed = false;

      const send = (data: string) => {
        if (!closed) {
          try {
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          } catch {
            closed = true;
          }
        }
      };

      const interval = setInterval(async () => {
        if (closed) {
          clearInterval(interval);
          return;
        }
        try {
          const res = await stub.fetch(`https://agent/state?id=${encodeURIComponent(id)}`);
          if (!res.ok) return;
          const state = (await res.json()) as AgentState;

          for (const step of state.steps) {
            if (step.stepNumber > lastStep) {
              send(JSON.stringify({ type: 'step', step }));
              lastStep = step.stepNumber;
            }
          }

          if (state.status === 'done' || state.status === 'error') {
            send(
              JSON.stringify({
                type: state.status,
                report: state.report,
                error: state.error,
                modelUsed: state.modelUsed,
              })
            );
            clearInterval(interval);
            closed = true;
            try {
              controller.close();
            } catch {
              /* already closed */
            }
          }
        } catch {
          /* poll error, retry next tick */
        }
      }, 500);

      setTimeout(() => {
        if (!closed) {
          send(JSON.stringify({ type: 'error', error: 'Enrichment timed out (5m)' }));
          clearInterval(interval);
          closed = true;
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      }, 300_000);
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
}
