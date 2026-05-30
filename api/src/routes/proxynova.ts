import type { Context } from 'hono';
import type { Env } from '../env';

interface ProxyNovaResponse {
  count: number;
  lines: string[];
}

const CACHE_TTL_SECONDS = 3600;

export async function proxyNovaSearchHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const q = c.req.query('q');
  if (!q || q.length > 200) return c.json({ error: 'q parameter required (max 200 chars)' }, 400);

  const cacheKeyStr = `https://proxynova-cache.internal/v1-${encodeURIComponent(q)}`;
  const cacheReq = new Request(cacheKeyStr);
  const cached = await caches.default.match(cacheReq);
  if (cached) return new Response(cached.body, cached);

  try {
    const res = await fetch(`https://api.proxynova.com/comb?query=${encodeURIComponent(q)}&limit=100`, {
      headers: {
        accept: 'application/json',
        'user-agent': 'pranithjain.qzz.io DFIR toolkit',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return c.json({ error: `ProxyNova upstream ${res.status}` }, 502);

    const data = (await res.json()) as ProxyNovaResponse;
    const body = JSON.stringify({
      count: data.count,
      results: data.lines.slice(0, 100),
      generated_at: new Date().toISOString(),
    });
    const response = new Response(body, {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${CACHE_TTL_SECONDS}` },
    });
    c.executionCtx.waitUntil(caches.default.put(cacheReq, response.clone()));
    return response;
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'ProxyNova unreachable' }, 502);
  }
}
