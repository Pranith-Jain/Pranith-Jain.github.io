import { Hono } from 'hono';
import type { Env } from '../env';

const CACHE_TTL = 600;

export const fullhuntRouter = new Hono<{ Bindings: Env }>();

fullhuntRouter.get('/fullhunt/domain', async (c) => {
  const domain = c.req.query('domain');
  if (!domain) return c.json({ error: 'domain parameter required' }, 400);

  const key = c.env.FULLHUNT_API_KEY;
  if (!key) {
    return c.json({ error: 'FULLHUNT_API_KEY not configured', docs: 'wrangler secret put FULLHUNT_API_KEY' }, 503);
  }

  const cacheKey = `fullhunt:domain:${domain}`;
  const cached = await c.env.KV_CACHE?.get(cacheKey, 'json');
  if (cached) return c.json({ ...(cached as object), cached: true });

  try {
    const res = await fetch(`https://api.fullhunt.io/api/v1/domain/${encodeURIComponent(domain)}/details`, {
      headers: { 'X-API-Key': key, Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });

    if (res.status === 401 || res.status === 403) {
      return c.json({ error: 'FullHunt API key rejected — check FULLHUNT_API_KEY' }, 502);
    }
    if (!res.ok) return c.json({ error: `FullHunt upstream ${res.status}` }, 502);

    const data = await res.json();
    const body = { domain, results: data, generated_at: new Date().toISOString(), cached: false };

    if (c.env.KV_CACHE) {
      c.executionCtx.waitUntil(c.env.KV_CACHE.put(cacheKey, JSON.stringify(body), { expirationTtl: CACHE_TTL }));
    }
    return c.json(body);
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return c.json({ error: e instanceof Error ? e.message : 'FullHunt unreachable' }, 502);
  }
});

fullhuntRouter.get('/fullhunt/host', async (c) => {
  const host = c.req.query('host');
  if (!host) return c.json({ error: 'host parameter required' }, 400);

  const key = c.env.FULLHUNT_API_KEY;
  if (!key) return c.json({ error: 'FULLHUNT_API_KEY not configured' }, 503);

  try {
    const res = await fetch(`https://api.fullhunt.io/api/v1/host/${encodeURIComponent(host)}`, {
      headers: { 'X-API-Key': key, Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return c.json({ error: `FullHunt upstream ${res.status}` }, 502);
    const data = await res.json();
    return c.json({ host, results: data, generated_at: new Date().toISOString() });
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return c.json({ error: e instanceof Error ? e.message : 'FullHunt unreachable' }, 502);
  }
});

fullhuntRouter.get('/fullhunt/subdomains', async (c) => {
  const domain = c.req.query('domain');
  if (!domain) return c.json({ error: 'domain parameter required' }, 400);

  const key = c.env.FULLHUNT_API_KEY;
  if (!key) return c.json({ error: 'FULLHUNT_API_KEY not configured' }, 503);

  try {
    const res = await fetch(`https://api.fullhunt.io/api/v1/domain/${encodeURIComponent(domain)}/subdomains`, {
      headers: { 'X-API-Key': key, Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return c.json({ error: `FullHunt upstream ${res.status}` }, 502);
    const data = await res.json();
    return c.json({ domain, results: data, generated_at: new Date().toISOString() });
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return c.json({ error: e instanceof Error ? e.message : 'FullHunt unreachable' }, 502);
  }
});
