import apiApp from '../api/src/index';
import {
  BRIEFING_MAX_AGE_DAYS,
  buildBriefing,
  writeBriefing,
  sweepOldBriefings,
  briefingNeedsHeal,
  expectedWeeklySlug,
  isoDate,
} from '../api/src/lib/briefing-builder';

import {
  runDiscoveryNow,
  runPlannerNow,
  runPublisherNow,
  runSocialAutopostNow,
  refreshSocialMetricsNow,
  type CaseStudyEnv,
} from '../api/src/case-study/run';
import { runTelegramArchive } from '../api/src/routes/telegram-archive';
import {
  runTelegramLeakScanner,
  scrapeWatchedChannels,
  cleanupLeakEntries,
} from '../api/src/routes/telegram-leak-monitor';
import {
  fetchTelegramFeed,
  getTelegramFeedCacheKey,
  pollBotUpdates,
  type TelegramFeedResponse,
} from '../api/src/routes/telegram-feed';
import { fetchXFeed } from '../api/src/routes/x-feed';
import { refreshVictimReleaksCache } from '../api/src/routes/victim-releaks';
import { warmIntelBundles } from '../api/src/lib/intel-bundle-warm';
import { checkWatches } from '../api/src/lib/watch-engine';
import { checkAddressWatches } from '../api/src/lib/address-watch';
import { sweepWatchlist } from '../api/src/lib/ioc-watchlist';
import { buildStatusSnapshot, upsertStatusSnapshot } from '../api/src/lib/breach-forum-status';
import { getCuratedForums } from '../api/src/routes/breach-forums';
import { buildDeepDarkCti } from '../api/src/routes/deepdarkcti';
import { buildBlocklists } from '../api/src/lib/blocklist-builder';
import { indexTelegramLeaks } from '../api/src/routes/rag-index';
import { indexAllCorpora } from '../api/src/routes/rag-corpus-index';
import { detectPirAlerts } from '../api/src/routes/pir';
import { syncOwaspAiLandscape, syncCuratedToolbox, syncCuratedCerts } from '../api/src/lib/landscape-sync';
import { syncGitHubAdvisories, GHSA_META_KV_KEY, GHSA_FRESH_TTL_S } from '../api/src/lib/github-security-sync';
import { runFullCollection } from '../api/src/lib/cti-collector';
import { runRetentionSweep } from '../api/src/lib/retention';
import { runGraphIngest } from '../api/src/routes/graph-ingest';
import { autoRunFeedJobs } from '../api/src/routes/feed-scheduler';
import { enqueueAllFeeds } from '../api/src/routes/live-iocs';
import { enqueueGpFeeds } from '../api/src/routes/global-pulse';
import { scanForPhishingDomains, type PassiveDnsEnv } from '../api/src/lib/passive-dns';
import { runCyberPulseIngestion } from '../api/src/routes/cyberpulse-ingest';
import { fetchXClaims } from '../api/src/routes/x-claims';
import { readAuthCookies, XAuthMissingError } from '../api/src/lib/twitter-auth-graphql';
import { fetchRedditFeed } from '../api/src/routes/reddit-feed';
import type { D1Database } from '@cloudflare/workers-types';
import { acquireCronLease, releaseCronLease, heartbeatCronLease } from './durable-objects/cron-lock';
import { siCacheStats, loadSiIndex } from './lib/si-manifest';
import { tiCacheStats, loadTiIndex } from './lib/threat-intel-manifest';

// Lease TTL for the cron single-flight gate. Generous so it covers the
// worst-case job window (the briefing build runs well past the old 120s) —
// the lease auto-expires if a run crashes, and the next fire can acquire.
const CRON_LEASE_TTL_MS = 15 * 60_000;
import type { Env as ApiEnv } from '../api/src/env';
import type { Env } from './env';

/**
 * Cron-triggered work. Dispatched on cron string:
 * - "0 * * * *"  → hourly: telegram scan, cache-warm, graph-ingest,
 *                  feed-scheduler, infra-scan, retention, PIR alerts,
 *                  breach-forum snapshot, RAG re-index + BRIEFING HEAL
 *                  (conditional — only fires if the 00:30/00:45 primary
 *                  build left the row empty or degraded)
 * - "5 0 * * *"  → daily case-study discovery + planner (chained; one
 *                  lease, planner runs after discovery finishes so it
 *                  sees the just-updated candidate queue)
 * - "30 0 * * *" → daily briefing for the prior calendar day
 * - "45 0 * * 1" → weekly briefing for the prior ISO week (Mon → Sun)
 * - "0 * * * *"  → warm /api/v1/snapshot + /api/v1/ioc-snapshot once
 *                  per hour. Was every 5 min — that cadence was burning
 *                  Workers KV writes for negligible UX gain. Snapshot
 *                  cache TTL bumped to 1h to match.
 */
export async function handleScheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
  // Security Investigator: log cache + manifest health once per cron tick.
  // Cheap (in-memory); no I/O. If the counts drift, the next deploy will
  // rebuild the manifest via scripts/build-si-manifest.mjs.
  if (env.ASSETS) {
    try {
      const idx = await loadSiIndex(env.ASSETS as unknown as Fetcher);
      const cache = siCacheStats();
      console.log(
        JSON.stringify({
          job: 'si-stats',
          counts: idx.counts,
          cacheHits: cache.skills.hits + cache.queries.hits + cache.automations.hits,
          cacheMisses: cache.skills.misses + cache.queries.misses + cache.automations.misses,
        })
      );
    } catch (e) {
      console.log(
        JSON.stringify({ job: 'si-stats', status: 'failed', error: e instanceof Error ? e.message : String(e) })
      );
    }
    // Threat Intel: log cache + manifest health once per cron tick.
    try {
      const idx = await loadTiIndex(env.ASSETS as unknown as Fetcher);
      const cache = tiCacheStats();
      console.log(
        JSON.stringify({
          job: 'ti-stats',
          counts: idx.counts,
          lastSyncedAt: idx.lastSyncedAt,
          cacheHits: cache.cves.hits + cache.iocs.hits + cache.sectors.hits,
          cacheMisses: cache.cves.misses + cache.iocs.misses + cache.sectors.misses,
        })
      );
    } catch (e) {
      console.log(
        JSON.stringify({ job: 'ti-stats', status: 'failed', error: e instanceof Error ? e.message : String(e) })
      );
    }
  }

  const cron = event.cron;
  const startMs = Date.now();

  // === Per-cron-string single-flight lease (Durable Object) ===========
  // A DO is single-threaded + globally unique, so acquire is atomic and
  // globally consistent — unlike the old KV get-then-put, which was
  // non-atomic (two PoPs could each read "free" then each write) and per-PoP
  // (eventually consistent), so a Cloudflare retry or cross-PoP duplicate
  // could both pass the gate and double-run the fan-out / briefing build.
  // The TTL covers the job window; we fail-open on a DO error so a blip
  // never halts every cron.
  const lease = await acquireCronLease(env, cron, CRON_LEASE_TTL_MS);
  if (!lease.acquired) {
    console.log(JSON.stringify({ job: 'cron-lock', cron, status: 'skipped_overlap' }));
    return;
  }
  if (lease.failOpen) {
    console.log(JSON.stringify({ job: 'cron-lock', cron, status: 'do_error_fail_open' }));
  }

  // Release the single-flight lease as soon as the dispatched work settles, so a
  // retry / next fire isn't blocked for the whole TTL. Chained via `.finally`
  // onto each branch's waitUntil promise (per spec, the chain waits for the
  // returned promise). A no-op when we failed open (no real token to match).
  const releaseLease = (): Promise<void> => releaseCronLease(env, cron, lease.token ?? '');

  // === Case-study generator — piggybacks on the existing 3 crons ===
  const csNow = new Date(event.scheduledTime);
  const csCron = event.cron;

  const logCronFail = (job: string) => (e: unknown) =>
    console.error(JSON.stringify({ cron: csCron, job, error: e instanceof Error ? e.message : String(e) }));

  const logCronDone = (extra: Record<string, unknown> = {}) => {
    console.log(JSON.stringify({ job: 'cron-done', cron, duration_ms: Date.now() - startMs, ...extra }));
  };

  // Case-study discovery + planner — single daily invocation. Discovery
  // populates today's candidate queue; the planner runs immediately after
  // against the just-updated backlog so the day's first publish slot has
  // fresh approved material to schedule. Chained sequentially (NOT in
  // parallel) so the planner sees candidates the discovery run may have
  // also flagged for auto-approval, and so a single shared lease covers
  // both — one DO acquire/release for the whole pipeline.
  if (csCron === '5 0 * * *') {
    ctx.waitUntil(
      (async () => {
        try {
          await runDiscoveryNow(env as unknown as CaseStudyEnv, csNow);
        } catch (e) {
          logCronFail('discovery')(e);
          // Don't rethrow: a discovery failure must not block the planner,
          // which operates on the existing approved backlog and is the
          // half the platform actually depends on daily.
        }
        try {
          await runPlannerNow(env as unknown as CaseStudyEnv, csNow);
        } catch (e) {
          logCronFail('planner')(e);
        }
        logCronDone({ path: 'discovery+planner' });
      })()
        .catch(logCronFail('discovery+planner'))
        .finally(releaseLease)
    );
    return;
  }

  if (cron === '0 * * * *') {
    ctx.waitUntil(
      (async () => {
        const db = env.BRIEFINGS_DB as D1Database | undefined;
        // Heartbeat the cron lease every 5 min so long-running jobs
        // (briefing builds, intel bundles) don't lose the lease.
        const heartbeatInt = setInterval(() => {
          if (lease.token) heartbeatCronLease(env, cron, lease.token, CRON_LEASE_TTL_MS).catch(() => {});
        }, 5 * 60_000);
        try {
          // === Telegram leak scanning — FIRST, before anything else hits t.me ===
          // Telegram throttles repeated scrape bursts from the same egress IP. The
          // cache-warm below (it fetches /api/v1/telegram-feed) and the watched-
          // channel scrape also hit t.me, so running the feed scan here guarantees
          // it gets the first, un-throttled pass. Previously it ran LAST and found
          // ~0 new leaks every hour (only manual triggers — a single clean burst —
          // worked). Also placed ahead of the briefing-rebuild early-return below,
          // so a rebuild hour can't skip leak scanning entirely.
          // Hoisted so CyberPulse (below) can reuse this single Telegram fetch
          // instead of issuing a second t.me burst that gets throttled to 0.
          let telegramFeed: Awaited<ReturnType<typeof fetchTelegramFeed>> | undefined;
          try {
            if (env.BRIEFINGS_DB) {
              // Try Cache-API first (primed by previous route hits or gp:warm)
              const tgCacheKey = await getTelegramFeedCacheKey(env as unknown as ApiEnv);
              const tgCached = await caches.default.match(tgCacheKey);
              if (tgCached) {
                telegramFeed = (await tgCached.json()) as TelegramFeedResponse;
              } else {
                // Fallback to gp:warm KV slice (written by queue consumer)
                const kvWarm = (
                  env.KV_CACHE ? await env.KV_CACHE.get('gp:warm:telegram', 'json') : null
                ) as TelegramFeedResponse | null;
                if (kvWarm?.items?.length) {
                  telegramFeed = kvWarm;
                }
              }
              if (telegramFeed?.items?.length) {
                const result = await runTelegramLeakScanner(env.BRIEFINGS_DB, telegramFeed.items);
                if (result.leaks_found > 0 || result.channels_discovered > 0) {
                  console.log(
                    JSON.stringify({
                      job: 'telegram-leak-scanner',
                      leaks_found: result.leaks_found,
                      channels_discovered: result.channels_discovered,
                    })
                  );
                }
              }
            }
          } catch (e) {
            console.error(
              JSON.stringify({
                job: 'telegram-leak-scanner',
                status: 'failed',
                error: e instanceof Error ? e.message : String(e),
              })
            );
          }

          // Watched-channel scrape runs right after, sharing one burst window
          // before the cache-warm fans out more t.me requests.
          try {
            if (env.BRIEFINGS_DB) {
              const w = await scrapeWatchedChannels(env.BRIEFINGS_DB);
              if (w.channels_scraped > 0) {
                console.log(
                  JSON.stringify({
                    job: 'telegram-watched-scrape',
                    channels_scraped: w.channels_scraped,
                    leaks_found: w.leaks_found,
                    channels_discovered: w.channels_discovered,
                  })
                );
              }
            }
          } catch (e) {
            console.error(
              JSON.stringify({
                job: 'telegram-watched-scrape',
                status: 'failed',
                error: e instanceof Error ? e.message : String(e),
              })
            );
          }

          // ── X auth diagnostic ──────────────────────────────────────────────
          try {
            readAuthCookies(env);
          } catch (e) {
            const reason = e instanceof XAuthMissingError ? 'missing' : e instanceof Error ? e.message : String(e);
            console.warn(JSON.stringify({ job: 'x-auth-diagnostic', status: 'unavailable', reason }));
          }

          // ── Pre-warm x-claims so CyberPulse gets breach/ransomware claims
          // instead of doing its own GraphQL fetches for the 14 CTI handles.
          // Calls fetchXClaims DIRECTLY instead of going through the route
          // handler, avoiding the race between waitUntil cache write and
          // CyberPulse's synchronous cache read. The result is threaded into
          // runCyberPulseIngestion via prefetched.xClaimsBreach.
          let xClaimsBreach:
            Array<{ text: string; source_url: string; handle: string; discovered: string }> | undefined;
          try {
            const allClaims = await fetchXClaims(env);
            xClaimsBreach = allClaims.breach;
            console.log(
              JSON.stringify({
                job: 'cyberpulse-x-claims-warm',
                handles: allClaims.handles.length,
                ransomware: allClaims.ransomware.length,
                breach: allClaims.breach.length,
              })
            );
          } catch (e) {
            console.warn(JSON.stringify({ job: 'cyberpulse-x-claims-warm', error: String(e) }));
          }

          // ── CyberPulse: breach/leak incident ingestion from social media firehose
          // Runs after Telegram scan (shared burst window) but before cache-warm.
          // Monitors X accounts + keyword search for breaches/leaks/cybercrime.
          // X accounts and X search data are warmed by the */30 * * * * cron via
          // the queue consumer into `cp:warm:*` KV keys — reads from there instead
          // of doing GraphQL direct fetches, preserving the 50-subrequest budget
          // for the rest of the hourly pipeline.
          try {
            if (env.BRIEFINGS_DB) {
              // Read X accounts and X search from KV (warmed by queue consumer).
              // Fail open: if the KV key is stale or missing, runCyberPulseIngestion
              // falls back to its own GraphQL fetches.
              let xAccountPosts: unknown[] | undefined;
              let xSearchPosts: unknown[] | undefined;
              if (env.KV_CACHE) {
                try {
                  const raw = await env.KV_CACHE.get('cp:warm:x_accounts', 'json');
                  if (Array.isArray(raw) && raw.length > 0) xAccountPosts = raw as unknown[];
                } catch {
                  /* fail open — CyberPulse falls back to direct GraphQL */
                }
                try {
                  const raw = await env.KV_CACHE.get('cp:warm:x_search', 'json');
                  if (Array.isArray(raw) && raw.length > 0) xSearchPosts = raw as unknown[];
                } catch {
                  /* fail open */
                }
              }
              // Read social and reddit from gp:warm KV slices (warmed by gp queue).
              let socialItems: unknown[] | undefined;
              let redditItems: unknown[] | undefined;
              if (env.KV_CACHE) {
                try {
                  const raw = await env.KV_CACHE.get('gp:warm:x', 'json');
                  if (raw && typeof raw === 'object' && 'items' in (raw as Record<string, unknown>)) {
                    socialItems = (raw as { items: unknown[] }).items;
                  }
                } catch {
                  /* fail open — fallback to direct fetch */
                }
                if (!socialItems) {
                  try {
                    const sf = await fetchXFeed().catch(() => undefined);
                    socialItems = sf?.items as unknown[] | undefined;
                  } catch {
                    /* fail open */
                  }
                }
                try {
                  const raw = await env.KV_CACHE.get('gp:warm:reddit', 'json');
                  if (raw && typeof raw === 'object' && 'items' in (raw as Record<string, unknown>)) {
                    redditItems = (raw as { items: unknown[] }).items;
                  }
                } catch {
                  /* fail open */
                }
                if (!redditItems) {
                  try {
                    const rf = await fetchRedditFeed(
                      env as unknown as { ASSETS: import('@cloudflare/workers-types').Fetcher }
                    ).catch(() => undefined);
                    redditItems = rf?.items as unknown[] | undefined;
                  } catch {
                    /* fail open */
                  }
                }
              }
              const cpResults = await runCyberPulseIngestion(env, env.BRIEFINGS_DB, {
                telegramItems: telegramFeed?.items,
                socialItems: socialItems as undefined,
                redditItems: redditItems as undefined,
                xClaimsBreach,
                xAccountPosts: xAccountPosts as any,
                xSearchPosts: xSearchPosts as any,
              });
              const totalCreated = cpResults.reduce((s, r) => s + r.incidents_created, 0);
              const totalDeduped = cpResults.reduce((s, r) => s + r.incidents_deduped, 0);
              console.log(
                JSON.stringify({
                  job: 'cyberpulse-ingest',
                  incidents_created: totalCreated,
                  incidents_deduped: totalDeduped,
                  sources: cpResults.map((r) => ({
                    source: r.source,
                    items_scanned: r.items_scanned,
                    created: r.incidents_created,
                    deduped: r.incidents_deduped,
                    errors: r.errors.length,
                    duration_ms: r.duration_ms,
                  })),
                })
              );
            }
          } catch (e) {
            console.error(
              JSON.stringify({
                job: 'cyberpulse-ingest',
                status: 'failed',
                error: e instanceof Error ? e.message : String(e),
              })
            );
          }

          // === Briefing self-heal (hourly) ================================
          // Check if expected briefings exist. Runs BEFORE the heavy I/O
          // below (fire-and-forget publisher, telegram-archive, intel-bundle
          // warm, CTI collector, cache-warm fan-out) so the heal's own
          // subrequests (NVD, KEV, feeds, D1 write) are guaranteed budget
          // on the free-plan 50 subrequest cap.
          //
          // Key difference from the old heal: we check the EXPECTED slug
          // by name, not just the latest row by type. The old code queried
          // "most recent weekly" which always returned W26 (rich+complete)
          // even when W27 was missing entirely, so the heal never fired.
          if (db) {
            try {
              const now = new Date();
              const anchor = now;
              const weeklySlug = expectedWeeklySlug(anchor);
              const weeklyRow = await db
                .prepare('SELECT stats_json, body FROM briefings WHERE slug = ?')
                .bind(weeklySlug)
                .first<{ stats_json?: string | null; body?: string | null }>();
              if (briefingNeedsHeal(weeklyRow, { now: now.getTime(), cooldownMs: 30 * 60_000 })) {
                console.log(
                  JSON.stringify({ job: 'briefing-heal', type: 'weekly', slug: weeklySlug, status: 'rebuilding' })
                );
                const briefing = await buildBriefing('weekly', undefined, {
                  nvdApiKey: env.NVD_API_KEY,
                  env: env as unknown as ApiEnv,
                });
                await writeBriefing(db, briefing);
                console.log(
                  JSON.stringify({
                    job: 'briefing-heal',
                    type: 'weekly',
                    slug: briefing.slug,
                    findings: briefing.stats.findings,
                    iocs: briefing.stats.iocs,
                  })
                );
              }
              const dailySlug = `daily-${isoDate(now)}`;
              const dailyRow = await db
                .prepare('SELECT stats_json, body FROM briefings WHERE slug = ?')
                .bind(dailySlug)
                .first<{ stats_json?: string | null; body?: string | null }>();
              if (briefingNeedsHeal(dailyRow, { now: now.getTime(), cooldownMs: 30 * 60_000 })) {
                console.log(
                  JSON.stringify({ job: 'briefing-heal', type: 'daily', slug: dailySlug, status: 'rebuilding' })
                );
                const briefing = await buildBriefing('daily', undefined, {
                  nvdApiKey: env.NVD_API_KEY,
                  env: env as unknown as ApiEnv,
                  live: true,
                });
                await writeBriefing(db, briefing);
                console.log(
                  JSON.stringify({
                    job: 'briefing-heal',
                    type: 'daily',
                    slug: briefing.slug,
                    findings: briefing.stats.findings,
                    iocs: briefing.stats.iocs,
                  })
                );
              }
            } catch (e) {
              console.error(
                JSON.stringify({
                  job: 'briefing-heal',
                  status: 'failed',
                  error: e instanceof Error ? e.message : String(e),
                })
              );
            }
          }

          // ── Case-study publisher + Telegram archive + intel-bundle warm ─────
          // These were previously in a separate `0 * * * *` block with a shared
          // lease but no coordination — merged here so one lease + one heartbeat
          // covers all hourly work.
          const fireAndForget: Promise<unknown>[] = [];
          if (env.FEEDS_QUEUE) {
            fireAndForget.push(
              enqueueGpFeeds(env.FEEDS_QUEUE, csNow.getUTCHours()).catch(logCronFail('gp-warm-enqueue'))
            );
          }
          fireAndForget.push(runPublisherNow(env as unknown as CaseStudyEnv, csNow).catch(logCronFail('publisher')));
          // Drip auto-post tick: releases approved + due X/LinkedIn posts at the
          // configured rate. No-op unless SOCIAL_AUTOPOST_ENABLED === 'true'.
          fireAndForget.push(
            runSocialAutopostNow(env as unknown as CaseStudyEnv, csNow).catch(logCronFail('social-autopost'))
          );
          // Refresh tweet engagement metrics for recent posts (analytics loop).
          fireAndForget.push(
            refreshSocialMetricsNow(env as unknown as CaseStudyEnv, csNow).catch(logCronFail('social-metrics'))
          );
          fireAndForget.push(runTelegramArchive(env as unknown as ApiEnv).catch(logCronFail('telegram-archive')));
          if (env.FEEDS_QUEUE) {
            fireAndForget.push(enqueueAllFeeds(env.FEEDS_QUEUE).catch(logCronFail('live-iocs-enqueue')));
          }
          fireAndForget.push(
            warmIntelBundles(env as unknown as ApiEnv)
              .then((r) =>
                console.log(
                  JSON.stringify({
                    job: 'intel-bundle-warm',
                    built: r.built.length,
                    failed: r.failed.length,
                    has_more: r.hasMore,
                    slugs: r.built,
                    llm_ran: r.llmRan,
                    llm_partial: r.llmPartial,
                  })
                )
              )
              .catch(logCronFail('intel-bundle-warm'))
          );
          if (csNow.getUTCHours() % 6 === 3) {
            fireAndForget.push(
              refreshVictimReleaksCache(env as unknown as ApiEnv)
                .then((b) =>
                  console.log(
                    JSON.stringify({
                      job: 'victim-releaks-refresh',
                      releaks: b.releaks.length,
                      groups: b.groups_scanned,
                      warnings: b.warnings.length,
                    })
                  )
                )
                .catch(logCronFail('victim-releaks-refresh'))
            );
          }
          // GitHub Security Advisories — pre-warm KV once every 6h so
          // the listing page reads from cache, never from the request
          // path. The previous design called GitHub live on every
          // request and was blocked by the 60 req/hr unauthenticated
          // limit on Cloudflare's shared egress IP. Hour 4 of the
          // 6h cycle (UTC: 04, 10, 16, 22) is intentionally offset
          // from the victim-releaks hour so the two upstream calls
          // don't share a burst window. Skip if the meta says we
          // already have a fresh write — protects the per-IP budget
          // even if the cron fires on a non-divisible-by-6 hour
          // (e.g. retry, manual trigger, hourly override).
          if (csNow.getUTCHours() % 6 === 4) {
            fireAndForget.push(
              (async (): Promise<void> => {
                if (!env.KV_CACHE) return;
                const raw = await env.KV_CACHE.get(GHSA_META_KV_KEY, 'text');
                if (raw) {
                  try {
                    const meta = JSON.parse(raw) as {
                      ok?: boolean;
                      fetchedAt?: string;
                    };
                    const ageMs = meta.fetchedAt ? Date.now() - Date.parse(meta.fetchedAt) : Infinity;
                    if (meta.ok && Number.isFinite(ageMs) && ageMs < GHSA_FRESH_TTL_S * 1000) {
                      return;
                    }
                  } catch {
                    /* fall through to sync */
                  }
                }
                const r = await syncGitHubAdvisories(env as unknown as ApiEnv);
                console.log(
                  JSON.stringify({
                    job: 'github-security-sync',
                    ok: r.ok,
                    total: r.total,
                    status: r.status,
                    rate_limited: r.rateLimited,
                    error: r.error,
                  })
                );
              })().catch(logCronFail('github-security-sync'))
            );
          }
          await Promise.allSettled(fireAndForget);

          // ── CTI Collector: automated IOC + news ingestion (every hour) ────
          try {
            if (env.BRIEFINGS_DB) {
              const ctiResult = await runFullCollection(env.BRIEFINGS_DB);
              console.log(
                JSON.stringify({
                  job: 'cti-collector',
                  iocs_stored: ctiResult.iocs_stored,
                  news_stored: ctiResult.news_stored,
                  sources: `${ctiResult.sources_succeeded}/${ctiResult.sources_attempted}`,
                  duration_ms: ctiResult.duration_ms,
                  errors: ctiResult.errors.length,
                })
              );
            }
          } catch (e) {
            console.error(
              JSON.stringify({
                job: 'cti-collector',
                status: 'failed',
                error: e instanceof Error ? e.message : String(e),
              })
            );
          }

          // Cache-warm fan-out. Runs after the self-heal above, which was
          // starved by the fan-out when placed after it.
          const start = Date.now();
          const baseUrl = (env as unknown as { SITE_URL?: string }).SITE_URL ?? 'https://pranithjain.qzz.io';

          // (gp:warm feeds are warmed off this invocation entirely — enqueued at
          // the top of the `0 * * * *` block, fetched one-per-message by the queue
          // consumer — so they no longer compete for this cron's subrequest budget.)

          const perSourceTargets = [
            '/api/v1/threat-map',
            '/api/v1/rules',
            // Warm x-claims BEFORE ransomware-recent so the latter's cache-only
            // read of X (FalconFeeds / @DailyDarkWeb) ransomware claims is fresh.
            '/api/v1/x-claims',
            '/api/v1/ransomware-recent',
            // NOTE: /api/v1/telegram-feed intentionally NOT warmed here — the
            // telegram leak scan above already scrapes t.me this run, and a second
            // burst gets throttled by Telegram. The feed endpoint warms itself on
            // the first real page visit.
            '/api/v1/onion-watch',
            '/api/v1/cve-recent',
            '/api/v1/phishing-urls',
            '/api/v1/malware-samples',
            '/api/v1/reddit-feed',
            '/api/v1/x-feed',
            '/api/v1/detections',
            // NOTE: /api/v1/global-pulse intentionally NOT warmed here — building it
            // triggers its own ~80-subrequest fan-out *inside this cron invocation*,
            // blowing the 50-subrequest cap before the KV-warm block below runs (so
            // the gp:* feed keys never get written → telegram/x/reddit/cve come back
            // empty on the page). global-pulse caches itself on the first page visit.
            '/api/v1/crypto-scam-feed',
            '/api/v1/breach-disclosures',
            // NOTE: /api/v1/live-iocs intentionally NOT warmed here - its
            // synchronous fan-out is 36 subrequests (one per registered feed
            // source) plus 1 KV/queue write, blowing the 50-subrequest cap on
            // the cache-warm Worker invocation when paired with the other 21
            // endpoints fanned out above. The hourly cron already enqueues 36
            // per-source queue messages; the consumer fills the per-colo
            // Cache API slices, and the compose-on-read path serves from there.
            // live-iocs warms itself on the first real page visit via the
            // single-flight path in buildLiveIocsSingleFlight.
            '/api/v1/deepdarkcti',
            '/api/v1/stealer-forum-intel',
            '/api/v1/cyber-crime',
            '/api/v1/writeups',
            '/api/v1/telegram-feed',
            '/api/v1/secret-leaks',
          ];
          // USGS earthquake warmup — write to a dedicated cache key so
          // global-pulse can read it without doing its own fetch.
          async function warmUsgs() {
            try {
              const res = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson');
              if (!res.ok) return;
              const data = (await res.json()) as {
                features: Array<{ properties: Record<string, unknown>; geometry: { coordinates: number[] } }>;
              };
              const events = data.features.map((f) => {
                const p = f.properties;
                const [lng, lat] = f.geometry.coordinates as [number, number, number?];
                const mag = p.mag as number;
                return {
                  id: `eq-${p.code}`,
                  kind: 'earthquake',
                  title: p.title ?? `M${mag} earthquake`,
                  description: p.place ?? 'Unknown location',
                  lat,
                  lng,
                  magnitude: mag,
                  timestamp: new Date(p.time as number).toISOString(),
                  severity: mag >= 6 ? 'critical' : mag >= 5 ? 'high' : mag >= 4 ? 'medium' : 'low',
                  source: 'USGS',
                  url: p.url,
                };
              });
              const cache = caches.default;
              const usgsReq = new Request('https://usgs-earthquake-cache.internal/v1');
              const usgsResp = new Response(JSON.stringify(events), {
                headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=600' },
              });
              await cache.put(usgsReq, usgsResp);
              console.log(JSON.stringify({ job: 'cache-warm', sub: 'usgs', events: events.length }));
            } catch (e) {
              console.error(
                JSON.stringify({
                  job: 'cache-warm',
                  sub: 'usgs',
                  status: 'failed',
                  error: e instanceof Error ? e.message : String(e),
                })
              );
            }
          }
          const composerTargets = [
            '/api/v1/snapshot',
            '/api/v1/ioc-snapshot',
            // IOC correlation route: cross-source consensus that now includes
            // Telegram leaks as source #25. Caches on read at 1h TTL; warming
            // once per hour keeps the consensus fresh. The route does ~24
            // subrequests to upstream feeds, well within the 50 cap when paired
            // with the existing composer block.
            '/api/v1/ioc-correlation',
          ];
          async function warm(path: string) {
            const req = new Request(baseUrl + path, {
              method: 'GET',
              headers: { Referer: baseUrl + '/' },
            });
            const res = await apiApp.fetch(req, env as never, ctx);
            await res.arrayBuffer();
            return { path, status: res.status };
          }
          {
            const perSource = await Promise.allSettled(perSourceTargets.map(warm));
            const composers = await Promise.allSettled(composerTargets.map(warm));
            // Warm USGS earthquakes into dedicated cache
            await warmUsgs();
            const allSettled = [...perSource, ...composers];
            const allTargets = [...perSourceTargets, ...composerTargets];
            const summary = allSettled
              .map((r, i) => {
                const path = allTargets[i];
                return r.status === 'fulfilled'
                  ? `${r.value.path}=${r.value.status}`
                  : `${path}=err(${(r.reason as Error).message})`;
              })
              .join(' ');
            console.log(JSON.stringify({ job: 'cache-warm', duration_ms: Date.now() - start, summary }));
          }

          // (gp:warm feeds are warmed via the queue, off this invocation — see the
          // enqueueGpFeeds call at the top of this block.)

          // === Watch engine ===
          try {
            const watchAlerts = await checkWatches(
              env.KV_CACHE as unknown as KVNamespace,
              new Date().toISOString(),
              db
            );
            if (watchAlerts.length > 0) {
              console.log(
                JSON.stringify({
                  job: 'watch-engine',
                  triggered: watchAlerts.length,
                  alerts: watchAlerts.map((a) => ({ label: a.label, type: a.type, match: a.match })),
                })
              );
            }
          } catch (e) {
            console.error(JSON.stringify({ job: 'watch-engine', error: e instanceof Error ? e.message : String(e) }));
          }

          // === Crypto address monitor (Phase E) ===
          if (db) ctx.waitUntil(checkAddressWatches(new Date().toISOString(), db).catch(logCronFail('crypto-monitor')));

          // === IOC Watchlist sweep ===
          if (db)
            ctx.waitUntil(
              sweepWatchlist(db, new Date().toISOString())
                .then((r) => {
                  if (r.alerts > 0 || r.errors.length > 0) {
                    console.log(
                      JSON.stringify({
                        job: 'ioc-watchlist-sweep',
                        checked: r.checked,
                        alerts: r.alerts,
                        errors: r.errors.length,
                      })
                    );
                  }
                })
                .catch(logCronFail('ioc-watchlist-sweep'))
            );

          // === Breach-forum status snapshot ===
          // Hourly: re-snapshot the deepdarkCTI forum directory + the curated
          // well-known list, write to D1. The deltas route computes
          // transitions from the history table. DDC re-read is fast (KV
          // cache hit, the 12h cold-cache fallback only matters on the
          // first run of the day). D1 batch write is ~30-50 rows — well
          // under the 1k/day KV-equivalent we budget elsewhere.
          try {
            if (env.BRIEFINGS_DB) {
              const ddc = await buildDeepDarkCti(env.KV_CACHE, ctx);
              const curated = getCuratedForums();
              const observedAt = new Date().toISOString();
              const snapshot = buildStatusSnapshot(ddc, curated, observedAt);
              await upsertStatusSnapshot(env.BRIEFINGS_DB as D1Database, snapshot);
              console.log(
                JSON.stringify({
                  job: 'breach-forum-status-snapshot',
                  rows: snapshot.rows.length,
                  ddc_entries: ddc.entries.filter((e) => /^(Criminal Forums|Dark Markets)$/i.test(e.category)).length,
                  curated_entries: curated.length,
                })
              );
            }
          } catch (e) {
            logCronFail('breach-forum-status-snapshot')(e);
          }

          // === Daily leak entry cleanup (6am UTC) ===
          if (new Date().getUTCHours() === 6) {
            try {
              if (env.BRIEFINGS_DB) {
                const deleted = await cleanupLeakEntries(env.BRIEFINGS_DB, 90);
                if (deleted > 0) {
                  console.log(JSON.stringify({ job: 'leak-cleanup', deleted }));
                }
              }
            } catch (e) {
              console.error(JSON.stringify({ job: 'leak-cleanup', error: e instanceof Error ? e.message : String(e) }));
            }
          }

          // === Daily blocklist build (6am UTC) ===
          if (new Date().getUTCHours() === 6) {
            try {
              const bl = await buildBlocklists(env.KV_CACHE);
              console.log(
                JSON.stringify({
                  job: 'blocklist-build',
                  ip_count: bl.ip_count,
                  generated_at: bl.generated_at,
                  pfsense_bytes: bl.pfsense.length,
                  iptables_bytes: bl.iptables.length,
                  suricata_bytes: bl.suricata.length,
                })
              );
            } catch (e) {
              console.error(
                JSON.stringify({
                  job: 'blocklist-build',
                  status: 'failed',
                  error: e instanceof Error ? e.message : String(e),
                })
              );
            }
          }

          // === PIR-level collection health alerts (every hour) ===
          try {
            const pirResult = await detectPirAlerts(env as unknown as ApiEnv);
            if (pirResult.alerts.length > 0) {
              console.log(
                JSON.stringify({
                  job: 'pir-alert-check',
                  pirs_checked: pirResult.total,
                  alerts: pirResult.alerts.length,
                  critical: pirResult.alerts.filter((a) => a.severity === 'critical').length,
                })
              );
            }
          } catch (e) {
            console.error(
              JSON.stringify({ job: 'pir-alert-check', error: e instanceof Error ? e.message : String(e) })
            );
          }

          // === Graph ingestion (daily at 2am UTC) ===
          if (csNow.getUTCHours() === 2) {
            // Guard hoisted OUT of the try: a missing db must skip ONLY graph-ingest,
            // not `return` from the whole hourly IIFE (which previously skipped
            // feed-scheduler, rag-reindex, infra-scan, AND the retention sweep).
            if (!db) {
              console.warn(JSON.stringify({ job: 'graph-ingest', status: 'skipped', reason: 'no db bound' }));
            } else {
              try {
                const gResult = await runGraphIngest(db, 'all', env as never);
                console.log(
                  JSON.stringify({
                    job: 'graph-ingest',
                    nodes_upserted: gResult['threat-intel']?.nodes_upserted ?? 0,
                    edges_created: gResult['threat-intel']?.edges_created ?? 0,
                    per_source: Object.fromEntries(
                      Object.entries(gResult).map(([k, v]) => [
                        k,
                        { n: v.nodes_upserted, e: v.edges_created, err: v.errors.length },
                      ])
                    ),
                  })
                );
              } catch (e) {
                logCronFail('graph-ingest')(e);
              }
            }
          }

          // === Auto-run due feed jobs (every hour, 1 job max) ===
          try {
            if (env.KV_CACHE && db) {
              const fr = await autoRunFeedJobs(env.KV_CACHE, db);
              if (fr.ran > 0) {
                console.log(
                  JSON.stringify({ job: 'feed-scheduler-auto', ran: fr.ran, saved: fr.saved, skipped: fr.skipped })
                );
              }
            }
          } catch (e) {
            logCronFail('feed-scheduler-auto')(e);
          }

          // === RAG corpus re-index (every 6h, at ~:20 past) ===
          if (csNow.getUTCHours() % 6 === 2) {
            try {
              // Independent indexers — run concurrently instead of chaining the
              // two awaits (the catch below still fails the whole job on either).
              const [telegram, corpora] = await Promise.all([
                indexTelegramLeaks(env as unknown as ApiEnv),
                indexAllCorpora(env as unknown as ApiEnv),
              ]);
              const totalIndexed =
                telegram.indexed +
                corpora.cve.indexed +
                corpora.actor_kb.indexed +
                corpora.ransomware.indexed +
                corpora.breach.indexed;
              console.log(
                JSON.stringify({
                  job: 'rag-reindex',
                  telegram_leaks: telegram.indexed,
                  cve: corpora.cve.indexed,
                  actor_kb: corpora.actor_kb.indexed,
                  ransomware: corpora.ransomware.indexed,
                  breach: corpora.breach.indexed,
                  total_indexed: totalIndexed,
                  errors:
                    telegram.errors +
                    corpora.cve.errors +
                    corpora.actor_kb.errors +
                    corpora.ransomware.errors +
                    corpora.breach.errors,
                })
              );
            } catch (e) {
              logCronFail('rag-reindex')(e);
            }
          }

          // === Infrastructure Scan (merged into hourly cron) ===
          // Scans known open directories and C2 infrastructure every hour.
          // Results are cached in KV for the Open Directory Scanner tool.
          // Runs at :15 past the hour to avoid colliding with other jobs.
          try {
            const infraTargets = [
              'http://malware-traffic-analysis.net/',
              'http://cybercrime-tracker.net/',
              'http://tracker.h3x.eu/',
            ];
            type InfraResult = { url: string; status: number; files: number; risk: string };
            // Scan the 3 targets concurrently — each is an independent subrequest
            // and per-target failures were already swallowed, so allSettled fits.
            const settled = await Promise.allSettled(
              infraTargets.map(async (target): Promise<InfraResult | null> => {
                const req = new Request(baseUrl + '/api/v1/open-dir/scan', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ url: target }),
                });
                const res = await apiApp.fetch(req, env as never, ctx);
                if (!res.ok) return null;
                const data = (await res.json()) as { totalFiles?: number; indicators?: string[] };
                return {
                  url: target,
                  status: res.status,
                  files: data.totalFiles ?? 0,
                  risk: (data.indicators?.length ?? 0) > 0 ? 'flagged' : 'clean',
                };
              })
            );
            const infraResults: InfraResult[] = settled.flatMap((r) =>
              r.status === 'fulfilled' && r.value ? [r.value] : []
            );
            if (infraResults.length > 0) {
              console.log(
                JSON.stringify({
                  job: 'infra-scan',
                  targets_scanned: infraResults.length,
                  results: infraResults,
                })
              );
            }
          } catch (e) {
            logCronFail('infra-scan')(e);
          }

          // === 30-day data retention sweep (daily at 6am UTC) ===
          // Runs once daily instead of hourly — the sweep is a no-op most
          // runs (no rows past 30d yet) but guarantees the data-minimization
          // policy is enforced.
          if (csNow.getUTCHours() === 6) {
            try {
              const db = env.BRIEFINGS_DB as D1Database;
              const result = await runRetentionSweep(db);
              if (result.total_deleted > 0) {
                console.log(
                  JSON.stringify({
                    job: 'retention-sweep',
                    deleted: result.total_deleted,
                    tables_swept: result.tables_swept,
                    duration_ms: result.duration_ms,
                    days: result.days,
                  })
                );
              }
            } catch (e) {
              logCronFail('retention-sweep')(e);
            }
          }

          // === Phishing scan (every 6 hours, at 0, 6, 12, 18 UTC) ===
          if (csNow.getUTCHours() % 6 === 0) {
            try {
              if (db) {
                const dnsEnv: PassiveDnsEnv = {
                  VT_API_KEY: env.VT_API_KEY,
                  URLSCAN_API_KEY: env.URLSCAN_API_KEY,
                };
                const result = await scanForPhishingDomains(db, dnsEnv, { maxDomains: 50, lookbackHours: 6 });
                if (result.new_phishing.length > 0 || result.errors.length > 0) {
                  console.log(
                    JSON.stringify({
                      job: 'phishing-scan',
                      scanned: result.scanned,
                      new_phishing: result.new_phishing.length,
                      domains: result.new_phishing.map((p) => ({
                        domain: p.domain,
                        ip: p.resolved_ip,
                        sources: p.sources,
                      })),
                      errors: result.errors.length,
                      duration_ms: result.scan_time_ms,
                    })
                  );
                }
              }
            } catch (e) {
              logCronFail('phishing-scan')(e);
            }
          }
        } finally {
          clearInterval(heartbeatInt);
        }
      })()
        .catch(logCronFail('hourly-cron'))
        .finally(releaseLease)
    );
    ctx.waitUntil(Promise.resolve().then(() => logCronDone({ path: 'hourly' })));
    return;
  }

  // === Curated-landscape sync (OWASP AI + start.me toolbox) ===
  // PIGGYBACKS on the daily briefing cron ("30 0 * * *") — the free plan
  // caps cron triggers at 5, and we already have 5 distinct expressions.
  // Runs in parallel with the briefing build via Promise.allSettled so a
  // sync failure or upstream 5xx can never block the briefing pipeline.
  // Each sub-sync is bounded by FETCH_TIMEOUT_MS (20s) and writes to
  // KV_CACHE; the GET endpoints serve the latest snapshot. Sub-sync
  // failures are non-fatal: the GET handler falls back to the bundled
  // seed, and meta carries the error string for the UI badge.
  const runLandscapeSync = (): Promise<void> =>
    Promise.allSettled([
      syncOwaspAiLandscape(env as unknown as ApiEnv).then((o) => {
        console.log(
          JSON.stringify({
            job: 'landscape-owasp',
            ok: o.ok,
            error: o.error,
            counts: o.counts,
          })
        );
      }),
      syncCuratedToolbox(env as unknown as ApiEnv).then((c) => {
        console.log(
          JSON.stringify({
            job: 'landscape-curated',
            ok: c.ok,
            error: c.error,
            totalTools: c.totalTools,
            totalSections: c.totalSections,
          })
        );
      }),
      syncCuratedCerts(env as unknown as ApiEnv).then((c) => {
        console.log(
          JSON.stringify({
            job: 'landscape-certs',
            ok: c.ok,
            error: c.error,
            totalTools: c.totalTools,
            totalSections: c.totalSections,
          })
        );
      }),
    ]).then((results) => {
      const labels = ['landscape-owasp', 'landscape-curated', 'landscape-certs'];
      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          logCronFail(labels[i] ?? `landscape-${i}`)(r.reason);
        }
      });
    });

  // ── CyberPulse source warm + live ingestion (every 30 min) ──────────────
  // Enqueues queue messages for X accounts and X search (each gets its own
  // 50-subrequest budget in the queue consumer). Also enqueues gp:warm messages
  // for Bluesky/X-feed and Reddit. After enqueue, reads warmed data from KV
  // (or falls back to direct fetch) and runs the full ingestion pipeline so
  // incidents appear every 30 min, not just hourly.
  if (cron === '*/30 * * * *') {
    const queue = env.FEEDS_QUEUE;
    if (!queue) {
      console.warn(JSON.stringify({ job: 'cp-30-enqueue', status: 'no_queue' }));
      await releaseLease();
      return;
    }
    ctx.waitUntil(
      (async () => {
        try {
          // Enqueue X-specific warm messages (cp:warm namespace)
          await queue.sendBatch([
            { body: { cp: { type: 'x_accounts' } }, delaySeconds: 0 },
            { body: { cp: { type: 'x_search' } }, delaySeconds: 2 },
            // Bluesky/Reddit warm via gp:warm (existing handler in queue consumer)
            { body: { gp: { key: 'x', path: '/api/v1/x-feed' } }, delaySeconds: 4 },
            { body: { gp: { key: 'reddit', path: '/api/v1/reddit-feed' } }, delaySeconds: 6 },
          ]);
          console.log(
            JSON.stringify({
              job: 'cp-30-enqueue',
              sources: ['x_accounts', 'x_search', 'gp:x', 'gp:reddit'],
              ok: true,
            })
          );
        } catch (e) {
          console.error(
            JSON.stringify({
              job: 'cp-30-enqueue',
              status: 'failed',
              error: e instanceof Error ? e.message : String(e),
            })
          );
        }
        logCronDone({ path: 'cp-30-enqueue' });
      })().catch(logCronFail('cp-30-enqueue'))
    );

    // ── Telegram Bot API poll ──────────────────────────────────────────
    // When t.me is unreachable, pollBotUpdates reads messages for
    // channels where the bot is admin, storing them in KV for fallback.
    if (!(env as unknown as Record<string, unknown>).TELEGRAM_BOT_TOKEN) {
      console.warn(JSON.stringify({ job: 'tg-bot-poll', status: 'skipped', reason: 'TELEGRAM_BOT_TOKEN not set' }));
    } else {
      ctx.waitUntil(
        pollBotUpdates(env as unknown as ApiEnv).catch((e) => {
          console.error(
            JSON.stringify({ job: 'tg-bot-poll', status: 'failed', error: e instanceof Error ? e.message : String(e) })
          );
        })
      );
    }

    // ── Inline ingestion: read from KV and produce incidents ────────────
    // Runs in the main cron thread (not waitUntil) so failures are visible.
    if (!env.KV_CACHE || !env.BRIEFINGS_DB) {
      console.warn(JSON.stringify({ job: 'cp-30-ingest', status: 'skipped', reason: 'missing bindings' }));
      await releaseLease();
      return;
    }
    try {
      // Read warmed data from KV (may be from this tick's enqueue or previous run)
      let xAccountPosts: unknown[] | undefined;
      let xSearchPosts: unknown[] | undefined;
      let socialItems: unknown[] | undefined;
      let redditItems: unknown[] | undefined;
      let telegramItems: unknown[] | undefined;

      try {
        const raw = await env.KV_CACHE.get('cp:warm:x_accounts', 'json');
        if (Array.isArray(raw) && raw.length > 0) xAccountPosts = raw as unknown[];
      } catch {
        /* fail open */
      }
      try {
        const raw = await env.KV_CACHE.get('cp:warm:x_search', 'json');
        if (Array.isArray(raw) && raw.length > 0) xSearchPosts = raw as unknown[];
      } catch {
        /* fail open */
      }
      // Bluesky/Mastodon: direct fetch first, then KV fallback
      try {
        const sf = await fetchXFeed().catch((e) => {
          console.warn(
            JSON.stringify({
              job: 'cp-30-bluesky',
              status: 'fetch_failed',
              error: e instanceof Error ? e.message : String(e),
            })
          );
          return undefined;
        });
        socialItems = sf?.items as unknown[] | undefined;
        if (socialItems && socialItems.length > 0) {
          console.log(JSON.stringify({ job: 'cp-30-bluesky', status: 'fetched', count: socialItems.length }));
        }
      } catch {
        /* fail open */
      }
      if (!socialItems) {
        try {
          const raw = await env.KV_CACHE.get('gp:warm:x', 'json');
          if (raw && typeof raw === 'object' && 'items' in (raw as Record<string, unknown>)) {
            socialItems = (raw as { items: unknown[] }).items;
          }
        } catch {
          /* fail open */
        }
      }
      // Reddit: direct fetch first, then KV fallback
      try {
        const rf = await fetchRedditFeed(
          env as unknown as { ASSETS: import('@cloudflare/workers-types').Fetcher }
        ).catch(() => undefined);
        redditItems = rf?.items as unknown[] | undefined;
      } catch {
        /* fail open */
      }
      if (!redditItems) {
        try {
          const raw = await env.KV_CACHE.get('gp:warm:reddit', 'json');
          if (raw && typeof raw === 'object' && 'items' in (raw as Record<string, unknown>)) {
            redditItems = (raw as { items: unknown[] }).items;
          }
        } catch {
          /* fail open */
        }
      }
      // Telegram: direct fetch first, then KV fallback (bypass Cache API)
      try {
        const tg = await fetchTelegramFeed(env.KV_CACHE, env as unknown as ApiEnv).catch((e) => {
          console.warn(
            JSON.stringify({
              job: 'cp-30-telegram',
              status: 'fetch_failed',
              error: e instanceof Error ? e.message : String(e),
            })
          );
          return undefined;
        });
        telegramItems = tg?.items as unknown[] | undefined;
        if (telegramItems && telegramItems.length > 0) {
          console.log(JSON.stringify({ job: 'cp-30-telegram', status: 'fetched', count: telegramItems.length }));
        } else {
          console.warn(
            JSON.stringify({
              job: 'cp-30-telegram',
              status: 'empty',
              channels_ok: tg?.channels?.filter((c) => c.ok).length ?? 0,
              channels_fail: tg?.channels?.filter((c) => !c.ok).length ?? 0,
            })
          );
        }
      } catch {
        /* fail open */
      }
      if (!telegramItems) {
        try {
          const kvTg = (await env.KV_CACHE.get('gp:warm:telegram', 'json')) as TelegramFeedResponse | null;
          if (kvTg?.items?.length) telegramItems = kvTg.items;
        } catch {
          /* fail open */
        }
      }

      const cpResults = await runCyberPulseIngestion(env, env.BRIEFINGS_DB, {
        telegramItems: telegramItems as any,
        socialItems: socialItems as any,
        redditItems: redditItems as any,
        xAccountPosts: xAccountPosts as any,
        xSearchPosts: xSearchPosts as any,
      });
      const totalCreated = cpResults.reduce((s, r) => s + r.incidents_created, 0);
      console.log(
        JSON.stringify({
          job: 'cp-30-ingest',
          incidents_created: totalCreated,
          sources: cpResults.map((r) => ({
            source: r.source,
            items_scanned: r.items_scanned,
            created: r.incidents_created,
            deduped: r.incidents_deduped,
            errors: r.errors.length,
          })),
        })
      );
    } catch (e) {
      console.error(
        JSON.stringify({
          job: 'cp-30-ingest',
          status: 'failed',
          error: e instanceof Error ? e.message : String(e),
        })
      );
    }
    await releaseLease();
    return;
  }

  if (cron !== '30 0 * * *' && cron !== '45 0 * * 1') {
    // Unknown cron string — release the lease immediately so a stale entry
    // doesn't block a future (legitimate) fire of the same string for the
    // full TTL window.
    await releaseLease();
    return;
  }
  if (!env.BRIEFINGS_DB) {
    console.warn(JSON.stringify({ job: 'briefing-build', status: 'skipped', reason: 'BRIEFINGS_DB not bound' }));
    await releaseLease();
    return;
  }

  const isWeekly = cron === '45 0 * * 1';
  const type = isWeekly ? 'weekly' : 'daily';

  const briefingHrt = setInterval(() => {
    if (lease.token) heartbeatCronLease(env, cron, lease.token, CRON_LEASE_TTL_MS).catch(() => {});
  }, 5 * 60_000);
  ctx.waitUntil(
    (async () => {
      try {
        // Kick off the landscape sync in parallel with the briefing build.
        // Each sub-sync is bounded by FETCH_TIMEOUT_MS (20s) and never throws
        // (Promise.allSettled + per-callback logCronFail), so a slow upstream
        // can't extend the lease beyond the briefing build's window.
        const landscapePromise = runLandscapeSync();
        const db = env.BRIEFINGS_DB as D1Database;
        try {
          const briefing = await buildBriefing(type, undefined, {
            nvdApiKey: env.NVD_API_KEY,
            env: env as unknown as ApiEnv,
          });
          console.log(
            JSON.stringify({
              job: 'briefing-build-debug',
              step: 'buildBriefing returned',
              slug: briefing.slug,
              findings: briefing.stats.findings,
              iocs: briefing.stats.iocs,
            })
          );
          await writeBriefing(db, briefing);
          console.log(
            JSON.stringify({
              job: 'briefing-build',
              type,
              slug: briefing.slug,
              findings: briefing.stats.findings,
              iocs: briefing.stats.iocs,
            })
          );
        } catch (err) {
          console.error(
            JSON.stringify({
              job: 'briefing-build',
              type,
              status: 'failed',
              error: err instanceof Error ? err.message : String(err),
              stack: err instanceof Error ? err.stack?.split('\n').slice(0, 5).join(' | ') : undefined,
            })
          );
        }
        try {
          const result = await sweepOldBriefings(db, BRIEFING_MAX_AGE_DAYS);
          if (result.deleted.length > 0) {
            console.log(
              JSON.stringify({
                job: 'briefing-sweep',
                deleted: result.deleted.length,
                slugs: result.deleted,
                kept: result.kept,
              })
            );
          }
        } catch (err) {
          console.error(
            JSON.stringify({
              job: 'briefing-sweep',
              status: 'failed',
              error: err instanceof Error ? err.message : String(err),
            })
          );
        }
        // Weekly TI Dashboard build — collects RSS news articles + supply
        // chain incidents and generates an LLM-enriched weekly report.
        if (isWeekly && db) {
          try {
            const { buildWeeklyDashboard, persistDashboard } = await import('../api/src/lib/ti-dashboard/build');
            const report = await buildWeeklyDashboard(env as unknown as ApiEnv);
            await persistDashboard(db, report);
            console.log(
              JSON.stringify({
                job: 'ti-dashboard-build',
                slug: report.slug,
                sources: report.metadata.documents_analyzed,
              })
            );
          } catch (err) {
            console.error(
              JSON.stringify({
                job: 'ti-dashboard-build',
                status: 'failed',
                error: err instanceof Error ? err.message : String(err),
              })
            );
          }
        }

        // Weekly Telegram leak cleanup — prune entries older than 7 days
        // so the DB doesn't grow unbounded. The hourly cron runs the leak
        // scanner (which appends), but only the weekly sweeps old rows.
        if (isWeekly) {
          try {
            const tgDeleted = await cleanupLeakEntries(db, 7);
            if (tgDeleted > 0) {
              console.log(JSON.stringify({ job: 'telegram-cleanup', deleted: tgDeleted, max_age_days: 7 }));
            }
          } catch (err) {
            console.error(
              JSON.stringify({
                job: 'telegram-cleanup',
                status: 'failed',
                error: err instanceof Error ? err.message : String(err),
              })
            );
          }
          // Weekly watchlist digest — sector-filtered, uses watched actors
          if (isWeekly && db && env.KV_CACHE) {
            try {
              const { runWeeklyWatchlistDigest } = await import('../api/src/routes/watchlist');
              await runWeeklyWatchlistDigest(db, env.KV_CACHE);
            } catch (err) {
              console.error(
                JSON.stringify({
                  job: 'watchlist-digest',
                  status: 'failed',
                  error: err instanceof Error ? err.message : String(err),
                })
              );
            }
          }
        }
        // Wait for the parallel landscape sync to finish so the heartbeat
        // interval is still alive (and the lease is held) for its duration.
        // The sub-syncs are bounded by FETCH_TIMEOUT_MS each, so worst case
        // is ~25 s; well within the 15-min lease + 5-min heartbeat.
        await landscapePromise;
      } finally {
        clearInterval(briefingHrt);
      }
      logCronDone({ path: 'briefing-dedicated', type });
    })()
      .catch(logCronFail('briefing-dedicated'))
      .finally(releaseLease)
  );
}
