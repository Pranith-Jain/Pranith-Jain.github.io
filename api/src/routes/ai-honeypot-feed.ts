import type { Context } from 'hono';
import type { Env } from '../env';

const FEED_URL = 'https://ai-honeypots.com/feeds/iocs.txt';
const CACHE_TTL = 30 * 60;

export async function aiHoneypotFeedHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request('https://ai-honeypot-feed.internal/v1');
  const cached = await cache.match(cacheKey);
  if (cached) return new Response(cached.body, cached);

  try {
    const res = await fetch(FEED_URL, {
      signal: AbortSignal.timeout(10_000),
      headers: { 'user-agent': 'pranithjain-dfir/1.0' },
    });
    if (!res.ok) return c.json({ error: `Upstream returned ${res.status}` }, 502);
    const body = await res.text();
    const response = c.json({ feed: body }, 200, {
      'Cache-Control': `public, max-age=${CACHE_TTL}`,
      'Access-Control-Allow-Origin': '*',
    });
    c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'Fetch failed' }, 502);
  }
}
