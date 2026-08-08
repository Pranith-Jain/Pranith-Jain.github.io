import type { Context } from 'hono';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { badRequest, badGateway } from '../lib/api-error';
import { fetchResilient } from '../lib/fetch-resilient';

const ORKL_BASE = 'https://orkl.eu/api/v1';
const CACHE_TTL = 600;

interface OrklApiResponse {
  status: string;
  message?: string;
  data: unknown;
}

export async function orklSearchHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const query = (c.req.query('query') ?? '').trim();
  if (!query) return badRequest(c, 'query parameter required');

  const limit = Math.min(Math.max(1, parseInt(c.req.query('limit') ?? '20', 10) || 20), 50);
  const full = c.req.query('full') === 'true';

  const cache = caches.default;
  const cacheKey = `https://orkl-cache.internal/search/${encodeURIComponent(query)}/${limit}/${full}`;
  const cached = await cache.match(new Request(cacheKey));
  if (cached) return new Response(cached.body, cached);

  try {
    const url = `${ORKL_BASE}/library/search?query=${encodeURIComponent(query)}&limit=${limit}${full ? '&full=true' : ''}`;
    const res = await fetchResilient(
      url,
      { headers: { accept: 'application/json', 'user-agent': 'pranithjain-dfir/1.0' } },
      { attempts: 2, timeoutMs: 10_000 }
    );
    if (!res.ok) return badGateway(c, `orkl upstream ${res.status}`);
    const body = (await res.json()) as OrklApiResponse;
    const response = new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${CACHE_TTL}` },
    });
    c.executionCtx.waitUntil(cache.put(new Request(cacheKey), response.clone()));
    return response;
  } catch (e) {
    logError('orklSearchHandler failed', e);
    return badGateway(c, e instanceof Error ? e.message : 'orkl unreachable');
  }
}

export async function orklEntryHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const uuid = c.req.param('uuid') ?? '';
  if (!uuid || !/^[0-9a-f-]{36}$/i.test(uuid)) return badRequest(c, 'valid uuid parameter required');

  const cache = caches.default;
  const cacheKey = `https://orkl-cache.internal/entry/${uuid}`;
  const cached = await cache.match(new Request(cacheKey));
  if (cached) return new Response(cached.body, cached);

  try {
    const res = await fetchResilient(
      `${ORKL_BASE}/library/entry/${encodeURIComponent(uuid)}`,
      { headers: { accept: 'application/json', 'user-agent': 'pranithjain-dfir/1.0' } },
      { attempts: 2, timeoutMs: 10_000 }
    );
    if (!res.ok) return badGateway(c, `orkl upstream ${res.status}`);
    const body = (await res.json()) as OrklApiResponse;
    const response = new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${CACHE_TTL}` },
    });
    c.executionCtx.waitUntil(cache.put(new Request(cacheKey), response.clone()));
    return response;
  } catch (e) {
    logError('orklEntryHandler failed', e);
    return badGateway(c, e instanceof Error ? e.message : 'orkl unreachable');
  }
}

export async function orklInfoHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const cache = caches.default;
  const cacheKey = 'https://orkl-cache.internal/info';
  const cached = await cache.match(new Request(cacheKey));
  if (cached) return new Response(cached.body, cached);

  try {
    const res = await fetchResilient(
      `${ORKL_BASE}/library/info`,
      { headers: { accept: 'application/json', 'user-agent': 'pranithjain-dfir/1.0' } },
      { attempts: 2, timeoutMs: 10_000 }
    );
    if (!res.ok) return badGateway(c, `orkl upstream ${res.status}`);
    const body = (await res.json()) as OrklApiResponse;
    const response = new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${CACHE_TTL}` },
    });
    c.executionCtx.waitUntil(cache.put(new Request(cacheKey), response.clone()));
    return response;
  } catch (e) {
    logError('orklInfoHandler failed', e);
    return badGateway(c, e instanceof Error ? e.message : 'orkl unreachable');
  }
}
