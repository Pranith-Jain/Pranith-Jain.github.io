import type { Context } from 'hono';
import type { Env } from '../env';

const CACHE_TTL_SECONDS = 3600;

async function fetchText(endpoint: string, q: string): Promise<string> {
  const res = await fetch(`https://api.hackertarget.com/${endpoint}?q=${encodeURIComponent(q)}`, {
    headers: { 'user-agent': 'pranithjain.qzz.io DFIR toolkit' },
    signal: AbortSignal.timeout(10000),
  });
  const text = await res.text();
  if (text.includes('API count exceeded') || text.includes('Increase Quota')) {
    throw new Error('RATE_LIMITED');
  }
  if (!res.ok) throw new Error(`HackerTarget upstream ${res.status}`);
  return text;
}

function makeHandler(endpoint: string, cacheKeyPrefix: string) {
  return async (c: Context<{ Bindings: Env }>): Promise<Response> => {
    const q = c.req.query('q');
    if (!q || q.length > 200) return c.json({ error: 'q parameter required (max 200)' }, 400);

    const cacheUrl = `https://hackertarget-cache.internal/v2-${cacheKeyPrefix}-${encodeURIComponent(q)}`;
    const cacheReq = new Request(cacheUrl);
    const cached = await caches.default.match(cacheReq);
    if (cached) return new Response(cached.body, cached);

    try {
      const raw = await fetchText(endpoint, q);
      const body = JSON.stringify({ raw, generated_at: new Date().toISOString() });
      const response = new Response(body, {
        status: 200,
        headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${CACHE_TTL_SECONDS}` },
      });
      c.executionCtx.waitUntil(caches.default.put(cacheReq, response.clone()));
      return response;
    } catch (e) {
      if (e instanceof Error && e.message === 'RATE_LIMITED') {
        return c.json({ error: 'rate_limited', message: 'HackerTarget free tier limit reached (100 req/day). Try again tomorrow or use CertSpotter for subdomain discovery.', retry_after: 86400 }, 429);
      }
      return c.json({ error: e instanceof Error ? e.message : 'HackerTarget unreachable' }, 502);
    }
  };
}

export const hackertargetDnsHandler = makeHandler('hostsearch', 'dns');
export const hackertargetReverseIpHandler = makeHandler('reverseiplookup', 'revip');
