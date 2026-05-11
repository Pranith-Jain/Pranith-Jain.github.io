import type { Context } from 'hono';
import type { Env } from '../env';

/**
 * Recent ransomware leak-site posts via Ransomlook.io's free `/api/recent`
 * endpoint (no auth, JSON, ~100 most recent victim claims). Cache 1 h
 * server-side.
 *
 * Ransomlook captures a PNG screenshot of each .onion leak post and serves
 * it from clearnet at https://www.ransomlook.io/<screen_path>. We surface
 * that URL on each victim — it's the closest we can get to "showing .onion
 * content" from the edge (Workers can't egress through Tor, but we can
 * embed a clearnet-hosted screenshot of what's on the .onion site).
 *
 * Internal Ransomlook magnet links are stripped — they're stub paths that
 * 404 when followed and add no value.
 */

/** Exported so /api/v1/snapshot can read the same cached payload directly. */
export const RANSOMWARE_RECENT_CACHE_KEY = 'https://ransomware-recent-cache.internal/v2';
const CACHE_KEY = RANSOMWARE_RECENT_CACHE_KEY;
const CACHE_TTL_SECONDS = 3600;
const FETCH_TIMEOUT_MS = 15_000;
const UPSTREAM = 'https://www.ransomlook.io/api/recent';
const MAX_ITEMS = 60;

interface RansomlookEntry {
  post_title: string;
  discovered: string;
  description?: string;
  link?: string;
  group_name?: string;
  /** Relative path to a PNG screenshot of the leak post on .onion. */
  screen?: string;
}

export interface RansomwareVictim {
  victim: string;
  group: string;
  discovered: string;
  description?: string;
  source_url: string;
  /**
   * Absolute clearnet URL to a PNG screenshot of the .onion leak page.
   * Captured by Ransomlook's Tor-equipped backend and rehosted on their
   * static CDN. Render directly with <img src=...>; CSP `img-src https:`
   * already permits this.
   */
  screen_url?: string;
}

interface ResponseBody {
  generated_at: string;
  source: string;
  count: number;
  groups: Array<{ group: string; count: number }>;
  victims: RansomwareVictim[];
}

function toIsoDate(s: string): string {
  // Ransomlook returns "YYYY-MM-DD HH:MM:SS.ffffff" without timezone.
  // Treat as UTC.
  const cleaned = s.replace(' ', 'T').replace(/\.\d+$/, '') + 'Z';
  const d = new Date(cleaned);
  return Number.isFinite(d.getTime()) ? d.toISOString() : s;
}

/**
 * Pure-data fetcher — exported for the unified /api/v1/snapshot endpoint
 * which calls upstream handlers directly (worker-internal fetch loops on
 * Cloudflare). Returns `{ body, upstreamOk, rateLimited }` so the calling
 * handler can decide on cache + status semantics.
 */
export async function fetchRansomwareRecent(): Promise<{
  body: ResponseBody;
  upstreamOk: boolean;
  rateLimited?: { retryAfter: string };
}> {
  let victims: RansomwareVictim[] = [];
  let upstreamOk = false;
  let rateLimited: { retryAfter: string } | undefined;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(UPSTREAM, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'pranithjain.qzz.io DFIR toolkit (free, read-only)',
      },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (res.status === 429) {
      rateLimited = { retryAfter: res.headers.get('retry-after') ?? '60' };
    } else if (res.ok) {
      const raw = (await res.json()) as RansomlookEntry[];
      upstreamOk = true;
      victims = raw
        .filter((e) => e && e.post_title && e.group_name)
        .slice(0, MAX_ITEMS)
        .map((e) => ({
          victim: e.post_title.trim(),
          group: e.group_name!.trim().toLowerCase(),
          discovered: toIsoDate(e.discovered),
          description: e.description?.trim() || undefined,
          source_url: e.link
            ? `https://www.ransomlook.io${e.link.startsWith('/') ? '' : '/'}${e.link}`
            : 'https://www.ransomlook.io/recent',
          screen_url: e.screen ? `https://www.ransomlook.io/${e.screen.replace(/^\//, '')}` : undefined,
        }));
    }
  } catch {
    /* upstream unreachable — fall through with empty list */
  }

  const groupCounts = new Map<string, number>();
  for (const v of victims) groupCounts.set(v.group, (groupCounts.get(v.group) ?? 0) + 1);

  const groups = [...groupCounts.entries()]
    .map(([group, count]) => ({ group, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  const body: ResponseBody = {
    generated_at: new Date().toISOString(),
    source: 'ransomlook.io /api/recent',
    count: victims.length,
    groups,
    victims,
  };

  return { body, upstreamOk, rateLimited };
}

export async function ransomwareRecentHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(CACHE_KEY);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const { body, upstreamOk, rateLimited } = await fetchRansomwareRecent();

  if (rateLimited) {
    return c.json({ error: 'upstream_rate_limited', upstream: 'www.ransomlook.io', upstream_status: 429 }, 429, {
      'retry-after': rateLimited.retryAfter,
      'cache-control': 'no-store',
    });
  }

  const response = c.json(body, 200, {
    'Cache-Control': upstreamOk ? `public, max-age=${CACHE_TTL_SECONDS}` : 'no-store',
  });
  if (upstreamOk) {
    c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
  }
  return response;
}
