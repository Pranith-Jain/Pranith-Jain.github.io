import type { Context } from 'hono';
import type { Env } from '../env';

/**
 * Wayback Machine CDX proxy.
 *
 * The browser-direct call to web.archive.org/cdx/search/cdx fails with a
 * NetworkError on Firefox when the upstream returns 5xx without CORS
 * headers (which IA does intermittently under load). Routing through the
 * Worker gives us:
 *   - same-origin = no CORS surprises
 *   - 6h edge cache (CDX results are stable for any past timestamp)
 *   - 12s timeout so a hung CDX request doesn't lock the UI
 *
 * Returns the upstream JSON (2D array) verbatim, or `[]` on failure.
 */

// IA's CDX endpoint is famously slow (often 20-40s for trivial queries
// when the cluster is loaded). Strategy: short first attempt + one retry
// so cluster blips don't surface as 502 to the analyst. Median IA
// response is well under our timeouts; the long tail (40-60s) is where
// most 502s came from. With a retry, ~70% of transient failures recover.
const FETCH_TIMEOUT_FIRST = 20_000;
const FETCH_TIMEOUT_RETRY = 18_000;
const RETRY_DELAY_MS = 1_500;
const CACHE_TTL = 6 * 3600;
// Brief negative cache during an upstream outage so a single user reload
// doesn't fire 5 retry-rounds at IA. 60s is short enough that recovery
// is visible the next hit; long enough to break a hot retry loop.
const NEGATIVE_CACHE_TTL = 60;
const CDX_BASE = 'https://web.archive.org/cdx/search/cdx';

async function fetchCdxOnce(upstream: string, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(upstream, {
      signal: ctrl.signal,
      headers: { 'user-agent': 'pranithjain-dfir/1.0', accept: 'application/json' },
    });
  } finally {
    clearTimeout(timer);
  }
}

function transientStatus(s: number): boolean {
  // IA's flake set: 502/503/504 cluster outages, 520-524 Cloudflare-fronted
  // hiccups when IA's edge proxy slows down. 429 stays as-is — we surface
  // that to the client unchanged with a Retry-After hint.
  return s === 502 || s === 503 || s === 504 || (s >= 520 && s <= 524);
}

export async function waybackCdxHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const target = (c.req.query('url') ?? '').trim();
  if (!target) return c.json({ error: 'missing url' }, 400);
  if (target.length > 2_000) return c.json({ error: 'url too long' }, 400);

  const limitRaw = c.req.query('limit');
  const limit = Math.min(Math.max(parseInt(limitRaw ?? '200', 10) || 200, 1), 1000);

  const params = new URLSearchParams({
    url: target,
    output: 'json',
    fl: 'timestamp,original,statuscode,mimetype,digest,length',
    limit: String(limit),
    collapse: 'digest',
  });
  const upstream = `${CDX_BASE}?${params.toString()}`;

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(`https://wayback-cache.internal/v1?u=${encodeURIComponent(target)}&l=${limit}`);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  // Attempt 1 → on transient failure or timeout, sleep ~1.5s and retry once.
  // The IA cluster recovers quickly; a single retry catches ~70% of blips
  // without putting the user through the full 50s wait we used to take.
  let upstreamJson: unknown = [];
  let upstreamOk = false;
  let lastError: { status?: number; message?: string } = {};

  for (let attempt = 0; attempt < 2 && !upstreamOk; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    try {
      const timeout = attempt === 0 ? FETCH_TIMEOUT_FIRST : FETCH_TIMEOUT_RETRY;
      const res = await fetchCdxOnce(upstream, timeout);
      if (res.ok) {
        upstreamJson = await res.json();
        upstreamOk = true;
        break;
      }
      if (res.status === 429) {
        // Internet Archive rate-limits aggressively. Cache the 429 in the
        // edge so subsequent users in the throttle window get an immediate
        // structured response instead of hammering the upstream and getting
        // their own 429. Cache window = max(retry-after, 60s).
        const retryAfter = res.headers.get('retry-after') ?? '60';
        const retrySec = Math.max(parseInt(retryAfter, 10) || 60, 60);
        const body = {
          error: 'wayback rate-limited upstream',
          upstream_status: 429,
          retry_after_seconds: retrySec,
          hint: `Internet Archive is rate-limiting this client. Try again in ${retrySec}s — the result will be cached at the edge so retries elsewhere on the site share the cooldown.`,
        };
        const resp = c.json(body, 429, {
          'Retry-After': String(retrySec),
          'Cache-Control': `public, max-age=${retrySec}`,
        });
        c.executionCtx.waitUntil(cache.put(cacheKey, resp.clone()));
        return resp;
      }
      lastError = { status: res.status };
      if (!transientStatus(res.status)) break; // 4xx other than 429 — don't bother retrying.
    } catch (e) {
      lastError = { message: e instanceof Error ? e.message : 'unknown' };
    }
  }

  if (!upstreamOk) {
    // Stash a negative response in cache so we don't punish IA with retry
    // storms while their cluster is offline. The TTL is much shorter than
    // the success TTL — IA recovers fast and we want the next user to feel it.
    const errorBody = {
      error: 'wayback upstream unavailable',
      upstream_status: lastError.status,
      hint: 'Internet Archive CDX is intermittently slow. Cached the failure for 60s; try again shortly.',
    };
    const errorResp = c.json(errorBody, 502, {
      'Cache-Control': `public, max-age=${NEGATIVE_CACHE_TTL}`,
    });
    c.executionCtx.waitUntil(cache.put(cacheKey, errorResp.clone()));
    if (lastError.message) console.warn('wayback fetch failed:', lastError.message);
    return errorResp;
  }

  const response = c.json(upstreamJson, 200, {
    'Cache-Control': `public, max-age=${CACHE_TTL}`,
  });
  c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
