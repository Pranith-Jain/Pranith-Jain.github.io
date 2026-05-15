import type { Context } from 'hono';
import type { Env } from '../env';
import { classifySector, type Sector } from '../lib/sector-classifier';
import { fetchMythreatintelRansomwareVictims } from '../lib/mythreatintel-parser';
import { fetchAFRansomwareVictims } from '../lib/andreafortuna-feeds';

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
export const RANSOMWARE_RECENT_CACHE_KEY = 'https://ransomware-recent-cache.internal/v8-af-source';
const CACHE_KEY = RANSOMWARE_RECENT_CACHE_KEY;
const CACHE_TTL_SECONDS = 3600;
const FETCH_TIMEOUT_MS = 15_000;
const UPSTREAM = 'https://www.ransomlook.io/api/recent';
/** Secondary tracker. RSS of victim claims. Independently aggregated. */
const RANSOMFEED_RSS = 'https://www.ransomfeed.it/rss.php';
/** Tertiary tracker. JSON dump on GitHub, ~16k historical + current entries. */
const RANSOMWATCH_JSON = 'https://raw.githubusercontent.com/joshhighet/ransomwatch/main/posts.json';
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

/**
 * Which tracker contributed this victim to the merged response. Set by each
 * fetcher; preserved by mergeVictims() so the frontend can render an
 * origin-pill per row.
 */
export type RansomwareOrigin = 'ransomlook' | 'mti' | 'ransomfeed' | 'ransomwatch' | 'andreafortuna';

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
  /** Which of the four trackers surfaced this victim. */
  origin: RansomwareOrigin;
  /** ISO-3166 country name when the upstream provided it (mythreatintel only today). */
  country?: string;
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
        origin: 'ransomfeed' as const,
      });
      if (items.length >= MAX_ITEMS) break;
    }
    return items;
  } catch {
    return [];
  }
}

/**
 * Parse joshhighet/ransomwatch's posts.json into our normalized victim shape.
 *
 * The file contains ~16k historical entries with the shape
 *   { post_title, group_name, discovered }
 * No description, no website, no screenshot. We still find it useful as a
 * gap-filler — ransomwatch monitors leak sites that Ransomlook misses and
 * vice versa. The dataset is large (~2.2MB); we read the tail and only
 * keep the last 7 days so the merge stays bounded.
 */
async function fetchRansomwatchVictims(): Promise<RansomwareVictim[]> {
  try {
    const res = await fetch(RANSOMWATCH_JSON, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'pranithjain.qzz.io DFIR toolkit (free, read-only)',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cf: { cacheTtlByStatus: { '200-299': 3600, '400-599': 0 }, cacheEverything: true },
    } as RequestInit);
    if (!res.ok) return [];
    const raw = (await res.json()) as Array<{ post_title?: string; group_name?: string; discovered?: string }>;
    if (!Array.isArray(raw)) return [];
    const cutoffMs = Date.now() - 7 * 24 * 3600 * 1000;
    const out: RansomwareVictim[] = [];
    // ransomwatch appends new entries at the end of the array; walk backwards.
    for (let i = raw.length - 1; i >= 0 && out.length < MAX_ITEMS; i--) {
      const e = raw[i];
      if (!e || !e.post_title || !e.group_name || !e.discovered) continue;
      const discovered = toIsoDate(e.discovered);
      const ts = Date.parse(discovered);
      if (!Number.isFinite(ts) || ts < cutoffMs) break; // entries are ordered, can stop
      const victim = e.post_title.trim();
      out.push({
        victim,
        group: e.group_name.trim().toLowerCase(),
        discovered,
        source_url: 'https://github.com/joshhighet/ransomwatch',
        sector: classifySector(victim, undefined),
        origin: 'ransomwatch' as const,
      });
    }
    return out;
  } catch {
    return [];
  }
}

/** Merge N victim lists, dedupe by (group + victim + day), keep newest. */
function mergeVictims(...lists: RansomwareVictim[][]): RansomwareVictim[] {
  const byKey = new Map<string, RansomwareVictim>();
  const key = (v: RansomwareVictim) => {
    const day = v.discovered.slice(0, 10); // YYYY-MM-DD
    return `${v.group}|${v.victim.toLowerCase().trim()}|${day}`;
  };
  // Insert in source-priority order. Earlier lists win ties — call sites pass
  // Ransomlook first because its entries carry screen_url which the UI inlines.
  for (const list of lists) {
    for (const v of list) {
      if (!byKey.has(key(v))) byKey.set(key(v), v);
    }
  }
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

  // Four trackers fetched in parallel. Dedupe by (group + victim + day);
  // priority order at tie-break:
  //   1. Ransomlook        — carries .onion screenshot URLs the UI inlines
  //   2. mythreatintel     — Spanish CTI channel, real-time, has descriptions
  //   3. ransomfeed.it     — RSS of victim claims, has descriptions
  //   4. ransomwatch       — id-only, fills coverage gaps from leak-site scrapes
  const [primarySettled, mtiVictims, secondaryVictims, tertiaryVictims, afVictims] = await Promise.all([
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
    // mythreatintel parser returns a structurally-compatible shape; the only
    // extra field is `country`, which RansomwareVictim doesn't yet carry —
    // safe to upcast.
    fetchMythreatintelRansomwareVictims().catch(() => []),
    fetchRansomfeedVictims(),
    fetchRansomwatchVictims(),
    fetchAFRansomwareVictims().catch(() => []),
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
            origin: 'ransomlook' as const,
          };
        });
    }
  } catch {
    /* upstream unreachable — fall through; secondary may still have data */
  }

  // Single-source-down tolerance: cacheable as long as ANY non-primary
  // tracker returned data. The page shouldn't blank when 3/4 trackers are
  // healthy.
  if (
    !upstreamOk &&
    (mtiVictims.length > 0 || secondaryVictims.length > 0 || tertiaryVictims.length > 0 || afVictims.length > 0)
  ) {
    upstreamOk = true;
  }

  // AF passed last → lowest dedupe priority. It re-aggregates Ransomlook, so
  // originals win ties; AF only fills gaps the four primary trackers missed.
  const victims = mergeVictims(
    primary,
    mtiVictims as RansomwareVictim[],
    secondaryVictims,
    tertiaryVictims,
    afVictims
  ).slice(0, MAX_ITEMS);

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
    source: 'ransomlook.io + mythreatintel + ransomfeed.it + ransomwatch (merged + deduped)',
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
