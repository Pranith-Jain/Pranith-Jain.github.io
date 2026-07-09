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
import { badRequest, notFound, internalError, serviceUnavailable } from '../lib/api-error';
import type { AgentState } from '../lib/agent/types';
import { trackEvent, visitorCountry } from '../lib/analytics';

const AGENT_CACHE_TTL = 60;

/** Maximum investigations per user per hour. Each runs up to 10 LLM steps. */
const AGENT_RATE_LIMIT = 5;
const AGENT_RATE_WINDOW_SEC = 3600; // 1 hour

/**
 * Atomically increment the agent investigation counter via the CRON_LOCK_DO.
 * Returns the post-increment count, or null on failure (fail-open).
 */
async function atomicAgentIncr(c: Context<{ Bindings: Env }>, keyId: string, bucket: number): Promise<number | null> {
  const ns = (c.env as { CRON_LOCK_DO?: DurableObjectNamespace }).CRON_LOCK_DO;
  if (!ns) return null;
  try {
    const id = ns.idFromName(`rl:agent:${keyId}:${bucket}`);
    const res = await ns.get(id).fetch('https://cron-lock.internal/incr', {
      method: 'POST',
      body: JSON.stringify({ op: 'incr', cron: `agent:${keyId}:${bucket}`, ttlMs: AGENT_RATE_WINDOW_SEC * 2 * 1000 }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { count?: number };
    return typeof data.count === 'number' ? data.count : null;
  } catch {
    return null;
  }
}

export async function agentInvestigateHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    let body: { query?: string; maxSteps?: number };
    try {
      body = await c.req.json<{ query?: string; maxSteps?: number }>();
    } catch {
      return badRequest(c, 'Invalid JSON body');
    }

    const query = body.query?.trim();
    if (!query) return badRequest(c, 'query is required');
    if (query.length > 2000) return badRequest(c, 'query too long (max 2000 chars)');

    // Rate limit: 5 investigations per hour per API key.
    // Uses the admin key ID as the rate-limit key (admin-gated route).
    const user = (c as Context & { user?: { keyId: string } }).user;
    if (user?.keyId) {
      const bucket = Math.floor(Date.now() / 1000 / AGENT_RATE_WINDOW_SEC);
      const count = await atomicAgentIncr(c, user.keyId, bucket);
      if (count !== null && count > AGENT_RATE_LIMIT) {
        return c.json(
          {
            error: 'rate_limited',
            message: `${AGENT_RATE_LIMIT} investigations per hour exceeded`,
            limit: AGENT_RATE_LIMIT,
            window_seconds: AGENT_RATE_WINDOW_SEC,
          },
          429,
          {
            'retry-after': String(AGENT_RATE_WINDOW_SEC),
            'x-ratelimit-limit': String(AGENT_RATE_LIMIT),
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': String((bucket + 1) * AGENT_RATE_WINDOW_SEC),
          }
        );
      }
    }

    const maxSteps = Math.min(Math.max(body.maxSteps ?? 6, 1), 10);
    const queryType = detectQueryType(query);
    const id = crypto.randomUUID();

    const doNamespace = c.env.INVESTIGATOR_AGENT;
    if (!doNamespace) return serviceUnavailable(c, 'Agent not configured');

    const doId = doNamespace.idFromName(id);
    const stub = doNamespace.get(doId);

    const doRes = await stub.fetch(`https://agent/investigate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, query, queryType, maxSteps }),
    });

    if (!doRes.ok) {
      const err = await doRes.text().catch(() => 'unknown error');
      return internalError(c, err);
    }

    trackEvent(c.env, 'api_call', {
      blobs: ['/api/v1/agent/investigate'],
      indexes: [visitorCountry(c.req.raw)],
    });

    return c.json({ id, queryType, maxSteps, status: 'running' }, 201);
  } catch (err) {
    console.error('agentInvestigateHandler error:', err);
    return internalError(c, err);
  }
}

export async function agentStateHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const id = c.req.param('id');
  if (!id) return badRequest(c, 'id required');

  const doNamespace = c.env.INVESTIGATOR_AGENT;
  if (!doNamespace) return serviceUnavailable(c, 'Agent not configured');

  const doId = doNamespace.idFromName(id);
  const stub = doNamespace.get(doId);

  const doRes = await stub.fetch(`https://agent/state?id=${encodeURIComponent(id)}`);
  if (!doRes.ok) return notFound(c);

  const state = (await doRes.json()) as AgentState;
  return c.json(state, 200, { 'Cache-Control': `public, max-age=${AGENT_CACHE_TTL}` });
}

export async function agentStreamHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const id = c.req.param('id');
  if (!id) return badRequest(c, 'id required');

  const doNamespace = c.env.INVESTIGATOR_AGENT;
  if (!doNamespace) return serviceUnavailable(c, 'Agent not configured');

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
  if (!db) return serviceUnavailable(c, 'database not configured');

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
  if (!id) return badRequest(c, 'id required');

  const db = c.env.BRIEFINGS_DB;
  if (!db) return serviceUnavailable(c, 'database not configured');

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

import { runCompletion } from '../case-study/generation/ai-client';

/**
 * GET /api/v1/agent/debug-llm
 * Test each LLM provider and return diagnostics.
 * Requires an admin `x-api-key` header.
 */
export async function agentDebugLlmHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const env = c.env;
  const testInput = {
    system: 'You are a helpful assistant. Reply with exactly one word: "ok".',
    user: 'Reply with exactly one word: "ok".',
    maxTokens: 10,
    temperature: 0,
  };

  const results: Record<string, unknown> = { providers: {} };

  // Test Workers AI separately (it's first in the chain)
  if (env.AI && typeof env.AI === 'object') {
    const start = Date.now();
    try {
      const ai = env.AI as { run: (m: string, i: Record<string, unknown>) => Promise<Record<string, unknown>> };
      for (const model of [
        '@cf/meta/llama-3.1-8b-instruct',
        '@cf/meta/llama-3-8b-instruct',
        '@cf/mistral/mistral-7b-instruct-v0.1',
        '@hf/meta-llama/meta-llama-3-8b-instruct',
        '@cf/meta/llama-3.2-3b-instruct',
      ]) {
        try {
          const res = await ai.run(model, {
            messages: [
              { role: 'system', content: testInput.system },
              { role: 'user', content: testInput.user },
            ],
            max_tokens: 10,
            temperature: 0,
          });
          const text = (res?.response ?? res?.text ?? '') as string;
          if (typeof text === 'string' && text.trim()) {
            results.providers = {
              ...(results.providers as Record<string, unknown>),
              [`workers-ai:${model.split('/').pop()}`]: {
                status: 'ok',
                durationMs: Date.now() - start,
                response: text.slice(0, 50),
              },
            };
          }
        } catch (e) {
          results.providers = {
            ...(results.providers as Record<string, unknown>),
            [`workers-ai:${model.split('/').pop()}`]: {
              status: 'error',
              error: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200),
            },
          };
        }
      }
    } catch (e) {
      results.workersAiError = e instanceof Error ? e.message : String(e);
    }
  } else {
    results.workersAiBinding = 'unavailable';
  }

  // Test Groq
  if (env.GROQ_API_KEY) {
    const start = Date.now();
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [
            { role: 'system', content: testInput.system },
            { role: 'user', content: testInput.user },
          ],
          max_completion_tokens: 10,
          temperature: 0,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const body = await res.text().catch(() => '');
      results.providers = {
        ...(results.providers as Record<string, unknown>),
        groq: {
          status: res.ok ? 'ok' : 'error',
          httpStatus: res.status,
          durationMs: Date.now() - start,
          response: res.ok ? body.slice(0, 100) : body.slice(0, 200),
        },
      };
    } catch (e) {
      results.providers = {
        ...(results.providers as Record<string, unknown>),
        groq: { status: 'error', error: e instanceof Error ? e.message : String(e) },
      };
    }
  } else {
    results.providers = { ...(results.providers as Record<string, unknown>), groq: { status: 'no key' } };
  }

  // Test NVIDIA
  if (env.NVIDIA_API_KEY) {
    const start = Date.now();
    try {
      const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.NVIDIA_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'minimaxai/minimax-m2.7',
          messages: [
            { role: 'system', content: testInput.system },
            { role: 'user', content: testInput.user },
          ],
          max_tokens: 10,
          temperature: 0,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const body = await res.text().catch(() => '');
      results.providers = {
        ...(results.providers as Record<string, unknown>),
        nvidia: {
          status: res.ok ? 'ok' : 'error',
          httpStatus: res.status,
          durationMs: Date.now() - start,
          response: res.ok ? body.slice(0, 100) : body.slice(0, 200),
        },
      };
    } catch (e) {
      results.providers = {
        ...(results.providers as Record<string, unknown>),
        nvidia: { status: 'error', error: e instanceof Error ? e.message : String(e) },
      };
    }
  } else {
    results.providers = { ...(results.providers as Record<string, unknown>), nvidia: { status: 'no key' } };
  }

  // Test full runCompletion chain
  results.fullChain = { status: 'unknown' };
  try {
    const r = await runCompletion(env.AI, testInput, {
      groqKey: env.GROQ_API_KEY,
      nvidiaKey: env.NVIDIA_API_KEY,
      googleKey: env.GOOGLE_AI_STUDIO_API_KEY,
    });
    results.fullChain = { status: 'ok', modelUsed: r.modelUsed, response: r.text.slice(0, 50) };
  } catch (e) {
    results.fullChain = { status: 'error', error: e instanceof Error ? e.message : String(e) };
  }

  return c.json(results);
}

/** Detect query type from the input text. */
function detectQueryType(query: string): string {
  const q = query.toLowerCase();
  if (/\bcve-\d{4}-\d{4,}/i.test(query)) return 'cve';
  if (/\bexploit.?db\b/i.test(q) || /\bexploit\b/i.test(q)) return 'exploit-db';
  if (/\bbug.?bounty\b/i.test(q) || /\bbounty\b/i.test(q)) return 'bug-bounty';
  if (/\bsecurity.?update\b/i.test(q) || /\bvendor.?advisor/i.test(q)) return 'security-updates';
  if (/\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(query)) return 'ip';
  if (/\b[a-fA-F0-9]{32,64}\b/.test(query)) return 'hash';
  if (/^https?:\/\//i.test(query.trim())) return 'url';
  if (/\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}\b/i.test(query) && !q.startsWith('how ')) return 'domain';
  // Known ransomware groups and threat actors
  const actorPattern =
    /\b(apt\d+|lazarus|fin\d+|ta\d+|lockbit|blackcat|alphv|cl0p|rhysida|play|akira|black.?basta|kimsuky|sandworm|turla|cozy.?bear|qilin|agenda|ransomhouse|bian.?lian|conti|rei?vil|sodinokibi|darkside|black.?matter|babuk|hive|egregor|netwalker|doppelpaymer|mountlocker|astro.?locker|pysa|mespinoza|nefilim|avaddon|xing.?locker|groove|grief|ransomexx|royal|vice.?society|lorenz|karakurt|rook|quantum|night.?sky|atlas|pandora|avos.?locker|cuba|sugar|zeppelin|arvin.?club|everest|black.?byte|snatch|luna|onyx|ragnar.?locker|maze|cheers|cring|haron|good.?will|tell.?you.?the.?pass|blind.?eagle|atom.?silo)\b/i;
  if (actorPattern.test(q)) return 'actor';
  if (/\bransomware\b/i.test(q)) return 'ransomware';
  if (/\bphish/i.test(q)) return 'phishing';
  if (/\bcampaign/i.test(q)) return 'campaign';
  // Short single-word queries that could be actor names
  if (/^[a-z][a-z0-9._-]{2,30}$/i.test(query.trim()) && !q.startsWith('how ') && !q.startsWith('what ')) return 'actor';
  return 'generic';
}
