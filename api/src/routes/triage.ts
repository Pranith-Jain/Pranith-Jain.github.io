import type { Context } from 'hono';
import type { Env } from '../env';
import { badRequest, notFound, internalError, badGateway, serviceUnavailable, tooManyRequests } from '../lib/api-error';

const CACHE_TTL_SECONDS = 3600;

export async function triageSearchHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const q = c.req.query('q');
  if (!q || q.length > 500) return badRequest(c, 'q parameter required (max 500)');

  const apiKey = c.env.TRIAGE_API_KEY;
  if (!apiKey) return serviceUnavailable(c, 'TRIAGE_API_KEY not configured');

  const cacheKey = `https://triage-cache.internal/v1-${encodeURIComponent(q)}`;
  const cacheReq = new Request(cacheKey);
  const cached = await caches.default.match(cacheReq);
  if (cached) return new Response(cached.body, cached);

  try {
    const res = await fetch(`https://api.tria.ge/v0/search?query=${encodeURIComponent(q)}`, {
      headers: { accept: 'application/json', authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return badGateway(c, `Triage upstream ${res.status}`);

    const data = (await res.json()) as { data?: unknown; results?: unknown; analyses?: unknown };
    const results = data?.data ?? data?.results ?? data?.analyses ?? [];
    const body = JSON.stringify({
      count: Array.isArray(results) ? results.length : 0,
      results,
      generated_at: new Date().toISOString(),
    });
    const response = new Response(body, {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${CACHE_TTL_SECONDS}` },
    });
    c.executionCtx.waitUntil(caches.default.put(cacheReq, response.clone()));
    return response;
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return badGateway(c, e instanceof Error ? e.message : 'Triage unreachable');
  }
}
