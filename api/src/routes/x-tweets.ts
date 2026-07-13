import type { Context } from 'hono';
import type { Env } from '../env';
import { fetchUserTimeline, TwitterRateLimited, type TwitterTimelineResponse } from '../lib/twitter-graphql';

/**
 * X (Twitter) tweets — anonymous path (highlights, not chronological).
 *
 *   GET /api/v1/x-tweets?handle=briankrebs[&count=20]
 *
 * Stale-fallback uses caches.default (no KV quota). User-initiated view
 * calls (count >= 15) warm the cache; probe calls (count=5) skip it to
 * keep the write storm down.
 */

const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;
const STALE_CACHE_TTL_SECONDS = 7 * 24 * 3600;

function staleCacheKey(handle: string): Request {
  return new Request(`https://x-tweets-stale.internal/v1?h=${handle.toLowerCase()}`);
}

export async function xTweetsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const handleRaw = (c.req.query('handle') ?? '').trim().replace(/^@/, '');
  if (!HANDLE_RE.test(handleRaw)) {
    return c.json({ error: 'invalid handle (1-15 chars, A-Za-z0-9_)' }, 400);
  }
  const countRaw = Number(c.req.query('count') ?? '40');
  const count = Number.isFinite(countRaw) ? Math.max(5, Math.min(40, Math.floor(countRaw))) : 40;
  const sinceDaysRaw = Number(c.req.query('since_days') ?? '7');
  const sinceDays = Number.isFinite(sinceDaysRaw) ? Math.max(1, Math.min(90, Math.floor(sinceDaysRaw))) : 7;
  const includePinned = c.req.query('include_pinned') === '1';

  const edgeCache = (caches as unknown as { default: Cache }).default;
  const staleKey = staleCacheKey(handleRaw);

  try {
    const body = await fetchUserTimeline(c.env, handleRaw, { count, sinceDays, includePinned });
    if (!body.cached && body.items.length > 0 && count >= 15) {
      const cacheable = new Response(JSON.stringify(body), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'cache-control': `public, max-age=${STALE_CACHE_TTL_SECONDS}, s-maxage=${STALE_CACHE_TTL_SECONDS}`,
        },
      });
      c.executionCtx.waitUntil(edgeCache.put(staleKey, cacheable).catch(() => undefined));
    }
    return c.json(body, 200, { 'cache-control': 'public, max-age=900, s-maxage=1800' });
  } catch (err) {
    console.error('xTweetsHandler failed:', err instanceof Error ? err.message : String(err));
    // Transient failure — try the Cache API stale entry. Better an old
    // payload than a hard error.
    try {
      const stale = await edgeCache.match(staleKey);
      if (stale) {
        const parsed = (await stale.json()) as TwitterTimelineResponse;
        return c.json({ ...parsed, stale: true, upstream_error: 'transient' }, 200, {
          'cache-control': 'public, max-age=300',
        });
      }
    } catch (_catchErr) {
      console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
      /* fall through */
    }
    if (err instanceof TwitterRateLimited) {
      return c.json({ error: 'rate-limited', retry_after: err.retryAfter }, 429);
    }
    return c.json({ error: 'upstream error' }, 502);
  }
}
