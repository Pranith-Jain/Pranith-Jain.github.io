/**
 * /api/v1/fivew — extract Who/What/When/Where/Why from a free-text
 * report. Single LLM call, structured JSON response.
 *
 * POST body: { text: string }
 * Response: { fiveW: { who, what, when, where, why, attribution_basis?, confidence } } | { error }
 *
 * 5-minute Cache API dedup for re-renders.
 */
import type { Context } from 'hono';
import type { Env } from '../env';
import { extractFiveW, type FiveW } from '../lib/fivew-extract';

const CACHE_TTL = 300;

function cacheKey(text: string): Request {
  const k = `${text.length}:${text.slice(0, 64)}`;
  return new Request(`https://fivew.internal/v1/${encodeURIComponent(k)}`);
}

export async function fivewHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  let body: { text?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'bad_request', message: 'invalid JSON body' }, 400);
  }
  const text = typeof body.text === 'string' ? body.text : '';
  if (text.trim().length < 100) {
    return c.json({ error: 'bad_request', message: 'text must be at least 100 characters' }, 400);
  }
  if (text.length > 50_000) {
    return c.json({ error: 'bad_request', message: 'text exceeds 50KB limit' }, 413);
  }

  const key = cacheKey(text);
  try {
    const cached = await caches.default.match(key);
    if (cached) {
      const data = (await cached.json()) as { fiveW: FiveW | null };
      return c.json(data, 200, { 'cache-control': `public, max-age=${CACHE_TTL}` });
    }
  } catch {
    /* miss */
  }

  const fiveW = await extractFiveW(text, c.env);
  const out = { fiveW };
  // Fire-and-forget cache write via waitUntil so the response isn't blocked
  // on the Cache API. cache.default.put is metered (1 write/request budget)
  // and serialised on the isolate -- doing it after the response is sent
  // shaves ~10-30ms off the p50 for this route.
  c.executionCtx.waitUntil(
    caches.default.put(
      key,
      new Response(JSON.stringify(out), {
        headers: { 'content-type': 'application/json', 'cache-control': `max-age=${CACHE_TTL}` },
      })
    )
  );
  if (!fiveW) {
    return c.json(out, 200, { 'cache-control': `public, max-age=${CACHE_TTL}` });
  }
  return c.json(out, 200, { 'cache-control': `public, max-age=${CACHE_TTL}` });
}
