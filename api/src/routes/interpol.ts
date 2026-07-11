import { Hono } from 'hono';
import type { Env } from '../env';

const CACHE_TTL = 3600;

export const interpolRouter = new Hono<{ Bindings: Env }>();

interpolRouter.get('/interpol/red-notices', async (c) => {
  const name = c.req.query('name');
  const forename = c.req.query('forename');
  const nationality = c.req.query('nationality');
  const sex = c.req.query('sex');
  const ageMin = c.req.query('ageMin');
  const ageMax = c.req.query('ageMax');
  const page = Number(c.req.query('page')) || 1;

  const cacheKey = `interpol:red:${name ?? ''}:${forename ?? ''}:${nationality ?? ''}:${page}`;
  const cached = await c.env.KV_CACHE?.get(cacheKey, 'json');
  if (cached) return c.json({ ...(cached as object), cached: true });

  try {
    const params = new URLSearchParams();
    if (name) params.set('name', name);
    if (forename) params.set('forename', forename);
    if (nationality) params.set('nationality', nationality);
    if (sex) params.set('sex', sex);
    if (ageMin) params.set('ageMin', ageMin);
    if (ageMax) params.set('ageMax', ageMax);
    params.set('page', String(page));

    const url = `https://ws-public.interpol.int/notices/v1/red?${params.toString()}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return c.json({ error: `Interpol upstream ${res.status}` }, 502);

    const data = await res.json();
    const body = {
      query: { name, forename, nationality },
      results: data,
      generated_at: new Date().toISOString(),
      cached: false,
    };

    if (c.env.KV_CACHE)
      c.executionCtx.waitUntil(c.env.KV_CACHE.put(cacheKey, JSON.stringify(body), { expirationTtl: CACHE_TTL }));
    return c.json(body);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'Interpol API unreachable' }, 502);
  }
});

interpolRouter.get('/interpol/red-notices/:noticeId', async (c) => {
  const noticeId = c.req.param('noticeId');
  if (!noticeId) return c.json({ error: 'noticeId parameter required' }, 400);

  try {
    const res = await fetch(`https://ws-public.interpol.int/notices/v1/red/${encodeURIComponent(noticeId)}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });

    if (res.status === 404) return c.json({ error: 'notice not found' }, 404);
    if (!res.ok) return c.json({ error: `Interpol upstream ${res.status}` }, 502);

    const data = await res.json();
    return c.json({ notice: data, generated_at: new Date().toISOString() });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'Interpol API unreachable' }, 502);
  }
});
