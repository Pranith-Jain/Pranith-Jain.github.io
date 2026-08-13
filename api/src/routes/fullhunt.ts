import { Hono } from 'hono';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { badRequest, badGateway, serviceUnavailable } from '../lib/api-error';
import { routeCacheGet, routeCachePut } from '../lib/route-cache';

const CACHE_TTL = 600;

export const fullhuntRouter = new Hono<{ Bindings: Env }>();

fullhuntRouter.get('/fullhunt/domain', async (c) => {
  const domain = c.req.query('domain');
  if (!domain) return badRequest(c, 'domain parameter required');

  const key = c.env.FULLHUNT_API_KEY;
  if (!key) {
    return serviceUnavailable(c, 'FULLHUNT_API_KEY not configured (wrangler secret put FULLHUNT_API_KEY)');
  }

  const cacheKey = `fullhunt:domain:${domain}`;
  const cached = await routeCacheGet<object>(cacheKey);
  if (cached) return c.json({ ...cached, cached: true });

  try {
    const res = await fetch(`https://fullhunt.io/api/v1/domain/${encodeURIComponent(domain)}/details`, {
      headers: { 'X-API-Key': key, Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });

    if (res.status === 401 || res.status === 403) {
      return badGateway(c, 'FullHunt API key rejected — check FULLHUNT_API_KEY');
    }
    if (!res.ok) return badGateway(c, `FullHunt upstream ${res.status}`);

    const data = await res.json();
    const body = { domain, results: data, generated_at: new Date().toISOString(), cached: false };

    c.executionCtx.waitUntil(routeCachePut(cacheKey, body, CACHE_TTL));
    return c.json(body);
  } catch (e) {
    logError('handler failed', e);
    return badGateway(c, e instanceof Error ? e.message : 'FullHunt unreachable');
  }
});

fullhuntRouter.get('/fullhunt/host', async (c) => {
  const host = c.req.query('host');
  if (!host) return badRequest(c, 'host parameter required');

  const key = c.env.FULLHUNT_API_KEY;
  if (!key) return serviceUnavailable(c, 'FULLHUNT_API_KEY not configured');

  try {
    const res = await fetch(`https://fullhunt.io/api/v1/host/${encodeURIComponent(host)}`, {
      headers: { 'X-API-Key': key, Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return badGateway(c, `FullHunt upstream ${res.status}`);
    const data = await res.json();
    return c.json({ host, results: data, generated_at: new Date().toISOString() });
  } catch (e) {
    logError('handler failed', e);
    return badGateway(c, e instanceof Error ? e.message : 'FullHunt unreachable');
  }
});

fullhuntRouter.get('/fullhunt/subdomains', async (c) => {
  const domain = c.req.query('domain');
  if (!domain) return badRequest(c, 'domain parameter required');

  const key = c.env.FULLHUNT_API_KEY;
  if (!key) return serviceUnavailable(c, 'FULLHUNT_API_KEY not configured');

  try {
    const res = await fetch(`https://fullhunt.io/api/v1/domain/${encodeURIComponent(domain)}/subdomains`, {
      headers: { 'X-API-Key': key, Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return badGateway(c, `FullHunt upstream ${res.status}`);
    const data = await res.json();
    return c.json({ domain, results: data, generated_at: new Date().toISOString() });
  } catch (e) {
    logError('handler failed', e);
    return badGateway(c, e instanceof Error ? e.message : 'FullHunt unreachable');
  }
});
