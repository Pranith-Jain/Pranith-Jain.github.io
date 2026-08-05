import type { Context } from 'hono';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { badRequest, notFound, internalError, badGateway, serviceUnavailable, unauthorized, forbidden, tooManyRequests } from '../lib/api-error';
import {
  fetchSearchTimeline,
  resolveAuthCookies,
  XAuthMissingError,
  XAuthInvalidError,
  XAuthRateLimitedError,
  type SearchTimelineResponse,
} from '../lib/twitter-auth-graphql';

/**
 * X (Twitter) keyword search — no login required for end-users.
 *
 *   GET /api/v1/x-search?q=keyword[&count=20][&product=Latest][&status]
 *
 * The operator's X_AUTH_TOKEN + X_CT0 cookies authenticate server-side.
 * End-users search freely without a Twitter account.
 *
 * `product` controls the search tab:
 *   - Latest (default) — reverse-chronological
 *   - Top — relevance-ranked
 *   - Media — photos and videos only
 *
 * Stale-fallback uses Cloudflare Cache API (caches.default) — zero KV
 * quota. Same resilience pattern as x-firehose.ts.
 */

const MAX_QUERY_LEN = 500;
const STALE_CACHE_TTL_SECONDS = 7 * 24 * 3600;
const VALID_PRODUCTS = new Set(['Latest', 'Top', 'Media']);

function staleCacheKey(q: string, product: string): Request {
  return new Request(`https://x-search-stale.internal/v1?q=${encodeURIComponent(q.toLowerCase())}&p=${product}`);
}

export async function xSearchHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  // Status probe — let the FE check service availability.
  if (c.req.query('status') !== undefined) {
    try {
      await resolveAuthCookies(c.env);
      return c.json({ ok: true, configured: true });
    } catch (_catchErr) {
      logError('xSearchHandler failed', _catchErr);
      return c.json({ ok: false, configured: false, reason: 'service unavailable' }, 200);
    }
  }

  const query = (c.req.query('q') ?? '').trim();
  if (!query) {
    return badRequest(c, 'missing required query parameter: q');
  }
  if (query.length > MAX_QUERY_LEN) {
    return badRequest(c, `query too long (max ${MAX_QUERY_LEN} chars)`);
  }

  const countRaw = Number(c.req.query('count') ?? '20');
  const count = Number.isFinite(countRaw) ? Math.max(5, Math.min(40, Math.floor(countRaw))) : 20;

  const productRaw = (c.req.query('product') ?? 'Latest').trim();
  const product = VALID_PRODUCTS.has(productRaw) ? (productRaw as 'Latest' | 'Top' | 'Media') : 'Latest';

  const edgeCache = (caches as unknown as { default: Cache }).default;
  const staleKey = staleCacheKey(query, product);

  try {
    const body = await fetchSearchTimeline(c.env, query, { count, product });
    // Stale-fallback warm — gated to user-initiated views (count >= 10).
    if (!body.cached && body.items.length > 0 && count >= 10) {
      const cacheable = new Response(JSON.stringify(body), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'cache-control': `public, max-age=${STALE_CACHE_TTL_SECONDS}, s-maxage=${STALE_CACHE_TTL_SECONDS}`,
        },
      });
      c.executionCtx.waitUntil(edgeCache.put(staleKey, cacheable).catch(() => undefined));
    }
    return c.json(body, 200, { 'cache-control': 'public, max-age=300, s-maxage=900' });
  } catch (err) {
    logError('handler failed', err);
    if (err instanceof XAuthMissingError) {
      return serviceUnavailable(c, 'service unavailable');
    }
    if (err instanceof XAuthRateLimitedError) {
      try {
        const stale = await edgeCache.match(staleKey);
        if (stale) {
          const parsed = (await stale.json()) as SearchTimelineResponse;
          return c.json({ ...parsed, stale: true, upstream_error: 'rate-limited' }, 200, {
            'cache-control': 'public, max-age=300',
          });
        }
      } catch (_catchErr) {
        logError('handler failed', _catchErr);
        /* fall through */
      }
      return tooManyRequests(c, 'rate-limited', { windowSeconds: 60 });
    }
    if (err instanceof XAuthInvalidError) {
      return unauthorized(c, 'service unavailable');
    }
    return badGateway(c, 'upstream error');
  }
}
