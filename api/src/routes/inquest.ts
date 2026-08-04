import type { Context } from 'hono';
import type { Env } from '../env';
import { badRequest, notFound, internalError, badGateway, serviceUnavailable, tooManyRequests, conflict, payloadTooLarge } from '../lib/api-error';

const CACHE_TTL_SECONDS = 3600;

export async function inquestSearchHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const q = c.req.query('q');
  if (!q || q.length > 200) return badRequest(c, 'q parameter required (max 200)');

  const cacheKey = `https://inquest-cache.internal/v1-${encodeURIComponent(q)}`;
  const cacheReq = new Request(cacheKey);
  const cached = await caches.default.match(cacheReq);
  if (cached) return new Response(cached.body, cached);

  try {
    const res = await fetch(`https://labs.inquest.net/api/iocdb/search?keyword=${encodeURIComponent(q)}`, {
      headers: { accept: 'application/json', 'user-agent': 'pranithjain.qzz.io DFIR toolkit' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return badGateway(c, `InQuest upstream ${res.status}`);

    const data = (await res.json()) as { data?: unknown };
    const rawResults = data?.data ?? [];
    const results = Array.isArray(rawResults) ? rawResults.slice(0, 100) : [];
    const body = JSON.stringify({ count: results.length, results, generated_at: new Date().toISOString() });
    const response = new Response(body, {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${CACHE_TTL_SECONDS}` },
    });
    c.executionCtx.waitUntil(caches.default.put(cacheReq, response.clone()));
    return response;
  } catch (e) {
    console.error('inquestSearchHandler failed:', e instanceof Error ? e.message : String(e));
    return badGateway(c, e instanceof Error ? e.message : 'InQuest unreachable');
  }
}
