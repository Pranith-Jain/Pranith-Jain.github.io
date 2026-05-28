import type { Context } from 'hono';
import type { Env } from '../env';

const CACHE_TTL_SECONDS = 86400;

interface RadarDomain {
  domain: string;
  rank: number;
  category?: string;
  trending?: string;
}

export async function radarDomainHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const domain = c.req.query('domain');
  if (!domain || domain.length > 200) return c.json({ error: 'domain parameter required' }, 400);
  if (!c.env.CF_API_TOKEN) return c.json({ error: 'CF_API_TOKEN not configured' }, 503);

  const cacheUrl = `https://radar-cache.internal/v1-domain-${encodeURIComponent(domain)}`;
  const cacheReq = new Request(cacheUrl);
  const cached = await caches.default.match(cacheReq);
  if (cached) return new Response(cached.body, cached);

  try {
    const [rankRes, catsRes] = await Promise.allSettled([
      fetch(`https://api.cloudflare.com/client/v4/radar/ranking/domain?domain=${encodeURIComponent(domain)}&limit=1`, {
        headers: { authorization: `Bearer ${c.env.CF_API_TOKEN}`, 'content-type': 'application/json' },
        signal: AbortSignal.timeout(8000),
      }),
      fetch(`https://api.cloudflare.com/client/v4/radar/ranking/domain/${encodeURIComponent(domain)}/categories`, {
        headers: { authorization: `Bearer ${c.env.CF_API_TOKEN}`, 'content-type': 'application/json' },
        signal: AbortSignal.timeout(8000),
      }),
    ]);

    const result: RadarDomain = { domain, rank: 0 };

    if (rankRes.status === 'fulfilled' && rankRes.value.ok) {
      const data = await rankRes.value.json() as any;
      result.rank = data?.result?.top?.[0]?.rank ?? 0;
      result.trending = data?.result?.top?.[0]?.trending;
    }

    if (catsRes.status === 'fulfilled' && catsRes.value.ok) {
      const data = await catsRes.value.json() as any;
      const cats = data?.result?.categories ?? [];
      if (cats.length > 0) result.category = cats[0].name;
    }

    const body = JSON.stringify({ result, generated_at: new Date().toISOString() });
    const response = new Response(body, {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${CACHE_TTL_SECONDS}` },
    });
    c.executionCtx.waitUntil(caches.default.put(cacheReq, response.clone()));
    return response;
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'Cloudflare Radar unreachable' }, 502);
  }
}
