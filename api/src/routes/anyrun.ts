import type { Context } from 'hono';
import type { Env } from '../env';

const CACHE_TTL_SECONDS = 3600;

export async function anyrunSearchHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const q = c.req.query('q');
  if (!q || q.length > 500) return c.json({ error: 'q parameter required (max 500)' }, 400);

  const apiKey = c.env.ANYRUN_API_KEY;
  if (!apiKey) return c.json({ error: 'ANYRUN_API_KEY not configured' }, 503);

  const cacheKey = `https://anyrun-cache.internal/v1-${encodeURIComponent(q)}`;
  const cacheReq = new Request(cacheKey);
  const cached = await caches.default.match(cacheReq);
  if (cached) return new Response(cached.body, cached);

  try {
    const res = await fetch(`https://api.any.run/v1/analysis?q=${encodeURIComponent(q)}&limit=20`, {
      headers: {
        'accept': 'application/json',
        'authorization': `Bearer ${apiKey}`,
        'user-agent': 'pranithjain.qzz.io DFIR toolkit',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return c.json({ error: `ANY.RUN upstream ${res.status}` }, 502);

    const data = await res.json() as any;
    const results = data?.data ?? data?.results ?? data?.analyses ?? [];
    const body = JSON.stringify({ count: Array.isArray(results) ? results.length : 0, results, generated_at: new Date().toISOString() });
    const response = new Response(body, {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${CACHE_TTL_SECONDS}` },
    });
    c.executionCtx.waitUntil(caches.default.put(cacheReq, response.clone()));
    return response;
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'ANY.RUN unreachable' }, 502);
  }
}
