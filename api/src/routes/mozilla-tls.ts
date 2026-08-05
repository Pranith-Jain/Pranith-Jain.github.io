import { Hono } from 'hono';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { badRequest, notFound, internalError, badGateway, serviceUnavailable } from '../lib/api-error';
import { kvBackedGet, kvBackedPut } from '../lib/route-cache';

const CACHE_TTL = 3600;

export const mozillaTlsRouter = new Hono<{ Bindings: Env }>();

mozillaTlsRouter.get('/mozilla-tls/scan', async (c) => {
  const url = c.req.query('url');
  if (!url) return badRequest(c, 'url parameter required');

  const cacheKey = `mozilla:tls:${url}`;
  const { value: cached } = await kvBackedGet<Record<string, unknown>>(c.env.KV_CACHE, cacheKey, CACHE_TTL);
  if (cached) return c.json({ ...cached, cached: true });

  try {
    const res = await fetch(`https://tls-observatory.services.mozilla.com/api/v1/scan?url=${encodeURIComponent(url)}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) return badGateway(c, `Mozilla TLS upstream ${res.status}`);

    const data = await res.json();
    const body = { url, results: data, generated_at: new Date().toISOString(), cached: false };

    if (c.env.KV_CACHE) c.executionCtx.waitUntil(kvBackedPut(c.env.KV_CACHE, cacheKey, body, CACHE_TTL));
    return c.json(body);
  } catch (e) {
    logError('handler failed', e);
    return badGateway(c, e instanceof Error ? e.message : 'Mozilla TLS unreachable');
  }
});

mozillaTlsRouter.get('/mozilla-tls/result', async (c) => {
  const scanId = c.req.query('scanId');
  if (!scanId) return badRequest(c, 'scanId parameter required');

  try {
    const res = await fetch(
      `https://tls-observatory.services.mozilla.com/api/v1/results/${encodeURIComponent(scanId)}`,
      {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!res.ok) return badGateway(c, `Mozilla TLS upstream ${res.status}`);
    const data = await res.json();
    return c.json({ scanId, results: data, generated_at: new Date().toISOString() });
  } catch (e) {
    logError('handler failed', e);
    return badGateway(c, e instanceof Error ? e.message : 'Mozilla TLS unreachable');
  }
});
