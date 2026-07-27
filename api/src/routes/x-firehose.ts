import type { Context } from 'hono';
import type { Env } from '../env';
import {
  fetchAuthedTimeline,
  resolveAuthCookies,
  checkXHealth,
  XAuthMissingError,
  XAuthInvalidError,
  XAuthRateLimitedError,
  type AuthedTimelineResponse,
} from '../lib/twitter-auth-graphql';

const PROBE_BATCH_MAX = 80;
const PROBE_STAGGER_MS = 350;

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
    // Deep probe: live canary fetch that classifies auth + query-ID health.
    // Opt-in (?status=deep) so the cheap config-only probe stays the default
    // for the XWatch mount check and adds no upstream rate-limit pressure.
    if (c.req.query('status') === 'deep') {
      const health = await checkXHealth(c.env);
      const ok = health.auth === 'ok' && health.qids !== 'stale';
      return c.json({ ok, configured: health.auth !== 'missing', ...health }, 200, { 'cache-control': 'no-store' });
    }
    try {
      await resolveAuthCookies(c.env);
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

interface ProbeResult {
  count: number;
  status: 'ok' | 'rate_limited' | 'error' | 'not_found';
}

/**
 * Batch probe — checks activity for many handles in one request,
 * staggering upstream calls to avoid tripping X's per-IP rate limit.
 *
 *   POST /api/v1/x-firehose/probe-batch
 *   Body: { handles: string[], since_days?: number }
 *   Response: { results: Record<string, ProbeResult>, elapsed_ms: number }
 */
export async function xFirehoseProbeBatchHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  let body: { handles?: string[]; since_days?: number };
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400);
  }

  const handles = (body.handles ?? []).filter((h) => HANDLE_RE.test(h)).slice(0, PROBE_BATCH_MAX);
  if (handles.length === 0) return c.json({ error: 'no valid handles' }, 400);

  const sinceDays = Number.isFinite(body.since_days) ? Math.max(1, Math.min(90, Math.floor(body.since_days!))) : 7;
  const edgeCache = (caches as unknown as { default: Cache }).default;
  const results: Record<string, ProbeResult> = {};
  const start = Date.now();

  for (let i = 0; i < handles.length; i++) {
    const h = handles[i]!;
    if (i > 0) await new Promise((r) => setTimeout(r, PROBE_STAGGER_MS));

    const staleKey = staleCacheKey(h);
    try {
      const res = await fetchAuthedTimeline(c.env, h, { count: 5, sinceDays, includePinned: false, includeReplies: false });
      results[h] = { count: res.items.length, status: 'ok' };
      if (res.items.length > 0) {
        const cacheable = new Response(JSON.stringify(res), {
          status: 200,
          headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${STALE_CACHE_TTL_SECONDS}` },
        });
        c.executionCtx.waitUntil(edgeCache.put(staleKey, cacheable).catch(() => undefined));
      }
    } catch (err) {
      if (err instanceof XAuthRateLimitedError) {
        try {
          const stale = await edgeCache.match(staleKey);
          if (stale) {
            const parsed = (await stale.json()) as AuthedTimelineResponse;
            results[h] = { count: parsed.items?.length ?? 0, status: 'ok' };
            continue;
          }
        } catch { /* fall through */ }
        results[h] = { count: 0, status: 'rate_limited' };
        for (let j = i + 1; j < handles.length; j++) {
          results[handles[j]!] = { count: 0, status: 'rate_limited' };
        }
        break;
      }
      if (err instanceof XAuthMissingError || err instanceof XAuthInvalidError) {
        for (let j = i; j < handles.length; j++) {
          results[handles[j]!] = { count: 0, status: 'error' };
        }
        break;
      }
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('no result') || msg.includes('could not resolve')) {
        results[h] = { count: 0, status: 'not_found' };
      } else {
        results[h] = { count: 0, status: 'error' };
      }
    }
  }

  return c.json({ results, elapsed_ms: Date.now() - start }, 200, {
    'cache-control': 'public, max-age=300, s-maxage=600',
  });
}
