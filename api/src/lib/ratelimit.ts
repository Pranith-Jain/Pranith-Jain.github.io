import type { Context, Next } from 'hono';
import type { Env } from '../env';

const LIMIT = 30; // requests per minute
const WINDOW_SEC = 60;
const TTL = 120; // KV TTL > window so the bucket survives
const BYPASS_PATHS = ['/api/v1/health', '/api/v1/feeds/proxy'];

export async function rateLimit(c: Context<{ Bindings: Env }>, next: Next): Promise<Response | void> {
  const url = new URL(c.req.url);
  if (!url.pathname.startsWith('/api/v1/')) return next();
  if (BYPASS_PATHS.includes(url.pathname)) return next();

  const ip = c.req.header('cf-connecting-ip') ?? 'anon';
  const bucket = Math.floor(Date.now() / 1000 / WINDOW_SEC);
  const key = `rl:${bucket}:${ip}`;

  // No-op if KV is not bound (lets local dev + un-provisioned production work)
  if (!c.env.KV_CACHE) return next();

  let count = 0;
  try {
    const raw = await c.env.KV_CACHE.get(key);
    count = raw ? parseInt(raw, 10) : 0;
  } catch {
    return next(); // KV transient error — fail open (don't block legit traffic)
  }

  if (count >= LIMIT) {
    return c.json({ error: 'rate_limited', limit: LIMIT, window_seconds: WINDOW_SEC }, 429, {
      'retry-after': String(WINDOW_SEC),
      'x-ratelimit-limit': String(LIMIT),
      'x-ratelimit-remaining': '0',
      'x-ratelimit-reset': String((bucket + 1) * WINDOW_SEC),
      'cache-control': 'no-store',
    });
  }

  // Best-effort increment (don't await blocking)
  try {
    await c.env.KV_CACHE.put(key, String(count + 1), { expirationTtl: TTL });
  } catch {
    /* swallow */
  }

  return next();
}
