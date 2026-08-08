import type { Context } from 'hono';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { badRequest, badGateway } from '../lib/api-error';

const HM_BASE = 'https://hackmyip.com/api/breach';
const CACHE_TTL_SECONDS = 3600;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function hackMyIpBreachHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const email = c.req.query('email');
  if (!email) {
    return badRequest(c, 'email parameter required');
  }
  if (!EMAIL_RE.test(email)) {
    return badRequest(c, 'invalid email format');
  }

  const cacheKeyStr = `https://hm-cache.internal/v1-${encodeURIComponent(email)}`;
  const cacheReq = new Request(cacheKeyStr);
  const cached = await caches.default.match(cacheReq);
  if (cached) return new Response(cached.body, cached);

  try {
    const res = await fetch(`${HM_BASE}?email=${encodeURIComponent(email)}`, {
      headers: {
        accept: 'application/json',
        'user-agent': 'pranithjain.qzz.io DFIR toolkit',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return badGateway(c, `HackMyIP upstream ${res.status}`);

    let data: unknown;
    try {
      data = await res.json();
    } catch (_catchErr) {
      logError('hackMyIpBreachHandler failed', _catchErr);
      return badGateway(c, 'HackMyIP returned invalid JSON');
    }
    const body = JSON.stringify({
      email,
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
    return badGateway(c, e instanceof Error ? e.message : 'HackMyIP unreachable');
  }
}
