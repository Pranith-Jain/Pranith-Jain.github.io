import { Hono } from 'hono';
import type { Env } from '../env';

const CACHE_TTL = 3600;

export const mozillaTlsRouter = new Hono<{ Bindings: Env }>();

mozillaTlsRouter.get('/mozilla-tls/scan', async (c) => {
  const url = c.req.query('url');
  if (!url) return c.json({ error: 'url parameter required' }, 400);

  const cacheKey = `mozilla:tls:${url}`;
  const cached = await c.env.KV_CACHE?.get(cacheKey, 'json');
  if (cached) return c.json({ ...(cached as object), cached: true });

  try {
    const res = await fetch(`https://tls-observatory.services.mozilla.com/api/v1/scan?url=${encodeURIComponent(url)}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) return c.json({ error: `Mozilla TLS upstream ${res.status}` }, 502);

    const data = await res.json();
    const body = { url, results: data, generated_at: new Date().toISOString(), cached: false };

    if (c.env.KV_CACHE)
      c.executionCtx.waitUntil(c.env.KV_CACHE.put(cacheKey, JSON.stringify(body), { expirationTtl: CACHE_TTL }));
    return c.json(body);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'Mozilla TLS unreachable' }, 502);
  }
});

mozillaTlsRouter.get('/mozilla-tls/result', async (c) => {
  const scanId = c.req.query('scanId');
  if (!scanId) return c.json({ error: 'scanId parameter required' }, 400);

  try {
    const res = await fetch(
      `https://tls-observatory.services.mozilla.com/api/v1/results/${encodeURIComponent(scanId)}`,
      {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!res.ok) return c.json({ error: `Mozilla TLS upstream ${res.status}` }, 502);
    const data = await res.json();
    return c.json({ scanId, results: data, generated_at: new Date().toISOString() });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'Mozilla TLS unreachable' }, 502);
  }
});
