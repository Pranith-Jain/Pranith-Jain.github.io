/**
 * Agent investigation API routes.
 *
 * POST /api/v1/agent/investigate  — start a new autonomous investigation
 * GET  /api/v1/agent/:id          — poll investigation state
 * GET  /api/v1/agent/:id/stream   — SSE stream of step events
 * GET  /api/v1/agent/sessions     — list recent investigations
 */
import type { Context } from 'hono';
import type { Env } from '../env';
import type { AgentState } from '../lib/agent/types';
import { trackEvent, visitorCountry } from '../lib/analytics';

const AGENT_CACHE_TTL = 60; // 1 minute cache for session state

/**
 * POST /api/v1/agent/investigate
 * Start a new autonomous investigation. Returns a session ID that can be
 * polled via GET /api/v1/agent/:id or streamed via GET /api/v1/agent/:id/stream.
 */
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

    const maxSteps = Math.min(Math.max(body.maxSteps ?? 8, 1), 12);
    const queryType = detectQueryType(query);
    const id = crypto.randomUUID();

    const doNamespace = c.env.INVESTIGATOR_AGENT;
    if (!doNamespace) return c.json({ error: 'Agent not configured (INVESTIGATOR_AGENT binding missing)' }, 503);

    const doId = doNamespace.idFromName(id);
    const stub = doNamespace.get(doId);

    // Forward the request to the Durable Object
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

/**
 * GET /api/v1/agent/:id
 * Poll the current state of an investigation.
 */
export async function agentStateHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'id required' }, 400);

  const doNamespace = c.env.INVESTIGATOR_AGENT;
  if (!doNamespace) return c.json({ error: 'Agent not configured' }, 503);

  const doId = doNamespace.idFromName(id);
  const stub = doNamespace.get(doId);

  const doRes = await stub.fetch(`https://agent/state?id=${encodeURIComponent(id)}`);
  if (!doRes.ok) {
    return c.json({ error: 'not found' }, 404);
  }

  const state = (await doRes.json()) as AgentState;
  return c.json(state, 200, { 'Cache-Control': `public, max-age=${AGENT_CACHE_TTL}` });
}

/**
 * GET /api/v1/agent/:id/stream
 * SSE stream of investigation progress. Emits an event each time a step completes.
 */
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

      // Poll the DO every 500ms until done/error
      const interval = setInterval(async () => {
        if (closed) {
          clearInterval(interval);
          return;
        }
        try {
          const res = await stub.fetch(`https://agent/state?id=${encodeURIComponent(id)}`);
          if (!res.ok) return;
          const state = (await res.json()) as AgentState;

          // Emit new steps
          for (const step of state.steps) {
            if (step.stepNumber > lastStep) {
              send(JSON.stringify({ type: 'step', step }));
              lastStep = step.stepNumber;
            }
          }

          // Emit completion
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

      // Timeout after 5 minutes
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
    },
  });
}

/**
 * GET /api/v1/agent/sessions
 * List recent investigation sessions from D1.
 */
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

/** Detect query type from the input text. */
function detectQueryType(query: string): string {
  const q = query.toLowerCase();
  // CVE pattern
  if (/\bcve-\d{4}-\d{4,}/i.test(query)) return 'cve';
  // IPv4
  if (/\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(query)) return 'ip';
  // Hash (MD5/SHA1/SHA256)
  if (/\b[a-fA-F0-9]{32,64}\b/.test(query)) return 'hash';
  // Domain
  if (/\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}\b/i.test(query) && !q.startsWith('how ')) return 'domain';
  // Actor / ransomware
  if (/\b(apt\d+|lazarus|fin\d+|ta\d+|lockbit|blackcat|alphv|cl0p|rhysida|play|akira|black basta)\b/i.test(q))
    return 'actor';
  if (/\bransomware\b/i.test(q)) return 'ransomware';
  // Phishing
  if (/\bphish/i.test(q)) return 'phishing';
  return 'generic';
}
