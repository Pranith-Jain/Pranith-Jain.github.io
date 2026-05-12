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
// when the cluster is loaded). We give it 50s — long enough that even
// pathological responses land, short enough to leave headroom under the
// Worker subrequest budget. The 6h edge cache means subsequent hits to
// the same URL return instantly.
const FETCH_TIMEOUT = 50_000;
const CACHE_TTL = 6 * 3600;
const CDX_BASE = 'https://web.archive.org/cdx/search/cdx';

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

  let upstreamJson: unknown = [];
  let upstreamOk = false;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
    const res = await fetch(upstream, {
      signal: ctrl.signal,
      headers: { 'user-agent': 'pranithjain-dfir/1.0', accept: 'application/json' },
    });
    clearTimeout(timer);
    if (res.ok) {
      upstreamJson = await res.json();
      upstreamOk = true;
    } else if (res.status === 429) {
      return c.json({ error: 'wayback rate-limited upstream', upstream_status: 429 }, 429);
    } else {
      return c.json({ error: 'wayback upstream error', upstream_status: res.status }, 502);
    }
  } catch (e) {
    if (e instanceof Error) console.warn('wayback fetch failed:', e.message);
    return c.json({ error: 'wayback unreachable' }, 502);
  }

  const response = c.json(upstreamJson, 200, {
    'Cache-Control': `public, max-age=${CACHE_TTL}`,
  });
  if (upstreamOk) {
    c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
  }
  return response;
}
