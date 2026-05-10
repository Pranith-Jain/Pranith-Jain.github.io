import type { Context } from 'hono';
import type { Env } from '../env';

/**
 * Recent ransomware leak-site posts via Ransomlook.io's free `/api/recent`
 * endpoint (no auth, JSON, ~100 most recent victim claims). Cache 1 h
 * server-side.
 *
 * We strip ransomlook-specific fields the client doesn't need (screen path,
 * internal magnet links) and normalise dates to ISO 8601 so the page can
 * render relative times consistently with the breach-disclosures panel.
 */

const CACHE_KEY = 'https://ransomware-recent-cache.internal/v1';
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
}

export interface RansomwareVictim {
  victim: string;
  group: string;
  discovered: string;
  description?: string;
  source_url: string;
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

export async function ransomwareRecentHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(CACHE_KEY);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  let victims: RansomwareVictim[] = [];
  let upstreamOk = false;

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
      const retryAfter = res.headers.get('retry-after') ?? '60';
      return c.json({ error: 'upstream_rate_limited', upstream: 'www.ransomlook.io', upstream_status: 429 }, 429, {
        'retry-after': retryAfter,
        'cache-control': 'no-store',
      });
    }
    if (res.ok) {
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

  const response = c.json(body, 200, {
    'Cache-Control': upstreamOk ? `public, max-age=${CACHE_TTL_SECONDS}` : 'no-store',
  });
  if (upstreamOk) {
    c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
  }
  return response;
}
