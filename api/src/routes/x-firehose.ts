import type { Context } from 'hono';
import type { Env } from '../env';
import {
  fetchAuthedTimeline,
  readAuthCookies,
  XAuthMissingError,
  XAuthInvalidError,
  XAuthRateLimitedError,
  type AuthedTimelineResponse,
} from '../lib/twitter-auth-graphql';

/**
 * X (Twitter) firehose handler.
 *
 *   GET /api/v1/x-firehose?handle=briankrebs[&count=20][&since_days=7][&include_replies=0][&include_pinned=0]
 *   GET /api/v1/x-firehose?status
 *
 * Stale-fallback uses the Cloudflare Cache API (caches.default) instead
 * of KV — same effective behaviour for the analyst (an old payload is
 * returned on transient upstream failure) but zero against the KV
 * write quota. Cache API entries persist at the colo level long enough
 * to absorb day-scale outages without consuming durable storage.
 */

const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;
const STALE_CACHE_TTL_SECONDS = 7 * 24 * 3600;

function staleCacheKey(handle: string): Request {
  return new Request(`https://x-firehose-stale.internal/v1?h=${handle.toLowerCase()}`);
}

export async function xFirehoseHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  // Status probe — let the FE check service availability without
  // attempting a fetch first.
  if (c.req.query('status') !== undefined) {
    try {
      readAuthCookies(c.env);
      return c.json({ ok: true, configured: true });
    } catch (_catchErr) {
      console.error('xFirehoseHandler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
      return c.json({ ok: false, configured: false, reason: 'service unavailable' }, 200);
    }
  }

  const handleRaw = (c.req.query('handle') ?? '').trim().replace(/^@/, '');
  if (!HANDLE_RE.test(handleRaw)) {
    return c.json({ error: 'invalid handle (1-15 chars, A-Za-z0-9_)' }, 400);
  }

  const countRaw = Number(c.req.query('count') ?? '25');
  const count = Number.isFinite(countRaw) ? Math.max(5, Math.min(40, Math.floor(countRaw))) : 25;
  const sinceDaysRaw = Number(c.req.query('since_days') ?? '7');
  const sinceDays = Number.isFinite(sinceDaysRaw) ? Math.max(1, Math.min(90, Math.floor(sinceDaysRaw))) : 7;
  const includePinned = c.req.query('include_pinned') === '1';
  const includeReplies = c.req.query('include_replies') === '1';

  const edgeCache = (caches as unknown as { default: Cache }).default;
  const staleKey = staleCacheKey(handleRaw);

  try {
    const body = await fetchAuthedTimeline(c.env, handleRaw, {
      count,
      sinceDays,
      includePinned,
      includeReplies,
    });
    // Stale-fallback warm — write to the Cache API (free, no KV quota).
    // Gated to user-initiated VIEW calls (count >= 15); probe calls
    // (count=5) skip the warm to keep the write storm down.
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
    return c.json(body, 200, { 'cache-control': 'public, max-age=600, s-maxage=1800' });
  } catch (err) {
    console.error('handler failed:', err instanceof Error ? err.message : String(err));
    if (err instanceof XAuthMissingError) {
      return c.json({ error: 'service unavailable', configured: false }, 503);
    }
    if (err instanceof XAuthRateLimitedError) {
      // Serve the stale Cache API entry, if any. Better an old payload
      // than a hard error during a transient rate-limit.
      try {
        const stale = await edgeCache.match(staleKey);
        if (stale) {
          const parsed = (await stale.json()) as AuthedTimelineResponse;
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
