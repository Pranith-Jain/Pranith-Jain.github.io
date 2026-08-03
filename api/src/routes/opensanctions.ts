import { Hono } from 'hono';
import type { Env } from '../env';
import { kvBackedGet, kvBackedPut } from '../lib/route-cache';

const CACHE_TTL = 1800;

export const opensanctionsRouter = new Hono<{ Bindings: Env }>();

opensanctionsRouter.get('/opensanctions/search', async (c) => {
  const q = c.req.query('q');
  const limit = Math.min(Number(c.req.query('limit')) || 20, 100);

  if (!q || q.length > 500) return c.json({ error: 'q parameter required (max 500 chars)' }, 400);

  const cacheKey = `opensanctions:search:${q}:${limit}`;
  const { value: cached } = await kvBackedGet<Record<string, unknown>>(c.env.KV_CACHE, cacheKey, CACHE_TTL);
  if (cached) return c.json({ ...cached, cached: true });

  try {
    const url = `https://api.opensanctions.org/search/default?q=${encodeURIComponent(q)}&limit=${limit}`;
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'pranithjain-threatintel/1.0',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return c.json({ error: `OpenSanctions upstream ${res.status}` }, 502);

    const data = await res.json();
    const body = { query: q, results: data, generated_at: new Date().toISOString(), cached: false };

    if (c.env.KV_CACHE) c.executionCtx.waitUntil(kvBackedPut(c.env.KV_CACHE, cacheKey, body, CACHE_TTL));
    return c.json(body);
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return c.json({ error: e instanceof Error ? e.message : 'OpenSanctions unreachable' }, 502);
  }
});

opensanctionsRouter.get('/opensanctions/entity', async (c) => {
  const id = c.req.query('id');
  if (!id) return c.json({ error: 'id parameter required' }, 400);

  try {
    const res = await fetch(`https://api.opensanctions.org/entities/${encodeURIComponent(id)}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'pranithjain-threatintel/1.0',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (res.status === 404) return c.json({ error: 'entity not found' }, 404);
    if (!res.ok) return c.json({ error: `OpenSanctions upstream ${res.status}` }, 502);

    const data = await res.json();
    return c.json({ entity: data, generated_at: new Date().toISOString() });
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return c.json({ error: e instanceof Error ? e.message : 'OpenSanctions unreachable' }, 502);
  }
});

opensanctionsRouter.get('/opensanctions/stats', async (c) => {
  const cacheKey = 'opensanctions:stats';
  const { value: cached } = await kvBackedGet<Record<string, unknown>>(c.env.KV_CACHE, cacheKey, 3600);
  if (cached) return c.json({ ...cached, cached: true });

  try {
    const res = await fetch('https://api.opensanctions.org/statistics', {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'pranithjain-threatintel/1.0',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return c.json({ error: `OpenSanctions upstream ${res.status}` }, 502);

    const data = await res.json();
    const body = { statistics: data, generated_at: new Date().toISOString(), cached: false };

    if (c.env.KV_CACHE) {
      c.executionCtx.waitUntil(kvBackedPut(c.env.KV_CACHE, cacheKey, body, 3600));
    }
    return c.json(body);
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return c.json({ error: e instanceof Error ? e.message : 'OpenSanctions unreachable' }, 502);
  }
});
