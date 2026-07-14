import type { Context } from 'hono';
import type { Env } from '../env';

const HM_BASE = 'https://hackmyip.com/api/breach';
const CACHE_TTL_SECONDS = 3600;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function hackMyIpBreachHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const email = c.req.query('email');
  if (!email) {
    return c.json({ error: 'email parameter required' }, 400);
  }
  if (!EMAIL_RE.test(email)) {
    return c.json({ error: 'invalid email format' }, 400);
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
    if (!res.ok) return c.json({ error: `HackMyIP upstream ${res.status}` }, 502);

    let data: unknown;
    try {
      data = await res.json();
    } catch (_catchErr) {
      console.error(
        'hackMyIpBreachHandler failed:',
        _catchErr instanceof Error ? _catchErr.message : String(_catchErr)
      );
      return c.json({ error: 'HackMyIP returned invalid JSON' }, 502);
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
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return c.json({ error: e instanceof Error ? e.message : 'HackMyIP unreachable' }, 502);
  }
}
