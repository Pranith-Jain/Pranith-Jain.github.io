import type { Context } from 'hono';
import type { Env } from '../env';

const PD_BASE = 'https://api.projectdiscovery.io/v1/leaks/stats/email';
const CACHE_TTL_SECONDS = 3600;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function projectDiscoveryHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const email = c.req.query('email');
  if (!email) {
    return c.json({ error: 'email parameter required' }, 400);
  }
  if (!EMAIL_RE.test(email)) {
    return c.json({ error: 'invalid email format' }, 400);
  }

  const cacheKeyStr = `https://pd-cache.internal/v1-${encodeURIComponent(email)}`;
  const cacheReq = new Request(cacheKeyStr);
  const cached = await caches.default.match(cacheReq);
  if (cached) return new Response(cached.body, cached);

  try {
    const res = await fetch(`${PD_BASE}?email=${encodeURIComponent(email)}`, {
      headers: {
        accept: 'application/json',
        'user-agent': 'pranithjain.qzz.io DFIR toolkit',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return c.json({ error: `ProjectDiscovery upstream ${res.status}` }, 502);

    const data = await res.json();
    const body = JSON.stringify({
      email,
      found: true,
      data,
      generated_at: new Date().toISOString(),
    });

    const response = new Response(body, {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': `public, max-age=${CACHE_TTL_SECONDS}`,
      },
    });
    c.executionCtx.waitUntil(caches.default.put(cacheReq, response.clone()));
    return response;
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'ProjectDiscovery unreachable' }, 502);
  }
}
