import type { Context } from 'hono';
import type { Env } from '../env';

const CACHE_TTL_SECONDS = 3600;

export async function maltiverseSearchHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const q = c.req.query('q');
  if (!q || q.length > 200) return c.json({ error: 'q parameter required (max 200)' }, 400);

  const cacheKey = `https://maltiverse-cache.internal/v1-${encodeURIComponent(q)}`;
  const cacheReq = new Request(cacheKey);
  const cached = await caches.default.match(cacheReq);
  if (cached) return new Response(cached.body, cached);

  try {
    const res = await fetch(`https://api.maltiverse.com/search?query=${encodeURIComponent(q)}&limit=20`, {
      headers: { accept: 'application/json', 'user-agent': 'pranithjain.qzz.io DFIR toolkit' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return c.json({ error: `Maltiverse upstream ${res.status}` }, 502);

    const data = (await res.json()) as { hits?: { hits?: unknown }; result?: unknown; data?: unknown };
    const rawHits = data?.hits?.hits ?? data?.result ?? data?.data ?? [];
    const results = Array.isArray(rawHits) ? rawHits.slice(0, 50) : [];
    const body = JSON.stringify({ count: results.length, results, generated_at: new Date().toISOString() });
    const response = new Response(body, {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${CACHE_TTL_SECONDS}` },
    });
    c.executionCtx.waitUntil(caches.default.put(cacheReq, response.clone()));
    return response;
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'Maltiverse unreachable' }, 502);
  }
}
