import { Hono } from 'hono';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { badRequest, badGateway } from '../lib/api-error';
import { kvBackedGet, kvBackedPut } from '../lib/route-cache';

const CACHE_TTL = 86400;

export const virusheeRouter = new Hono<{ Bindings: Env }>();

virusheeRouter.get('/virushee/check', async (c) => {
  const hash = c.req.query('hash');
  if (!hash || hash.length > 128) return badRequest(c, 'hash parameter required (max 128 chars)');

  const cacheKey = `virushee:${hash}`;
  const { value: cached } = await kvBackedGet<Record<string, unknown>>(c.env.KV_CACHE, cacheKey, CACHE_TTL);
  if (cached) return c.json({ ...cached, cached: true });

  try {
    const res = await fetch(`https://api.virushee.com/check/hash?hash=${encodeURIComponent(hash)}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });

    if (res.status === 404) {
      const body = { hash, found: false, generated_at: new Date().toISOString(), cached: false };
      if (c.env.KV_CACHE) c.executionCtx.waitUntil(kvBackedPut(c.env.KV_CACHE, cacheKey, body, CACHE_TTL));
      return c.json(body);
    }
    if (!res.ok) return badGateway(c, `Virushee upstream ${res.status}`);

    const data = await res.json();
    const body = { hash, results: data, generated_at: new Date().toISOString(), cached: false };

    if (c.env.KV_CACHE) c.executionCtx.waitUntil(kvBackedPut(c.env.KV_CACHE, cacheKey, body, CACHE_TTL));
    return c.json(body);
  } catch (e) {
    logError('handler failed', e);
    return badGateway(c, e instanceof Error ? e.message : 'Virushee unreachable');
  }
});
