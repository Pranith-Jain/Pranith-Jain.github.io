import type { Context } from 'hono';
import type { Env } from '../env';
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
  if (!query) return c.json({ error: 'query parameter required' }, 400, { 'cache-control': 'no-store' });

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
    if (!res.ok) return c.json({ error: `orkl upstream ${res.status}` }, 502, { 'cache-control': 'no-store' });
    const body = (await res.json()) as OrklApiResponse;
    const response = new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${CACHE_TTL}` },
    });
    c.executionCtx.waitUntil(cache.put(new Request(cacheKey), response.clone()));
    return response;
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'orkl unreachable' }, 502, {
      'cache-control': 'no-store',
    });
  }
}

export async function orklEntryHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const uuid = c.req.param('uuid') ?? '';
  if (!uuid || !/^[0-9a-f-]{36}$/i.test(uuid))
    return c.json({ error: 'valid uuid parameter required' }, 400, { 'cache-control': 'no-store' });

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
    if (!res.ok) return c.json({ error: `orkl upstream ${res.status}` }, 502, { 'cache-control': 'no-store' });
    const body = (await res.json()) as OrklApiResponse;
    const response = new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${CACHE_TTL}` },
    });
    c.executionCtx.waitUntil(cache.put(new Request(cacheKey), response.clone()));
    return response;
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'orkl unreachable' }, 502, {
      'cache-control': 'no-store',
    });
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
    if (!res.ok) return c.json({ error: `orkl upstream ${res.status}` }, 502, { 'cache-control': 'no-store' });
    const body = (await res.json()) as OrklApiResponse;
    const response = new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${CACHE_TTL}` },
    });
    c.executionCtx.waitUntil(cache.put(new Request(cacheKey), response.clone()));
    return response;
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'orkl unreachable' }, 502, {
      'cache-control': 'no-store',
    });
  }
}
