import type { Context } from 'hono';
import type { Env } from '../env';
import {
  fetchSearchTimeline,
  readAuthCookies,
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
      readAuthCookies(c.env);
      return c.json({ ok: true, configured: true });
    } catch (_catchErr) {
      console.error('xSearchHandler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
      return c.json({ ok: false, configured: false, reason: 'service unavailable' }, 200);
    }
  }

  const query = (c.req.query('q') ?? '').trim();
  if (!query) {
    return c.json({ error: 'missing required query parameter: q' }, 400);
  }
  if (query.length > MAX_QUERY_LEN) {
    return c.json({ error: `query too long (max ${MAX_QUERY_LEN} chars)` }, 400);
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
    console.error('handler failed:', err instanceof Error ? err.message : String(err));
    if (err instanceof XAuthMissingError) {
      return c.json({ error: 'service unavailable', configured: false }, 503);
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
        console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
        /* fall through */
      }
      return c.json({ error: 'rate-limited', retry_after: err.retryAfter ?? 'unknown' }, 429);
    }
    if (err instanceof XAuthInvalidError) {
      return c.json({ error: 'service unavailable', status: err.status }, 401);
    }
    return c.json({ error: 'upstream error' }, 502);
  }
}
