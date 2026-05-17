import type { Context } from 'hono';
import type { Env } from '../env';
import { fetchRansomwareRecent, RANSOMWARE_RECENT_CACHE_KEY } from './ransomware-recent';
import { fetchTelegramFeed, TELEGRAM_FEED_CACHE_KEY, type TelegramFeedResponse } from './telegram-feed';
import { fetchOnionWatch } from './onion-watch';
import { aggregateFeeds } from './feeds-aggregate';
import { fetchDetectionRules } from './detection-rules';
import { fetchThreatMap, THREAT_MAP_CACHE_KEY } from './threat-map';
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
export const SNAPSHOT_CACHE_KEY = 'https://snapshot-cache.internal/v9-cacheread';

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
  onion: SourcePayload;
  scam: SourcePayload;
  threat_intel: SourcePayload;
  tech_ai: SourcePayload;
  rules: SourcePayload;
  briefings: SourcePayload;
  threat_map: SourcePayload;
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
  // v7: 2026-05-11 — telegram-feed channel set rotated again (added
  // defendor_eng + cyberscoop). Bumped to force a clean rebuild so the
  // LiveSnapshotPanel.tsx telegram card stops showing the previously-cached
  // payload that pre-dated the channel change.
  const cacheKey = new Request(SNAPSHOT_CACHE_KEY);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const briefingsDb = c.env.BRIEFINGS_DB;

  const [ransomware, telegram, onion, scam, threatIntel, techAi, rules, briefings, threatMap] = await Promise.all([
    safe(async () => {
      // Same read-cache-first pattern as threat-map below: cheaper than
      // re-fanning out to Ransomlook and avoids cold-start flakes that
      // briefly emptied the card after the hourly snapshot rebuild.
      const cached = await cache.match(RANSOMWARE_RECENT_CACHE_KEY);
      if (cached) {
        const json = (await cached.json()) as { generated_at: string; count: number; victims: unknown[] };
        return json;
      }
      const { body, upstreamOk, rateLimited } = await fetchRansomwareRecent();
      if (rateLimited) throw new Error(`upstream rate-limited (retry-after ${rateLimited.retryAfter})`);
      if (!upstreamOk) throw new Error('upstream unreachable');
      return body;
    }),
    safe(async () => {
      // Read /api/v1/telegram-feed's edge-cache first; only fan out to the
      // 11 Telegram channels if the per-route cache is cold. This is the
      // single biggest win on snapshot rebuild time + KV pressure.
      const cached = await cache.match(TELEGRAM_FEED_CACHE_KEY);
      if (cached) return (await cached.json()) as TelegramFeedResponse;
      return fetchTelegramFeed();
    }),
    safe(async () => {
      const body = await fetchOnionWatch();
      if (!body) throw new Error('ransomlook unreachable');
      return body;
    }),
    safe(() => aggregateFeeds(SCAM_FEED_URLS, 12, 6)),
    safe(() => aggregateFeeds(THREAT_INTEL_FEED_URLS, 16, 4)),
    safe(() => aggregateFeeds(TECH_AI_FEED_URLS, 18, 3)),
    // Trim rules payload — snapshot card only uses recent_commits + counts.
    safe(async () => {
      const r = await fetchDetectionRules();
      return {
        generated_at: r.generated_at,
        recent_commits: r.recent_commits.slice(0, 16),
        sources_count: r.sources.length,
      };
    }),
    safe(async () => {
      if (!briefingsDb) throw new Error('briefings database not bound');
      const items = await listBriefings(briefingsDb, { limit: 5 });
      return { items };
    }),
    // Threat-map: read the handler's own cache first; only fall through to
    // a fresh upstream fetch on miss. fetchThreatMap() does ~7 IOC-feed
    // fetches + an ip-api geolocation batch — slow and prone to per-request
    // flakes. Reading the handler-side cache (1 h TTL) is instant when
    // populated. Cache.match accepts a URL string directly per spec.
    safe(async () => {
      let t: Awaited<ReturnType<typeof fetchThreatMap>>;
      const cachedRes = await cache.match(THREAT_MAP_CACHE_KEY);
      if (cachedRes) {
        t = (await cachedRes.json()) as Awaited<ReturnType<typeof fetchThreatMap>>;
      } else {
        t = await fetchThreatMap();
      }
      // If the result has IPs but no countries (ip-api outage signature),
      // try once more — fetchThreatMap is the only path that can give us
      // fresh geolocation. After that we just surface whatever we have;
      // throwing in this branch used to surface a misleading "no IPs"
      // error on the card whenever ip-api or the upstream blocklists
      // briefly 429'd. Better to render an empty-state card than a
      // false-positive error message.
      if (t.total_ips > 0 && t.countries.length === 0) {
        try {
          t = await fetchThreatMap();
        } catch {
          /* fall through to whatever we already have */
        }
      }
      return {
        generated_at: t.generated_at,
        total_ips: t.total_ips,
        countries: t.countries.slice(0, 8),
        iocs_by_type: t.iocs_by_type,
      };
    }),
  ]);

  const body: SnapshotResponse = {
    generated_at: new Date().toISOString(),
    ransomware,
    telegram,
    onion,
    scam,
    threat_intel: threatIntel,
    tech_ai: techAi,
    rules,
    briefings,
    threat_map: threatMap,
  };

  const response = c.json(body, 200, { 'Cache-Control': `public, max-age=${CACHE_TTL}` });
  c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
