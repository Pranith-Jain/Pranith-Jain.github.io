import type { Context } from 'hono';
import type { Env } from '../env';
import { classifySector, type Sector } from '../lib/sector-classifier';
import { fetchMythreatintelRansomwareVictims } from '../lib/mythreatintel-parser';
import { fetchAFRansomwareVictims } from '../lib/andreafortuna-feeds';
import { fetchMtiSource, type MtiRansomwareClaim } from '../lib/mythreatintel-api';
import { shouldWriteLastGood } from '../lib/lastgood-debounce';

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
export const RANSOMWARE_RECENT_CACHE_KEY = 'https://ransomware-recent-cache.internal/v9-af-source';
const CACHE_KEY = RANSOMWARE_RECENT_CACHE_KEY;
/**
 * Edge-cache TTL on the merged ransomware feed. Was 1 hour, which made
 * the hero sparkline on / feel stale to repeat visitors — the same
 * "231 claims · last 7d" number on multiple loads inside the same hour.
 * Cut to 15 minutes so a manual refresh (or the client's own polling
 * loop in HeroLiveSparkline) reflects new upstream data within a quarter
 * hour while still keeping the upstream merge cheap (one origin
 * recomputation per ~15 min per edge region).
 */
const CACHE_TTL_SECONDS = 900;
const FETCH_TIMEOUT_MS = 15_000;
const UPSTREAM = 'https://www.ransomlook.io/api/recent';
/** Secondary tracker. RSS of victim claims. Independently aggregated. */
const RANSOMFEED_RSS = 'https://www.ransomfeed.it/rss.php';
/** Tertiary tracker. JSON dump on GitHub, ~16k historical + current entries. */
const RANSOMWATCH_JSON = 'https://raw.githubusercontent.com/joshhighet/ransomwatch/main/posts.json';
/**
 * ransomware.live public data dump (free, no key). Newest-first, ~28k
 * entries, richer than ransomwatch: carries country + activity (sector) +
 * description. The /v2 REST API 301s to HTML and the PRO API needs a paid
 * X-API-KEY, so the static dump is the usable free surface.
 */
const RANSOMWARELIVE_JSON = 'https://data.ransomware.live/posts.json';
/**
 * Cap on the merged victim list returned to clients. Was 60 (~2 days of
 * leak-site activity at typical pace) which made the Metrics page's
 * 7/30/90-day window selectors mostly cosmetic past day-1. 500 covers
 * roughly 14-16 days at typical volume and matches the MTI proxy's
 * canonical limit, so the per-source fetches reuse the same edge-cache
 * entry as the rest of the platform. ~250KB on the wire, served from
 * cache.
 */
const MAX_ITEMS = 500;

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
export type RansomwareOrigin = 'ransomlook' | 'mti' | 'ransomfeed' | 'ransomwatch' | 'ransomwarelive' | 'andreafortuna';

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

/**
 * ransomware.live public dump. Newest-first array; walk forward and stop
 * once entries fall outside the 7-day window. Carries country + activity
 * (sector label) + description, so it produces high-quality rows.
 */
async function fetchRansomwareLiveVictims(): Promise<RansomwareVictim[]> {
  try {
    const res = await fetch(RANSOMWARELIVE_JSON, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'pranithjain.qzz.io DFIR toolkit (free, read-only)',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cf: { cacheTtlByStatus: { '200-299': 3600, '400-599': 0 }, cacheEverything: true },
    } as RequestInit);
    if (!res.ok) return [];
    const raw = (await res.json()) as Array<{
      post_title?: string;
      group_name?: string;
      discovered?: string;
      description?: string;
      country?: string;
      activity?: string;
    }>;
    if (!Array.isArray(raw)) return [];
    const cutoffMs = Date.now() - 7 * 24 * 3600 * 1000;
    const out: RansomwareVictim[] = [];
    // Newest-first: walk forward, stop when older than the window.
    for (let i = 0; i < raw.length && out.length < MAX_ITEMS; i++) {
      const e = raw[i];
      if (!e || !e.post_title || !e.group_name || !e.discovered) continue;
      const discovered = toIsoDate(e.discovered);
      const ts = Date.parse(discovered);
      if (!Number.isFinite(ts)) continue;
      if (ts < cutoffMs) break; // ordered — nothing newer beyond here
      const victim = e.post_title.trim();
      const description = e.description?.trim() || undefined;
      out.push({
        victim,
        group: e.group_name.trim().toLowerCase(),
        discovered,
        description,
        source_url: 'https://www.ransomware.live/',
        sector: classifySector(victim, description ?? e.activity),
        origin: 'ransomwarelive' as const,
        country: e.country?.trim() || undefined,
      });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * MyThreatIntel REST API `ransomware` source — ransomware victim claims
 * (`{ victim, gang, date, country, website, description }`). NOTE: the
 * upstream `events` source is empty; victim/CTI-event data is served by
 * `ransomware`. Higher-fidelity than the t.me/s/mythreatintel scraper
 * (same `origin: 'mti'`); when the token is unset or the upstream is
 * unhealthy this returns [] and the scraper list remains the 'mti'
 * fallback. The merge dedupes by (group|victim|day) so they never
 * double-count.
 */
async function fetchMtiApiVictims(env: Env): Promise<RansomwareVictim[]> {
  const res = await fetchMtiSource(env, 'ransomware', { limit: MAX_ITEMS }).catch(() => null);
  if (!res || !res.ok) return [];
  const out: RansomwareVictim[] = [];
  for (const raw of res.items) {
    const e = raw as MtiRansomwareClaim;
    const victim = e.victim?.trim();
    const gang = e.gang?.trim();
    if (!victim || !gang || !e.date) continue;
    const discovered = toIsoDate(e.date);
    if (Number.isNaN(Date.parse(discovered))) continue;
    const description = e.description?.trim() || undefined;
    const country = e.country?.trim();
    out.push({
      victim,
      group: gang.toLowerCase(),
      discovered,
      description: description && description.length > 320 ? description.slice(0, 317) + '…' : description,
      source_url: 'https://mythreatintel.com/',
      sector: classifySector(victim, description),
      origin: 'mti' as const,
      ...(country && country !== 'N/D' ? { country } : {}),
    });
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
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
export async function fetchRansomwareRecent(env?: Env): Promise<{
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
  const [primarySettled, mtiApiVictims, mtiVictims, secondaryVictims, tertiaryVictims, rlVictims, afVictims] =
    await Promise.all([
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
      // MyThreatIntel REST API `events` — higher-fidelity 'mti' victims.
      // Skipped (→ []) when no env/token; the scraper below stays the fallback.
      env ? fetchMtiApiVictims(env).catch(() => []) : Promise.resolve([] as RansomwareVictim[]),
      // mythreatintel parser returns a structurally-compatible shape; the only
      // extra field is `country`, which RansomwareVictim doesn't yet carry —
      // safe to upcast.
      fetchMythreatintelRansomwareVictims().catch(() => []),
      fetchRansomfeedVictims(),
      fetchRansomwatchVictims(),
      fetchRansomwareLiveVictims(),
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
    (mtiApiVictims.length > 0 ||
      mtiVictims.length > 0 ||
      secondaryVictims.length > 0 ||
      tertiaryVictims.length > 0 ||
      rlVictims.length > 0 ||
      afVictims.length > 0)
  ) {
    upstreamOk = true;
  }

  // AF passed last → lowest dedupe priority. It re-aggregates Ransomlook, so
  // originals win ties; AF only fills gaps the four primary trackers missed.
  const victims = mergeVictims(
    primary,
    mtiApiVictims,
    mtiVictims as RansomwareVictim[],
    secondaryVictims,
    tertiaryVictims,
    rlVictims,
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

  // Persist last-good payload to KV so stale data is served when all
  // upstreams fail (cold cache, transient outages). The calling snapshot
  // handler reads this backup via the ok flag on the return.
  // Only persist a NON-EMPTY payload. A zero-victim result (all upstreams
  // momentarily thin/down) must never become the cached "good" copy, or it
  // pins an empty feed for the whole TTL and the page blanks for repeat
  // visitors — the exact failure this guards against.
  if (upstreamOk && body.victims.length > 0 && env?.KV_CACHE) {
    caches.default
      .put(
        new Request(RANSOMWARE_RECENT_CACHE_KEY),
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'cache-control': `public, max-age=${CACHE_TTL_SECONDS}` },
        })
      )
      .catch(() => {});
  }

  return { body, upstreamOk, rateLimited };
}

/**
 * Global (cross-colo) last-good store. caches.default is per-colo, so a colo
 * whose upstream fetch transiently fails — or one with a cold cache after a
 * deploy/key-bump — has no neighbour to borrow from and would serve "0
 * claims". KV is global: any healthy colo's fetch refreshes it, and every
 * other colo can fall back to it. 48h TTL covers a long upstream outage.
 */
const RANSOMWARE_LASTGOOD_KV_KEY = 'ransomware-recent:lastgood:v1';
const LASTGOOD_TTL_SECONDS = 172800;

async function writeRansomwareLastGood(env: Env, body: ResponseBody): Promise<void> {
  if (!env.KV_CACHE || body.victims.length === 0) return;
  // Debounce: the lastgood is only a stale-outage fallback. Without this, every
  // cache-miss success + SWR background refresh rewrote a single shared KV key
  // from every colo (KV 1-write/sec/key limit + write cost). Once every few
  // hours per colo is plenty — KV is cross-colo durable.
  if (!(await shouldWriteLastGood('ransomware-recent'))) return;
  try {
    await env.KV_CACHE.put(RANSOMWARE_LASTGOOD_KV_KEY, JSON.stringify(body), {
      expirationTtl: LASTGOOD_TTL_SECONDS,
    });
  } catch {
    /* non-fatal */
  }
}

async function readRansomwareLastGood(env: Env): Promise<ResponseBody | null> {
  if (!env.KV_CACHE) return null;
  try {
    const lg = (await env.KV_CACHE.get(RANSOMWARE_LASTGOOD_KV_KEY, 'json')) as ResponseBody | null;
    return lg && Array.isArray(lg.victims) && lg.victims.length > 0 ? lg : null;
  } catch {
    return null;
  }
}

export async function ransomwareRecentHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(CACHE_KEY);
  const cached = await cache.match(cacheKey);
  if (cached) {
    // Stale-while-revalidate: serve stale data and refresh in background
    const cacheDate = cached.headers.get('date');
    const age = cacheDate ? (Date.now() - new Date(cacheDate).getTime()) / 1000 : 0;
    if (age > CACHE_TTL_SECONDS * 0.8) {
      c.executionCtx.waitUntil(
        (async () => {
          try {
            const { body, upstreamOk } = await fetchRansomwareRecent(c.env);
            if (upstreamOk && body.victims.length > 0) {
              const fresh = c.json(body, 200, {
                'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}, stale-while-revalidate=${CACHE_TTL_SECONDS * 4}`,
                'x-cache': 'REVALIDATED',
              });
              await cache.put(cacheKey, fresh);
              await writeRansomwareLastGood(c.env, body);
            }
          } catch {
            /* non-fatal */
          }
        })()
      );
    }
    return new Response(cached.body, cached);
  }

  const { body, upstreamOk, rateLimited } = await fetchRansomwareRecent(c.env);

  if (rateLimited) {
    return c.json({ error: 'upstream_rate_limited', upstream: 'www.ransomlook.io', upstream_status: 429 }, 429, {
      'retry-after': rateLimited.retryAfter,
      'cache-control': 'no-store',
    });
  }

  let finalBody = body;
  let cacheable = upstreamOk && body.victims.length > 0;

  if (cacheable) {
    // Healthy fetch — refresh the global last-good for other colos.
    c.executionCtx.waitUntil(writeRansomwareLastGood(c.env, body));
  } else {
    // This colo's upstreams came back empty. Rather than blank the page with
    // "0 claims", serve the global last-good from KV if we have one.
    const lastGood = await readRansomwareLastGood(c.env);
    if (lastGood) {
      finalBody = lastGood;
      cacheable = true; // real data again — safe to cache locally
    }
  }

  // An empty payload is never cacheable — serve it with no-store so a transient
  // zero-victim result can't get pinned at the edge or in the browser for the
  // whole TTL. stale-while-revalidate lets a cached good copy refresh in the
  // background instead of going hard-stale.
  const response = c.json(finalBody, 200, {
    'Cache-Control': cacheable
      ? `public, max-age=${CACHE_TTL_SECONDS}, stale-while-revalidate=${CACHE_TTL_SECONDS * 4}`
      : 'no-store',
  });
  if (cacheable) {
    c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
  }
  return response;
}
