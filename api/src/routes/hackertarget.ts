import type { Context } from 'hono';
import type { Env } from '../env';

import { safeNullLog } from '../lib/safe-catch';
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

const KV_PREFIX = 'hackertarget:v2:';

function makeHandler(endpoint: string, cacheKeyPrefix: string) {
  return async (c: Context<{ Bindings: Env }>): Promise<Response> => {
    const q = c.req.query('q');
    if (!q || q.length > 200)
      return c.json({ error: 'q parameter required (max 200)' }, 400, { 'Cache-Control': 'no-store' });

    const cacheUrl = `https://hackertarget-cache.internal/v2-${cacheKeyPrefix}-${encodeURIComponent(q)}`;
    const cacheReq = new Request(cacheUrl);
    const cached = await caches.default.match(cacheReq);
    if (cached) return new Response(cached.body, cached);

    const kv = c.env.KV_CACHE;
    const kvKey = `${KV_PREFIX}${cacheKeyPrefix}:${q.toLowerCase()}`;

    if (kv) {
      const kvCached = await safeNullLog('kv-get-hackertarget', kv.get(kvKey, 'json'));
      if (kvCached && typeof kvCached === 'object' && kvCached !== null && 'raw' in kvCached) {
        const body = JSON.stringify({ ...(kvCached as Record<string, unknown>), from_kv: true });
        const response = new Response(body, {
          status: 200,
          headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${CACHE_TTL_SECONDS}` },
        });
        c.executionCtx.waitUntil(caches.default.put(cacheReq, response.clone()));
        return response;
      }
    }

    try {
      const raw = await fetchText(endpoint, q);
      const payload = { raw, generated_at: new Date().toISOString() };
      const body = JSON.stringify(payload);
      const response = new Response(body, {
        status: 200,
        headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${CACHE_TTL_SECONDS}` },
      });
      c.executionCtx.waitUntil(caches.default.put(cacheReq, response.clone()));
      if (kv) c.executionCtx.waitUntil(kv.put(kvKey, JSON.stringify(payload), { expirationTtl: 86400 }));
      return response;
    } catch (e) {
      console.error('handler failed:', e instanceof Error ? e.message : String(e));
      if (e instanceof Error && e.message === 'RATE_LIMITED') {
        if (kv) {
          const kvCached = await safeNullLog('kv-get-hackertarget-rate', kv.get(kvKey, 'json'));
          if (kvCached && typeof kvCached === 'object' && kvCached !== null && 'raw' in kvCached) {
            return c.json({ ...(kvCached as Record<string, unknown>), from_kv: true, stale: true }, 200);
          }
        }
        return c.json(
          {
            error: 'rate_limited',
            message:
              'HackerTarget free tier limit reached (100 req/day). Try again tomorrow or use CertSpotter / crt.sh for subdomain discovery.',
            retry_after: 86400,
          },
          429,
          { 'Cache-Control': 'no-store' }
        );
      }
      return c.json({ error: e instanceof Error ? e.message : 'HackerTarget unreachable' }, 502, {
        'Cache-Control': 'no-store',
      });
    }
  };
}

export const hackertargetDnsHandler = makeHandler('hostsearch', 'dns');
export const hackertargetReverseIpHandler = makeHandler('reverseiplookup', 'revip');
