import type { Context } from 'hono';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { badRequest, notFound, internalError, badGateway, serviceUnavailable, tooManyRequests } from '../lib/api-error';

const PD_BASE = 'https://api.projectdiscovery.io/v1/leaks/stats/email';
const CACHE_TTL_SECONDS = 3600;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function projectDiscoveryHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const email = c.req.query('email');
  if (!email) {
    return badRequest(c, 'email parameter required');
  }
  if (!EMAIL_RE.test(email)) {
    return badRequest(c, 'invalid email format');
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
    if (!res.ok) return badGateway(c, `ProjectDiscovery upstream ${res.status}`);

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
    logError('handler failed', e);
    return badGateway(c, e instanceof Error ? e.message : 'ProjectDiscovery unreachable');
  }
}
