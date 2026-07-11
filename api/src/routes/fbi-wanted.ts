import { Hono } from 'hono';
import type { Env } from '../env';

const CACHE_TTL = 3600;

export const fbiWantedRouter = new Hono<{ Bindings: Env }>();

fbiWantedRouter.get('/fbi-wanted/search', async (c) => {
  const q = c.req.query('q');
  if (!q || q.length > 200) return c.json({ error: 'q parameter required (max 200 chars)' }, 400);

  const cacheKey = `fbi:wanted:${q}`;
  const cached = await c.env.KV_CACHE?.get(cacheKey, 'json');
  if (cached) return c.json({ ...(cached as object), cached: true });

  try {
    const res = await fetch(`https://api.fbi.gov/wanted/v1/list?title=${encodeURIComponent(q)}&pageSize=20`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return c.json({ error: `FBI upstream ${res.status}` }, 502);

    const data = await res.json();
    const body = { query: q, results: data, generated_at: new Date().toISOString(), cached: false };

    if (c.env.KV_CACHE)
      c.executionCtx.waitUntil(c.env.KV_CACHE.put(cacheKey, JSON.stringify(body), { expirationTtl: CACHE_TTL }));
    return c.json(body);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'FBI API unreachable' }, 502);
  }
});

fbiWantedRouter.get('/fbi-wanted/list', async (c) => {
  const page = Number(c.req.query('page')) || 1;
  const pageSize = Math.min(Number(c.req.query('pageSize')) || 20, 50);
  const fieldOffice = c.req.query('field_office');

  const cacheKey = `fbi:wanted:list:${page}:${pageSize}:${fieldOffice ?? ''}`;
  const cached = await c.env.KV_CACHE?.get(cacheKey, 'json');
  if (cached) return c.json({ ...(cached as object), cached: true });

  try {
    let url = `https://api.fbi.gov/wanted/v1/list?page=${page}&pageSize=${pageSize}`;
    if (fieldOffice) url += `&field_offices=${encodeURIComponent(fieldOffice)}`;

    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return c.json({ error: `FBI upstream ${res.status}` }, 502);

    const data = await res.json();
    const body = {
      page,
      pageSize,
      field_office: fieldOffice,
      results: data,
      generated_at: new Date().toISOString(),
      cached: false,
    };

    if (c.env.KV_CACHE)
      c.executionCtx.waitUntil(c.env.KV_CACHE.put(cacheKey, JSON.stringify(body), { expirationTtl: CACHE_TTL }));
    return c.json(body);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'FBI API unreachable' }, 502);
  }
});
