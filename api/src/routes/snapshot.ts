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

// 8s per-source budget. The snapshot fans out to 6 sources in parallel
// (ransomware + telegram + 3 RSS aggregates + briefings), each with their
// own internal fan-out (ransomware hits 7 upstreams, the RSS aggregators
// hit 12-18 each). Without a budget, one slow upstream pins the whole
// snapshot — the LiveSnapshotPanel would then show "loading…" for 15s+ on
// the first visit after a per-route cache miss. 8s is a hard cap that
// trades completeness for responsiveness: a source that times out gets
// served as a `safe()`-shaped "upstream timeout" so the rest of the
// snapshot still renders. The card displays the timeout reason in the UI.
const SOURCE_BUDGET_MS = 8_000;

// Per-feed soft deadline for the RSS aggregators, kept BELOW SOURCE_BUDGET_MS.
// aggregateFeeds fans out to 6-18 feeds and used to wait for ALL of them
// (Promise.allSettled) — so one slow cold-cache upstream (Google News RSS,
// hnrss, the YC blog) pushed the whole fan-out past the 8s source budget and
// the budgeted() wrapper reported the entire card as "upstream timeout",
// discarding the feeds that DID respond. With this deadline the aggregator
// returns the fast feeds within ~6.5s; the slow feed keeps fetching in the
// background and warms the per-URL edge cache for the next reader.
const FEED_DEADLINE_MS = 6_500;

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

/**
 * Wrap a `safe()` call in a per-source time budget. The snapshot fans out
 * to 6 sources in parallel, each with internal fan-out. A single slow
 * upstream used to pin the whole snapshot to its slowest leg (16s on
 * cold cache, dominated by the ransomware chain). The budget returns an
 * `upstream timeout` SourcePayload when exceeded, which the rest of the
 * pipeline renders as a degraded-but-useful card instead of holding the
 * whole response hostage.
 *
 * `unbudgeted: true` skips the timer (used for `listBriefings` which is
 * a single D1 query and should be near-instant — adding a timer would
 * be overhead noise).
 */
function budgeted<T>(fn: () => Promise<T>, ms: number = SOURCE_BUDGET_MS): Promise<SourcePayload<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race<SourcePayload<T>>([
    safe(fn),
    new Promise<SourcePayload<T>>((resolve) => {
      timer = setTimeout(() => resolve({ ok: false, data: null, error: 'upstream timeout' }), ms);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
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
              safe(() => aggregateFeeds(SCAM_FEED_URLS, 12, 6, { deadlineMs: FEED_DEADLINE_MS })),
              safe(() => aggregateFeeds(THREAT_INTEL_FEED_URLS, 16, 4, { deadlineMs: FEED_DEADLINE_MS })),
              safe(() => aggregateFeeds(TECH_AI_FEED_URLS, 18, 3, { deadlineMs: FEED_DEADLINE_MS })),
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
  // per-fetcher 15s timeouts. The outer budgeted() wrapper caps the
  // total time each source can hold the response at 8s — without it,
  // a single slow upstream used to pin the whole snapshot to 15-16s on
  // cold cache. The other 5 cards run in the same Promise.all and are
  // not blocked by the slowest one.
  //
  // SUBREQUEST BUDGET: this path composes many fan-outs in ONE invocation,
  // so on a fully-cold cache it can approach CF's 50-subrequest cap. It is
  // bounded in practice by: (1) reading the ransomware + telegram per-route
  // caches FIRST (one match each instead of their 7- / 31-upstream fan-outs),
  // (2) the per-URL feed caches inside aggregateFeeds (warm = ~1 match/feed),
  // (3) the snapshot cron keeping this whole response warm so users almost
  // never hit the cold path, and (4) safe()/budgeted() degrading any single
  // over-budget source instead of failing the response. A fully cold colo can
  // still shed a card; the deeper fix (dedicated per-bundle feed caches read
  // first, like ransomware/telegram above) is deferred to avoid destabilizing
  // this heavily-tuned path.
  const [ransomware, telegram, scam, threatIntel, techAi, briefings] = await Promise.all([
    budgeted(async () => {
      const cached = await cache.match(RANSOMWARE_RECENT_CACHE_KEY);
      if (cached) {
        return (await cached.json()) as { generated_at: string; count: number; victims: unknown[] };
      }
      // Cold cache — call fetchRansomwareRecent() directly.
      const result = await fetchRansomwareRecent(c.env);
      if (result.upstreamOk) return result.body;
      throw new Error('all ransomware upstreams unreachable');
    }),
    budgeted(async () => {
      // Prefer the GLOBAL gp:warm KV blob: the hourly cron writes it once and
      // KV is the same in every colo, so this avoids the per-colo cold-cache
      // problem that made cold colos rebuild (and time out) the telegram feed.
      if (c.env.KV_CACHE) {
        const warm = (await c.env.KV_CACHE.get('gp:warm', 'json').catch(() => null)) as {
          telegram?: TelegramFeedResponse;
        } | null;
        if (warm?.telegram?.channels?.length) return warm.telegram;
      }
      // Per-colo edge cache next.
      const cached = await cache.match(TELEGRAM_FEED_CACHE_KEY);
      if (cached) return (await cached.json()) as TelegramFeedResponse;
      // Cold per-colo cache: a full rebuild fans out to ~22 t.me previews
      // (~17s) — far over the 8s SOURCE_BUDGET_MS — which is exactly what made
      // the "Cybersec Telegram firehose" card show "load error: upstream
      // timeout" on any colo the warm cron hadn't touched. Don't block the
      // budget on it: warm THIS colo's cache in the background and serve an
      // empty payload for this build. The next request in this colo (and the
      // SWR rebuild) read it warm. The standalone /telegram-feed route still
      // rebuilds synchronously on demand, so the dedicated firehose page is
      // unaffected.
      c.executionCtx.waitUntil(
        (async () => {
          try {
            const body = await fetchTelegramFeed();
            await cache.put(
              new Request(TELEGRAM_FEED_CACHE_KEY),
              new Response(JSON.stringify(body), {
                headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=1800' },
              })
            );
          } catch {
            /* best-effort warm */
          }
        })()
      );
      return { generated_at: new Date().toISOString(), channels: [], items: [], warnings: ['warming'] };
    }),
    budgeted(() => aggregateFeeds(SCAM_FEED_URLS, 12, 6, { deadlineMs: FEED_DEADLINE_MS })),
    budgeted(() => aggregateFeeds(THREAT_INTEL_FEED_URLS, 16, 4, { deadlineMs: FEED_DEADLINE_MS })),
    budgeted(() => aggregateFeeds(TECH_AI_FEED_URLS, 18, 3, { deadlineMs: FEED_DEADLINE_MS })),
    budgeted(
      async () => {
        if (!briefingsDb) throw new Error('briefings database not bound');
        const { items } = await listBriefings(briefingsDb, { limit: 5 });
        return { items };
      },
      3000 // D1 listBriefings is a single query — 3s is plenty, no need to wait 8s on a DB hiccup
    ),
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
