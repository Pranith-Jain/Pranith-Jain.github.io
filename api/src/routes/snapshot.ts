import type { Context } from 'hono';
import type { Env } from '../env';
import { fetchRansomwareRecent } from './ransomware-recent';
import { fetchTelegramFeed } from './telegram-feed';
import { fetchOnionWatch } from './onion-watch';
import { aggregateFeeds } from './feeds-aggregate';
import { fetchDetectionRules } from './detection-rules';
import { fetchThreatMap } from './threat-map';
import { listBriefings } from '../lib/briefing-builder';

/**
 * Unified live-snapshot endpoint. Replaces six client-side fetches that the
 * LiveSnapshotPanel was making in parallel from /dfir, /dfir/briefings, and
 * /dfir/briefings/<slug>.
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
 * Cache: 5 min at the edge so repeat snapshot calls within that window are
 * free; the underlying handlers cache much longer (1 h ransomware, 30 min
 * Telegram, 6 h onion) so even on a snapshot miss we typically only pay the
 * merge cost.
 */

const CACHE_TTL = 5 * 60;

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
    return { ok: false, data: null, error: (e as Error).message };
  }
}

export async function snapshotHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default;
  // v3: added rules + briefings + threat_map source payloads.
  const cacheKey = new Request('https://snapshot-cache.internal/v3');
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const kv = c.env.BRIEFINGS;

  const [ransomware, telegram, onion, scam, threatIntel, techAi, rules, briefings, threatMap] = await Promise.all([
    safe(async () => {
      const { body, upstreamOk, rateLimited } = await fetchRansomwareRecent();
      if (rateLimited) throw new Error(`upstream rate-limited (retry-after ${rateLimited.retryAfter})`);
      if (!upstreamOk) throw new Error('upstream unreachable');
      return body;
    }),
    safe(() => fetchTelegramFeed()),
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
      if (!kv) throw new Error('briefings KV not bound');
      const items = await listBriefings(kv, { limit: 5 });
      return { items };
    }),
    // Trim threat-map — snapshot card only uses total_ips + top countries.
    safe(async () => {
      const t = await fetchThreatMap();
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
