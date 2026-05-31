import type { Context } from 'hono';
import type { Env } from '../env';
import { fetchRansomwareRecent, RANSOMWARE_RECENT_CACHE_KEY } from './ransomware-recent';
import { fetchTelegramFeed, TELEGRAM_FEED_CACHE_KEY, type TelegramFeedResponse } from './telegram-feed';
import { aggregateFeeds } from './feeds-aggregate';
import { listBriefings } from '../lib/briefing-builder';

/**
 * Unified live-snapshot endpoint. Replaces six client-side fetches that the
 * LiveSnapshotPanel was making in parallel from /dfir, /threatintel/briefings, and
 * /threatintel/briefings/<slug>.
 *
 * The browser pays one HTTP round-trip + one setState cycle instead of six,
 * which materially cuts client TBT (Total Blocking Time) on Lighthouse.
 *
 * Implementation: each per-source handler now exports a pure-data fetcher
 * (`fetchRansomwareRecent`, `fetchTelegramFeed`, `fetchOnionWatch`,
 * `aggregateFeeds`) alongside its HTTP handler. We call those directly here
 * instead of doing worker-internal HTTP fetches (which Cloudflare 522s on
 * same-worker recursion). The dedicated routes keep their per-route caches.
 *
 * Per-source failures don't fail the whole snapshot. Each key in the
 * response is independently `ok: true/false` with the failure reason.
 *
 * Cache: 1h at the edge so repeat snapshot calls within that window are
 * free; the underlying handlers cache much longer (1 h ransomware, 30 min
 * Telegram, 6 h onion) so even on a snapshot miss we typically only pay the
 * merge cost.
 */

// 1h server-side TTL — matches the hourly cron warmup. Was 5 min, but
// per-IOC snapshot data only changes meaningfully on the order of hours
// upstream (most upstream feeds rebuild every 15-60 min themselves), and
// 5-min bursts were hammering Workers KV writes for negligible UX gain.
const CACHE_TTL = 60 * 60;

/** Exported so /api/v1/feed-status can read the same cached payload directly. */
// v11: 2026-05-24 — KV-backed ransomware last-good fallback wired in.
// Bumped to evict v10 cached snapshots that have ransomware.ok=false
// stuck in them from the prior upstream outage; the user reported the
// "Right now / Ransomware: load error: upstream error" card persisting
// for the full snapshot TTL.
// v16: 2026-05-25 — Cache-Control now `private` so CF edge auto-cache
// no longer double-caches the response with the old max-age=14400
// header (which was pinning stale "0 ransomware claims" in users'
// browsers for hours). Application-level caching is preserved via
// our own caches.default layer keyed by SNAPSHOT_CACHE_KEY.
// v17: 2026-05-26 — Call fetchRansomwareRecent() directly instead of
// internal HTTP fetch, which timed out on cold edge-cache and caused
// the recurring "load error: upstream error" on the Ransomware card.
// v18: 2026-05-26 — Per-source 6s timeout on ransomware fan-out so
// the other 5 cards never wait for a slow cold build.
export const SNAPSHOT_CACHE_KEY = 'https://snapshot-cache.internal/v20-remove-6s-timeout';

/** Curated feed URLs — kept in sync with the constants the panel used to use. */
const SCAM_FEED_URLS = ['https://consumer.ftc.gov/blog/rss', 'https://www.ic3.gov/CSA/RSS'];
const THREAT_INTEL_FEED_URLS = [
  'https://www.bleepingcomputer.com/feed/',
  'https://krebsonsecurity.com/feed/',
  'https://thedfirreport.com/feed/',
  'https://www.securityweek.com/feed/',
];
/**
 * Tech & AI: TechCrunch AI + VentureBeat AI + TechCrunch security +
 * cybersec funding + the YC surfaces (HN AI search + YC blog). YC content
 * is high-signal for "what just got funded / shipped in AI + cyber".
 */
const TECH_AI_FEED_URLS = [
  'https://techcrunch.com/category/artificial-intelligence/feed/',
  'https://venturebeat.com/category/ai/feed/',
  'https://techcrunch.com/category/security/feed/',
  'https://news.google.com/rss/search?q=cybersecurity+funding&hl=en-US&gl=US&ceid=US:en',
  'https://hnrss.org/newest?q=AI',
  'https://www.ycombinator.com/blog/rss',
];

interface SourcePayload<T = unknown> {
  ok: boolean;
  data: T | null;
  error?: string;
}

export interface SnapshotResponse {
  generated_at: string;
  ransomware: SourcePayload;
  telegram: SourcePayload;
  scam: SourcePayload;
  threat_intel: SourcePayload;
  tech_ai: SourcePayload;
  briefings: SourcePayload;
  // Removed 2026-05-24: `onion`, `rules`, `threat_map` were fanned out but
  // never rendered by LiveSnapshotPanel. Their ~10 upstream subrequests
  // (Ransomlook onion-status fetches + 7 IOC-feed fetches for threat-map +
  // detection-rules pack reads) ate into the 50-req-per-Worker cap and
  // contributed to the recurring "load error: upstream error" on the
  // Ransomware card. Trimming them frees budget for the 6 cards that are
  // actually displayed.
}

async function safe<T>(fn: () => Promise<T>): Promise<SourcePayload<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (e) {
    // Generic surface — the err.message often names upstream services or
    // internal paths. Wrangler tail still sees the real error for ops.
    const isTimeout = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
    if (e instanceof Error) console.warn('snapshot source failed:', e.message);
    return { ok: false, data: null, error: isTimeout ? 'upstream timeout' : 'upstream error' };
  }
}

export async function snapshotHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(SNAPSHOT_CACHE_KEY);
  const cached = await cache.match(cacheKey);
  if (cached) {
    // Stale-while-revalidate: serve stale snapshot and refresh in background
    const cacheDate = cached.headers.get('date');
    const age = cacheDate ? (Date.now() - new Date(cacheDate).getTime()) / 1000 : 0;
    if (age > CACHE_TTL * 0.8) {
      c.executionCtx.waitUntil(
        (async () => {
          try {
            // Rebuild the snapshot in background
            const briefingsDb = c.env.BRIEFINGS_DB;
            const [ransomware, telegram, scam, threatIntel, techAi, briefings] = await Promise.all([
              safe(async () => {
                const result = await fetchRansomwareRecent(c.env);
                if (result.upstreamOk) return result.body;
                throw new Error('upstream error');
              }),
              safe(async () => {
                const result = await fetchTelegramFeed();
                return result;
              }),
              safe(() => aggregateFeeds(SCAM_FEED_URLS, 12, 6)),
              safe(() => aggregateFeeds(THREAT_INTEL_FEED_URLS, 16, 4)),
              safe(() => aggregateFeeds(TECH_AI_FEED_URLS, 18, 3)),
              safe(async () => {
                if (!briefingsDb) throw new Error('briefings database not bound');
                const { items } = await listBriefings(briefingsDb, { limit: 5 });
                return { items };
              }),
            ]);
            if (ransomware.ok && ransomware.data) {
              const r = ransomware.data as { victims: { discovered: string }[]; count: number };
              const cutoff = Date.now() - 24 * 3600_000;
              r.victims = r.victims.filter((v) => new Date(v.discovered).getTime() >= cutoff).slice(0, 20);
            }
            const body: SnapshotResponse = {
              generated_at: new Date().toISOString(),
              ransomware,
              telegram,
              scam,
              threat_intel: threatIntel,
              tech_ai: techAi,
              briefings,
            };
            const fresh = c.json(body, 200, { 'Cache-Control': `public, max-age=60, s-maxage=${CACHE_TTL}` });
            await cache.put(cacheKey, fresh);
          } catch {
            /* non-fatal */
          }
        })()
      );
    }
    return new Response(cached.body, cached);
  }

  const briefingsDb = c.env.BRIEFINGS_DB;

  // 6 sources only. Ransomware fetches 7 upstreams in parallel with
  // per-fetcher 15s timeouts. No wrapper timeout — the other 5 cards
  // already run in the same Promise.all and are NOT blocked by this.
  const [ransomware, telegram, scam, threatIntel, techAi, briefings] = await Promise.all([
    safe(async () => {
      const cached = await cache.match(RANSOMWARE_RECENT_CACHE_KEY);
      if (cached) {
        return (await cached.json()) as { generated_at: string; count: number; victims: unknown[] };
      }
      // Cold cache — call fetchRansomwareRecent() directly.
      const result = await fetchRansomwareRecent(c.env);
      if (result.upstreamOk) return result.body;
      throw new Error('all ransomware upstreams unreachable');
    }),
    safe(async () => {
      // Read /api/v1/telegram-feed's edge-cache first; only fan out to the
      // 11 Telegram channels if the per-route cache is cold. This is the
      // single biggest win on snapshot rebuild time + KV pressure.
      const cached = await cache.match(TELEGRAM_FEED_CACHE_KEY);
      if (cached) return (await cached.json()) as TelegramFeedResponse;
      return fetchTelegramFeed();
    }),
    safe(() => aggregateFeeds(SCAM_FEED_URLS, 12, 6)),
    safe(() => aggregateFeeds(THREAT_INTEL_FEED_URLS, 16, 4)),
    safe(() => aggregateFeeds(TECH_AI_FEED_URLS, 18, 3)),
    safe(async () => {
      if (!briefingsDb) throw new Error('briefings database not bound');
      const { items } = await listBriefings(briefingsDb, { limit: 5 });
      return { items };
    }),
  ]);

  // Truncate ransomware victims to last-24h only (pulse card shows 3, plus
  // few extras for new-since-visit / watchlist counts). The full 500-victim
  // payload stays on the dedicated ransomware-activity page.
  if (ransomware.ok && ransomware.data) {
    const r = ransomware.data as {
      victims: { discovered: string }[];
      count: number;
    };
    const cutoff = Date.now() - 24 * 3600_000;
    r.victims = r.victims.filter((v) => new Date(v.discovered).getTime() >= cutoff).slice(0, 20);
  }

  const body: SnapshotResponse = {
    generated_at: new Date().toISOString(),
    ransomware,
    telegram,
    scam,
    threat_intel: threatIntel,
    tech_ai: techAi,
    briefings,
  };

  // Shorten the cache TTL when a critical card failed — otherwise a
  // single bad fan-out gets pinned in the edge cache for the full
  // CACHE_TTL (1h), so every visitor sees the same "load error" on the
  // Ransomware / Threat-map card until TTL expires. Failed payloads
  // get a 5-min TTL so the next minute brings a retry.
  const ransomwareOk = ransomware.ok;
  const rData = ransomware.data as { count?: number } | null;
  const hasRansomwareContent = ransomwareOk && rData != null && (rData.count ?? 0) > 0;
  const criticalOk = hasRansomwareContent;
  // Browser-facing TTL is 60s — keeps the page's snapshot fresh enough
  // that a transient failure from the worker fan-out auto-clears within
  // a minute instead of pinning the "load error" card for the visitor.
  // Edge cache TTL (s-maxage) is higher on healthy responses to keep
  // origin load down; lower on failures so the next miss re-tries.
  const browserTtl = 60;
  const edgeTtl = criticalOk ? CACHE_TTL : 300;
  const response = c.json(body, 200, {
    'Cache-Control': `public, max-age=${browserTtl}, s-maxage=${edgeTtl}`,
  });
  c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
