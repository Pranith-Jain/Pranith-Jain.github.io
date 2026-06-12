/**
 * RedHunt Labs Internet Insights — live analytics proxy.
 *
 * Upstream: https://research.redhuntlabs.com/api/latest.json
 * Returns 13 trend series (subdomains, GitHub commits, secrets, etc.),
 * top 25 domains, top 10 secret types, the 20 most recent secrets, and
 * a server-side timestamp.
 *
 * Why a proxy (not an iframe / direct fetch from the browser):
 *   - CORS — research.redhuntlabs.com doesn't return Access-Control-Allow-Origin
 *     for arbitrary origins, so the page can't fetch it directly.
 *   - Stability — the upstream schema is private to RedHunt Labs; the
 *     proxy shields us from renames (the `*_v1` suffix already shows
 *     they've iterated on names once).
 *   - Caching — KV with a 5-minute TTL keeps repeated page loads off
 *     the upstream. The browser polls /api/v1/redhunt-insights every
 *     60s, and Cloudflare Cache serves subsequent reads for 30s.
 *
 * Last verified 2026-06-13.
 */
import type { Context } from 'hono';
import type { Env } from '../env';

const UPSTREAM_URL = 'https://research.redhuntlabs.com/api/latest.json';
const CACHE_TTL_SECONDS = 300; // 5 min — fresh enough to feel "live", cheap enough for the free plan
const BROWSER_TTL_SECONDS = 30; // browser hits /api/v1/redhunt-insights every 60s; 30s stops a thrash
const KV_KEY = 'redhunt-insights:v1';
const USER_AGENT =
  'pranithjain.qzz.io RedHunt Insights mirror (+https://pranithjain.qzz.io/threatintel/redhunt-insights)';

interface LatestSecret {
  id: string;
  type: string;
  typeIcon?: string;
  discoveredAt: string;
  organization: string;
  platform: string;
}

interface TrendSeries {
  previous_month_cumulative?: number;
  current_month_cumulative?: number;
  last_30_days_count?: number;
  last_24_hours_count?: number;
  last_1_hour_count?: number;
  total_count?: number;
  timestamp?: string;
  last_six_weeks?: Record<string, number>;
}

interface UpstreamPayload {
  trends: Record<string, TrendSeries>;
  top_domains: { top_domain: Record<string, number>; timestamp: string };
  top_secrets: { secrets: Record<string, number>; timestamp: string };
  latest_secrets: LatestSecret[];
  timestamp: string;
}

interface CachedPayload {
  fetched_at: string;
  upstream_timestamp: string;
  ok: boolean;
  error?: string;
  data?: UpstreamPayload;
}

const CACHE_FALLBACK: CachedPayload = {
  fetched_at: '1970-01-01T00:00:00.000Z',
  upstream_timestamp: '1970-01-01T00:00:00.000Z',
  ok: false,
  error: 'never fetched',
};

export async function getRedHuntInsightsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  // 1) Try KV first.
  if (kv) {
    try {
      const raw = await kv.get(CACHE_KEY_FOR_KV());
      if (raw) {
        const parsed = JSON.parse(raw) as CachedPayload;
        const ageSec = (Date.now() - Date.parse(parsed.fetched_at)) / 1000;
        if (ageSec < CACHE_TTL_SECONDS && parsed.ok) {
          return c.json(parsed, 200, {
            'cache-control': `public, max-age=${BROWSER_TTL_SECONDS}`,
            'x-cache': 'hit-kv-fresh',
            'x-cache-age-s': Math.round(ageSec).toString(),
          });
        }
        // Stale — revalidate in the background; serve the stale snapshot now
        // so the page still loads instantly when the upstream is slow.
        c.executionCtx.waitUntil(refreshUpstream(kv));
        return c.json(parsed, 200, {
          'cache-control': `public, max-age=${BROWSER_TTL_SECONDS}`,
          'x-cache': 'hit-kv-stale',
          'x-cache-age-s': Math.round(ageSec).toString(),
        });
      }
    } catch {
      /* KV read failed — fall through to a direct fetch. */
    }
  }
  // 2) Cold path: fetch + write to KV.
  const payload = await fetchAndCache(kv);
  return c.json(payload, payload.ok ? 200 : 502, {
    'cache-control': `public, max-age=${BROWSER_TTL_SECONDS}`,
    'x-cache': payload.ok ? 'miss' : 'error',
  });
}

function CACHE_KEY_FOR_KV(): string {
  return KV_KEY;
}

async function refreshUpstream(kv: KVNamespace): Promise<void> {
  try {
    const payload = await fetchAndCache(kv);
    if (!payload.ok) {
      // Don't overwrite the stale payload on transient failure.
      return;
    }
    await kv.put(CACHE_KEY_FOR_KV(), JSON.stringify(payload), { expirationTtl: CACHE_TTL_SECONDS * 2 });
  } catch {
    /* swallow — caller already has the stale snapshot. */
  }
}

async function fetchAndCache(kv: KVNamespace | undefined): Promise<CachedPayload> {
  try {
    const res = await fetch(UPSTREAM_URL, {
      headers: { accept: 'application/json', 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      return { ...CACHE_FALLBACK, error: `upstream HTTP ${res.status}` };
    }
    const data = (await res.json()) as UpstreamPayload;
    // Sanity check: the payload should have trends and latest_secrets.
    if (!data || typeof data !== 'object' || !data.trends || !Array.isArray(data.latest_secrets)) {
      return { ...CACHE_FALLBACK, error: 'upstream payload missing required fields' };
    }
    const payload: CachedPayload = {
      fetched_at: new Date().toISOString(),
      upstream_timestamp: data.timestamp ?? new Date().toISOString(),
      ok: true,
      data,
    };
    if (kv) {
      // Fire-and-forget; errors here don't block the response.
      try {
        await kv.put(CACHE_KEY_FOR_KV(), JSON.stringify(payload), { expirationTtl: CACHE_TTL_SECONDS * 2 });
      } catch {
        /* KV write failed — not fatal. */
      }
    }
    return payload;
  } catch (e) {
    return { ...CACHE_FALLBACK, error: e instanceof Error ? e.message : 'upstream unreachable' };
  }
}
