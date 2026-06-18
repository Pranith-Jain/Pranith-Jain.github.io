/**
 * Per-route burst limiter for the actor-profile aggregator.
 *
 * The global rateLimit middleware on /api/v1/* caps each IP at ~30 req/min
 * across the whole API surface. The actor-profile aggregator fans out to
 * 7+ sub-requests per call, so a single caller could burn a meaningful
 * share of the worker CPU. This limiter is a tighter, route-scoped cap
 * (10 req/min/IP) implemented via the Cache API so it does not consume
 * the KV write quota.
 */
import type { Context, Next } from 'hono';
import type { Env } from '../env';

const LIMIT = 10;
const WINDOW_SEC = 60;

export async function burstLimitActorProfile(c: Context<{ Bindings: Env }>, next: Next): Promise<Response | void> {
  const ip = c.req.header('cf-connecting-ip') ?? 'anon';
  const bucket = Math.floor(Date.now() / 1000 / WINDOW_SEC);
  const cache = (caches as unknown as { default: Cache }).default;
  const key = new Request(`https://rl-actor-profile.internal/${bucket}/${encodeURIComponent(ip)}`);
  let count = 0;
  try {
    const hit = await cache.match(key);
    if (hit) count = parseInt(await hit.text(), 10) || 0;
  } catch {
    return next(); // cache error — fail open
  }
  if (count >= LIMIT) {
    return c.json({ error: 'rate_limited', limit: LIMIT, window_seconds: WINDOW_SEC }, 429, {
      'retry-after': String(WINDOW_SEC),
      'x-ratelimit-limit': String(LIMIT),
      'x-ratelimit-remaining': '0',
      'x-ratelimit-reset': String((bucket + 1) * WINDOW_SEC),
    });
  }
  // Best-effort increment. If it fails, just allow the request.
  try {
    await cache.put(
      new Request(`https://rl-actor-profile.internal/${bucket}/${encodeURIComponent(ip)}`),
      new Response(String(count + 1), {
        headers: { 'cache-control': `max-age=${WINDOW_SEC}` },
      })
    );
  } catch {
    /* allow on cache error */
  }
  await next();
  // Set response headers so the client can see its remaining budget.
  try {
    c.res.headers.set('x-ratelimit-limit', String(LIMIT));
    c.res.headers.set('x-ratelimit-remaining', String(Math.max(0, LIMIT - count - 1)));
    c.res.headers.set('x-ratelimit-reset', String((bucket + 1) * WINDOW_SEC));
  } catch {
    /* read-only response */
  }
}
