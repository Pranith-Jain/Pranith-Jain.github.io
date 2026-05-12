import type { Context } from 'hono';
import type { Env } from '../env';
import { classifySector, type Sector } from '../lib/sector-classifier';

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
export const RANSOMWARE_RECENT_CACHE_KEY = 'https://ransomware-recent-cache.internal/v4-multi-source';
const CACHE_KEY = RANSOMWARE_RECENT_CACHE_KEY;
const CACHE_TTL_SECONDS = 3600;
const FETCH_TIMEOUT_MS = 15_000;
const UPSTREAM = 'https://www.ransomlook.io/api/recent';
/** Secondary tracker. RSS of victim claims. Independently aggregated. */
const RANSOMFEED_RSS = 'https://www.ransomfeed.it/rss.php';
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
  /** Heuristic sector classification — see lib/sector-classifier.ts. */
  sector?: Sector;
}

interface ResponseBody {
  generated_at: string;
  source: string;
  count: number;
  groups: Array<{ group: string; count: number }>;
  /** Heuristic sector aggregation. `pct` is share of classified (non-Unknown) victims. */
  sectors: Array<{ sector: Sector; count: number; pct: number }>;
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
 * Parse ransomfeed.it's RSS into our normalized victim shape.
 *
 * Feed item format:
 *   <title>VictimName</title>
 *   <description><![CDATA[Ransomware group called <b>{group}</b> claims
 *                attack for <b>{victim}</b>. ...]]></description>
 *   <pubDate>Tue, 12 May 2026 05:50:57 CEST</pubDate>
 *   <link>https://ransomfeed.it/index.php?page=post_details&id_post=...</link>
 *
 * Note: ransomfeed.it lists `<dc:creator>RansomLook</dc:creator>` so a lot
 * of items overlap with the Ransomlook primary source — the merge below
 * dedupes by (group + victim + day) so duplicates collapse to a single row.
 */
async function fetchRansomfeedVictims(): Promise<RansomwareVictim[]> {
  try {
    const res = await fetch(RANSOMFEED_RSS, {
      headers: {
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
        'User-Agent': 'pranithjain.qzz.io DFIR toolkit (free, read-only)',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const body = await res.text();
    const items: RansomwareVictim[] = [];
    const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
    let m: RegExpExecArray | null;
    while ((m = itemRe.exec(body)) !== null) {
      const block = m[1];
      if (!block) continue;
      const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(block)?.[1];
      const desc = /<description[^>]*>([\s\S]*?)<\/description>/i.exec(block)?.[1] ?? '';
      const link = /<link[^>]*>([\s\S]*?)<\/link>/i.exec(block)?.[1] ?? '';
      const pub = /<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i.exec(block)?.[1] ?? '';
      if (!title) continue;
      // Unwrap CDATA + strip basic HTML for the victim/description.
      const cdataStrip = (s: string) =>
        s
          .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1')
          .replace(/<[^>]+>/g, '')
          .trim();
      const victim = cdataStrip(title);
      const cleanedDesc = cdataStrip(desc);
      // Extract group from description: "Ransomware group called <b>X</b> claims attack for <b>Y</b>".
      // We already stripped tags, so match the plain-text form.
      const groupMatch = /Ransomware group called\s+([^\s,]+)/i.exec(cleanedDesc);
      const group = (groupMatch?.[1] ?? 'unknown').trim().toLowerCase();
      const discovered = pub ? new Date(pub).toISOString() : new Date().toISOString();
      if (Number.isNaN(Date.parse(discovered))) continue;
      items.push({
        victim,
        group,
        discovered,
        // Use the prose part of the description, not the boilerplate.
        description: cleanedDesc.length > 320 ? cleanedDesc.slice(0, 317) + '…' : cleanedDesc,
        source_url: link.trim() || 'https://www.ransomfeed.it/',
        // ransomfeed.it doesn't expose screenshots.
        sector: classifySector(victim, cleanedDesc),
      });
      if (items.length >= MAX_ITEMS) break;
    }
    return items;
  } catch {
    return [];
  }
}

/** Merge two victim lists, dedupe by (group + victim + day), keep newest. */
function mergeVictims(primary: RansomwareVictim[], secondary: RansomwareVictim[]): RansomwareVictim[] {
  const byKey = new Map<string, RansomwareVictim>();
  const key = (v: RansomwareVictim) => {
    const day = v.discovered.slice(0, 10); // YYYY-MM-DD
    return `${v.group}|${v.victim.toLowerCase().trim()}|${day}`;
  };
  // Insert primary first so it wins ties (Ransomlook entries have screen_url
  // which the UI uses). The secondary fills gaps where the primary missed.
  for (const v of primary) byKey.set(key(v), v);
  for (const v of secondary) if (!byKey.has(key(v))) byKey.set(key(v), v);
  return [...byKey.values()].sort((a, b) => b.discovered.localeCompare(a.discovered));
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
  let primary: RansomwareVictim[] = [];
  let upstreamOk = false;
  let rateLimited: { retryAfter: string } | undefined;

  // Ransomlook (primary) + ransomfeed.it (secondary) fetched in parallel.
  // We dedupe by (group + victim + day) so heavy overlap doesn't bloat
  // counts. Ransomlook entries win ties because they carry the .onion
  // screenshot URL the UI renders inline.
  const [primarySettled, secondaryVictims] = await Promise.all([
    (async () => {
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
        return res;
      } catch {
        return null;
      }
    })(),
    fetchRansomfeedVictims(),
  ]);

  try {
    const res = primarySettled;
    if (res && res.status === 429) {
      rateLimited = { retryAfter: res.headers.get('retry-after') ?? '60' };
    } else if (res && res.ok) {
      const raw = (await res.json()) as RansomlookEntry[];
      upstreamOk = true;
      primary = raw
        .filter((e) => e && e.post_title && e.group_name)
        .slice(0, MAX_ITEMS)
        .map((e) => {
          const victim = e.post_title.trim();
          const description = e.description?.trim() || undefined;
          return {
            victim,
            group: e.group_name!.trim().toLowerCase(),
            discovered: toIsoDate(e.discovered),
            description,
            source_url: e.link
              ? `https://www.ransomlook.io${e.link.startsWith('/') ? '' : '/'}${e.link}`
              : 'https://www.ransomlook.io/recent',
            screen_url: e.screen ? `https://www.ransomlook.io/${e.screen.replace(/^\//, '')}` : undefined,
            sector: classifySector(victim, description),
          };
        });
    }
  } catch {
    /* upstream unreachable — fall through; secondary may still have data */
  }

  // If the secondary returned victims even when the primary failed, we treat
  // upstreamOk as true so the response is cacheable and the UI doesn't show
  // "all sources down" when at least one tracker is healthy.
  if (!upstreamOk && secondaryVictims.length > 0) {
    upstreamOk = true;
  }

  const victims = mergeVictims(primary, secondaryVictims).slice(0, MAX_ITEMS);

  const groupCounts = new Map<string, number>();
  for (const v of victims) groupCounts.set(v.group, (groupCounts.get(v.group) ?? 0) + 1);

  const groups = [...groupCounts.entries()]
    .map(([group, count]) => ({ group, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  // Sector aggregation — pct is share of *classified* victims (excludes Unknown
  // from the denominator so the percentages mean "of the ones we could
  // identify, what share is each sector"). The Unknown row is still surfaced
  // with its own count so analysts see how much we couldn't classify.
  const sectorCounts = new Map<Sector, number>();
  for (const v of victims) {
    const s = v.sector ?? 'Unknown';
    sectorCounts.set(s, (sectorCounts.get(s) ?? 0) + 1);
  }
  const classifiedTotal = victims.filter((v) => v.sector && v.sector !== 'Unknown').length;
  const sectors = [...sectorCounts.entries()]
    .map(([sector, count]) => ({
      sector,
      count,
      pct: sector === 'Unknown' || classifiedTotal === 0 ? 0 : Math.round((count / classifiedTotal) * 100),
    }))
    .sort((a, b) => b.count - a.count);

  const body: ResponseBody = {
    generated_at: new Date().toISOString(),
    source: 'ransomlook.io + ransomfeed.it (merged + deduped)',
    count: victims.length,
    groups,
    sectors,
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
