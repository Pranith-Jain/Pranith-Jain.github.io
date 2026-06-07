/**
 * Agent investigation API routes.
 *
 * POST   /api/v1/agent/investigate  — start a new autonomous investigation
 * GET    /api/v1/agent/:id          — poll investigation state
 * GET    /api/v1/agent/:id/stream   — SSE stream of step events
 * GET    /api/v1/agent/sessions     — list recent investigations
 * DELETE /api/v1/agent/:id          — delete an investigation session
 */
import type { Context } from 'hono';
import type { Env } from '../env';
import type { AgentState } from '../lib/agent/types';
import { trackEvent, visitorCountry } from '../lib/analytics';

const AGENT_CACHE_TTL = 60;

export async function agentInvestigateHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    let body: { query?: string; maxSteps?: number };
    try {
      body = await c.req.json<{ query?: string; maxSteps?: number }>();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const query = body.query?.trim();
    if (!query) return c.json({ error: 'query is required' }, 400);
    if (query.length > 2000) return c.json({ error: 'query too long (max 2000 chars)' }, 400);

    const maxSteps = Math.min(Math.max(body.maxSteps ?? 6, 1), 10);
    const queryType = detectQueryType(query);
    const id = crypto.randomUUID();

    const doNamespace = c.env.INVESTIGATOR_AGENT;
    if (!doNamespace) return c.json({ error: 'Agent not configured' }, 503);

    const doId = doNamespace.idFromName(id);
    const stub = doNamespace.get(doId);

    const doRes = await stub.fetch(`https://agent/investigate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, query, queryType, maxSteps }),
    });

    if (!doRes.ok) {
      const err = await doRes.text().catch(() => 'unknown error');
      return c.json({ error: `Agent spawn failed: ${err}` }, 500);
    }

    trackEvent(c.env, 'api_call', {
      blobs: ['/api/v1/agent/investigate'],
      indexes: [visitorCountry(c.req.raw)],
    });

    return c.json({ id, queryType, maxSteps, status: 'running' }, 201);
  } catch (err) {
    console.error('agentInvestigateHandler error:', err);
    return c.json({ error: 'agent_handler_error', message: err instanceof Error ? err.message : String(err) }, 500);
  }
}

export async function agentStateHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'id required' }, 400);

  const doNamespace = c.env.INVESTIGATOR_AGENT;
  if (!doNamespace) return c.json({ error: 'Agent not configured' }, 503);

  const doId = doNamespace.idFromName(id);
  const stub = doNamespace.get(doId);

  const doRes = await stub.fetch(`https://agent/state?id=${encodeURIComponent(id)}`);
  if (!doRes.ok) return c.json({ error: 'not found' }, 404);

  const state = (await doRes.json()) as AgentState;
  return c.json(state, 200, { 'Cache-Control': `public, max-age=${AGENT_CACHE_TTL}` });
}

export async function agentStreamHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'id required' }, 400);

  const doNamespace = c.env.INVESTIGATOR_AGENT;
  if (!doNamespace) return c.json({ error: 'Agent not configured' }, 503);

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
          send(JSON.stringify({ type: 'error', error: 'Investigation timed out (5m)' }));
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

export async function agentSessionsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'database not configured' }, 503);

  const limit = Math.min(Number(c.req.query('limit') ?? 20), 50);

  const res = await db
    .prepare(
      `SELECT id, query, query_type, status, total_steps, model_used, created_at, updated_at
       FROM agent_sessions
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .bind(limit)
    .all();

  return c.json({ sessions: res.results ?? [] }, 200, { 'Cache-Control': 'public, max-age=30' });
}

/**
 * DELETE /api/v1/agent/:id
 * Delete an investigation session from D1 and the Durable Object.
 */
export async function agentDeleteHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'id required' }, 400);

  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'database not configured' }, 503);

  // Delete from D1
  await db.prepare('DELETE FROM agent_sessions WHERE id = ?').bind(id).run();

  // Also clean up the DO storage if it exists
  const doNamespace = c.env.INVESTIGATOR_AGENT;
  if (doNamespace) {
    try {
      const doId = doNamespace.idFromName(id);
      const stub = doNamespace.get(doId);
      await stub.fetch(`https://agent/delete?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch {
      // DO might not exist — non-fatal
    }
  }

  return c.json({ ok: true });
}

/** Detect query type from the input text. */
function detectQueryType(query: string): string {
  const q = query.toLowerCase();
  if (/\bcve-\d{4}-\d{4,}/i.test(query)) return 'cve';
  if (/\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(query)) return 'ip';
  if (/\b[a-fA-F0-9]{32,64}\b/.test(query)) return 'hash';
  if (/\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}\b/i.test(query) && !q.startsWith('how ')) return 'domain';
  if (
    /\b(apt\d+|lazarus|fin\d+|ta\d+|lockbit|blackcat|alphv|cl0p|rhysida|play|akira|black basta|kimsuky|sandworm|turla|cozy bear)\b/i.test(
      q
    )
  )
    return 'actor';
  if (/\bransomware\b/i.test(q)) return 'ransomware';
  if (/\bphish/i.test(q)) return 'phishing';
  if (/\bcampaign/i.test(q)) return 'campaign';
  return 'generic';
}
