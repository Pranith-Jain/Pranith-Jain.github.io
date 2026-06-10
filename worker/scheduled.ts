import apiApp from '../api/src/index';
import {
  BRIEFING_MAX_AGE_DAYS,
  buildBriefing,
  writeBriefing,
  sweepOldBriefings,
  expectedWeeklySlug,
  briefingNeedsHeal,
  weeklyUndercountsDailies,
  dailyNeedsCveReenrich,
} from '../api/src/lib/briefing-builder';
import { buildLandscapeReport, writeLandscapeReport, expectedLandscapeSlug } from '../api/src/lib/landscape-builder';
import { runDiscoveryNow, runPlannerNow, runPublisherNow, type CaseStudyEnv } from '../api/src/case-study/run';
import { runTelegramArchive } from '../api/src/routes/telegram-archive';
import {
  runTelegramLeakScanner,
  scrapeWatchedChannels,
  cleanupLeakEntries,
} from '../api/src/routes/telegram-leak-monitor';
import { fetchTelegramFeed } from '../api/src/routes/telegram-feed';
import { refreshVictimReleaksCache } from '../api/src/routes/victim-releaks';
import { warmIntelBundles } from '../api/src/lib/intel-bundle-warm';
import { checkWatches } from '../api/src/lib/watch-engine';
import { buildStatusSnapshot, upsertStatusSnapshot } from '../api/src/lib/breach-forum-status';
import { getCuratedForums } from '../api/src/routes/breach-forums';
import { buildDeepDarkCti } from '../api/src/routes/deepdarkcti';
import { buildBlocklists } from '../api/src/lib/blocklist-builder';
import { indexTelegramLeaks } from '../api/src/routes/rag-index';
import { indexAllCorpora } from '../api/src/routes/rag-corpus-index';
import { detectPirAlerts } from '../api/src/routes/pir';
import { runGraphIngest } from '../api/src/routes/graph-ingest';
import { autoRunFeedJobs } from '../api/src/routes/feed-scheduler';
import { enqueueAllFeeds } from '../api/src/routes/live-iocs';
import type { D1Database } from '@cloudflare/workers-types';
import { acquireCronLease, releaseCronLease } from './durable-objects/cron-lock';

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
 *                  breach-forum snapshot, RAG re-index. NO briefing build
 *                  here — see the dedicated "20 * * * *" heal cron below.
 * - "5 0 * * *"  → daily case-study discovery + planner (chained; one
 *                  lease, planner runs after discovery finishes so it
 *                  sees the just-updated candidate queue)
 * - "20 * * * *" → briefing self-heal, ONE build per invocation. Its OWN
 *                  invocation so the build gets a fresh Free-plan
 *                  50-subrequest budget — when it shared "0 * * * *",
 *                  telegram scraping + the warm fan-out spent the budget
 *                  first and the build's KEV/NVD/abuse.ch fetches threw
 *                  "Too many subrequests", shipping empty briefings
 *                  (daily-2026-06-04/05, and daily-2026-06-09 after the
 *                  heal was wrongly folded back into "0 * * * *").
 * - "30 0 * * *" → daily briefing for the prior calendar day
 * - "45 0 * * 1" → weekly briefing for the prior ISO week (Mon → Sun)
 * - "0 * * * *"  → warm /api/v1/snapshot + /api/v1/ioc-snapshot once
 *                  per hour. Was every 5 min — that cadence was burning
 *                  Workers KV writes for negligible UX gain. Snapshot
 *                  cache TTL bumped to 1h to match.
 */
export async function handleScheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
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

  // Hourly cache-warm cron — also run the publisher + Telegram archive +
  // intel-bundle warmer.
  if (csCron === '0 * * * *') {
    ctx.waitUntil(runPublisherNow(env as unknown as CaseStudyEnv, csNow).catch(logCronFail('publisher')));
    ctx.waitUntil(runTelegramArchive(env as unknown as ApiEnv).catch(logCronFail('telegram-archive')));
    // Live-IOC slice warmer — enqueue a per-source refresh so the live-iocs
    // page composes from fresh KV slices instead of paying the synchronous
    // fan-out on a cold cache (PR3). Idle backstop; the handler also enqueues
    // (debounced) on cache miss during active use.
    if (env.FEEDS_QUEUE) {
      ctx.waitUntil(enqueueAllFeeds(env.FEEDS_QUEUE).catch(logCronFail('live-iocs-enqueue')));
    }
    ctx.waitUntil(
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

    // Victim re-leaks: precompute the heavy ~20s ransomlook fan-out OFF the
    // request path, every 6h (aligned to the 6h edge-cache TTL), and park it in
    // KV. The handler then serves KV in ~10ms instead of doing the slow compute
    // while a user waits — which was intermittently tripping Cloudflare's
    // request-duration limit and 500ing (and that 500 got edge-cached for 6h).
    if (csNow.getUTCHours() % 6 === 3) {
      ctx.waitUntil(
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
  }

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

        // === Telegram leak scanning — FIRST, before anything else hits t.me ===
        // Telegram throttles repeated scrape bursts from the same egress IP. The
        // cache-warm below (it fetches /api/v1/telegram-feed) and the watched-
        // channel scrape also hit t.me, so running the feed scan here guarantees
        // it gets the first, un-throttled pass. Previously it ran LAST and found
        // ~0 new leaks every hour (only manual triggers — a single clean burst —
        // worked). Also placed ahead of the briefing-rebuild early-return below,
        // so a rebuild hour can't skip leak scanning entirely.
        try {
          if (env.BRIEFINGS_DB) {
            const feed = await fetchTelegramFeed(env.KV_CACHE);
            if (feed?.items?.length) {
              const result = await runTelegramLeakScanner(env.BRIEFINGS_DB, feed.items);
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

        // Briefing self-heal runs in its OWN cron ("20 * * * *",
        // runBriefingHealOnce) — NOT here. It used to do briefing builds
        // in this same invocation, after telegram scraping + the warm fan-out
        // had already spent most of the Free-plan 50-subrequest budget, so the
        // build's KEV/NVD/abuse.ch fetches threw "Too many subrequests" and it
        // shipped empty (or no) briefings. Isolating it gives the build a clean
        // budget.

        // Cache-warm fan-out. Briefing builds no longer share this invocation
        // (they live in the "20 * * * *" heal cron), so this always runs — it
        // no longer needs to be skipped to spare the briefing build's budget.
        const start = Date.now();
        const baseUrl = (env as unknown as { SITE_URL?: string }).SITE_URL ?? 'https://pranithjain.qzz.io';
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
          '/api/v1/global-pulse',
          '/api/v1/crypto-scam-feed',
          '/api/v1/breach-disclosures',
          '/api/v1/live-iocs',
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
        const composerTargets = ['/api/v1/snapshot', '/api/v1/ioc-snapshot'];
        async function warm(path: string) {
          const req = new Request(baseUrl + path, { method: 'GET' });
          const res = await apiApp.fetch(req, env as never, ctx);
          await res.arrayBuffer();
          return { path, status: res.status };
        }
        {
          const perSource = await Promise.allSettled(perSourceTargets.map(warm));
          const composers = await Promise.allSettled(composerTargets.map(warm));
          // Warm USGS earthquakes into dedicated cache
          await warmUsgs();
          const summary = [...perSource, ...composers]
            .map((r, i) => {
              const path = [...perSourceTargets, ...composerTargets][i];
              return r.status === 'fulfilled'
                ? `${r.value.path}=${r.value.status}`
                : `${path}=err(${(r.reason as Error).message})`;
            })
            .join(' ');
          console.log(JSON.stringify({ job: 'cache-warm', duration_ms: Date.now() - start, summary }));
        }

        // === Write warmed data to KV for global-pulse fallback ===
        // The Cache API is per-colo, so global-pulse may miss cached data.
        // KV is globally replicated — write key endpoints' data there.
        if (env.KV_CACHE) {
          const kvTargets = [
            { path: '/api/v1/threat-map', kvKey: 'gp:threat-map' },
            { path: '/api/v1/telegram-feed', kvKey: 'gp:telegram-feed' },
            { path: '/api/v1/ransomware-recent', kvKey: 'gp:ransomware-recent' },
            { path: '/api/v1/deepdarkcti', kvKey: 'gp:deepdarkcti' },
            { path: '/api/v1/stealer-forum-intel', kvKey: 'gp:stealer-forum-intel' },
            { path: '/api/v1/cve-recent', kvKey: 'gp:cve-recent' },
            { path: '/api/v1/live-iocs', kvKey: 'gp:live-iocs' },
          ];
          for (const t of kvTargets) {
            try {
              const req = new Request(baseUrl + t.path);
              const res = await apiApp.fetch(req, env as never, ctx);
              const body = await res.text();
              await env.KV_CACHE.put(t.kvKey, body, { expirationTtl: 3600 });
            } catch (e) {
              console.error(
                JSON.stringify({
                  job: 'cache-warm',
                  sub: 'kv-write',
                  path: t.path,
                  status: 'failed',
                  error: e instanceof Error ? e.message : String(e),
                })
              );
            }
          }
          console.log(JSON.stringify({ job: 'cache-warm', sub: 'kv-global-pulse', status: 'written' }));
        }

        // === Watch engine ===
        try {
          const watchAlerts = await checkWatches(env.KV_CACHE as unknown as KVNamespace, new Date().toISOString(), db);
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
          console.error(JSON.stringify({ job: 'pir-alert-check', error: e instanceof Error ? e.message : String(e) }));
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
            const { runRetentionSweep } = await import('../api/src/lib/retention');
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
      })()
        .catch(logCronFail('hourly-cron'))
        .finally(releaseLease)
    );
    ctx.waitUntil(Promise.resolve().then(() => logCronDone({ path: 'hourly' })));
    return;
  }

  // === Briefing self-heal — dedicated hourly invocation ===
  // Runs ALONE (no telegram scrape, no warm fan-out) so the briefing build
  // gets a fresh Free-plan 50-subrequest budget. Rebuilds AT MOST ONE briefing
  // per fire (see runBriefingHealOnce) — sharing "0 * * * *" with the warm
  // fan-out is what blew the budget and shipped empty/missing briefings
  // (daily-2026-06-04/05, daily-2026-06-09).
  if (cron === '20 * * * *') {
    ctx.waitUntil(
      runBriefingHealOnce(env)
        .catch(logCronFail('briefing-heal'))
        .finally(() => logCronDone({ path: 'briefing-heal' }))
        .finally(releaseLease)
    );
    return;
  }

  // === Dedicated briefings cron path ===
  if (cron !== '30 0 * * *' && cron !== '45 0 * * 1' && cron !== '30 2 1 * *') {
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

  // Monthly threat landscape report — fires 1st of the month at 02:30 UTC.
  // NOTE: cron is intentionally NOT registered in wrangler.jsonc because the
  // Cloudflare free plan caps triggers at 5 and we have 5 other scheduled
  // jobs that are more frequent. Landscape reports are built on-demand via
  // POST /api/v1/briefings/build?type=landscape (admin token). The handler
  // below is preserved so the cron can be re-enabled in one line if the
  // plan limit changes.
  // Reuses the briefings table with type='landscape'. Idempotent: a row
  // for the current month (if already written) is left in place.
  if (cron === '30 2 1 * *') {
    const db = env.BRIEFINGS_DB as D1Database;
    ctx.waitUntil(
      (async () => {
        const slug = expectedLandscapeSlug();
        try {
          const report = await buildLandscapeReport(new Date(), { env: env as unknown as ApiEnv });
          const result = await writeLandscapeReport(db, report);
          console.log(
            JSON.stringify({
              job: 'landscape-build',
              written: result.written,
              slug,
              reason: result.reason ?? 'n/a',
              victims: report.stats.ransomware_victims,
              groups: report.stats.top_groups,
            })
          );
        } catch (err) {
          console.error(
            JSON.stringify({
              job: 'landscape-build',
              status: 'failed',
              error: err instanceof Error ? err.message : String(err),
            })
          );
        }
        logCronDone({ path: 'briefing-dedicated', type: 'landscape' });
      })()
        .catch(logCronFail('landscape-dedicated'))
        .finally(releaseLease)
    );
    return;
  }

  const isWeekly = cron === '45 0 * * 1';
  const type = isWeekly ? 'weekly' : 'daily';

  ctx.waitUntil(
    (async () => {
      const db = env.BRIEFINGS_DB as D1Database;
      try {
        const briefing = await buildBriefing(type, undefined, {
          nvdApiKey: env.NVD_API_KEY,
          env: env as unknown as ApiEnv,
        });
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
      logCronDone({ path: 'briefing-dedicated', type });
    })()
      .catch(logCronFail('briefing-dedicated'))
      .finally(releaseLease)
  );
}

/**
 * Briefing self-heal — rebuilds AT MOST ONE briefing per call, in priority
 * order: a broken/stale/missing daily-yesterday, then the weekly. Called from
 * the dedicated "20 * * * *" cron.
 *
 * One build per invocation is the whole point: a single briefing build fits
 * comfortably under the Free-plan 50-subrequest cap (the 00:30 dedicated cron
 * proves it), but folding this heal back into "0 * * * *" — on top of telegram
 * scraping and the warm fan-out — blew the budget, so every KEV/NVD/abuse.ch
 * fetch threw "Too many subrequests" and the heal wrote 0-finding / 0-IOC
 * briefings, or (when an un-wrapped await like fetchNvdByIds threw) no row at
 * all (daily-2026-06-09). A backlog of stale rows drains over the next few
 * hourly ticks instead of all at once.
 *
 * `healOne` returns true once it ATTEMPTS a build (even if that build throws),
 * so the caller stops after one — a failed build still spent the invocation's
 * budget, and retrying a second build in the same fire would likely fail too.
 */
async function runBriefingHealOnce(env: Env): Promise<void> {
  const db = env.BRIEFINGS_DB as D1Database | undefined;
  if (!db) return;

  const healOne = async (
    type: 'daily' | 'weekly',
    slug: string,
    opts?: {
      minAgeMs?: number;
      extraHealCheck?: (row: { stats_json?: string; body?: string } | null) => Promise<boolean>;
    }
  ): Promise<boolean> => {
    // Read stats AND body in one query: stats decide richness, body carries the
    // `degraded` flag + `generated_at` the cooldown needs. A degraded briefing
    // keeps its abuse.ch IOCs, so a richness-only check saw iocs>0 and skipped
    // it forever; `briefingNeedsHeal` keeps degraded rows eligible, subject to
    // the cooldown. A MISSING row returns null → briefingNeedsHeal(null)=true,
    // so the heal rebuilds it from scratch.
    const row = await db
      .prepare('SELECT stats_json, body FROM briefings WHERE slug = ?')
      .bind(slug)
      .first<{ stats_json?: string; body?: string }>();
    const needsHeal = briefingNeedsHeal(row, { now: Date.now(), cooldownMs: opts?.minAgeMs });
    const extraHeal = !needsHeal && opts?.extraHealCheck ? await opts.extraHealCheck(row) : false;
    if (!needsHeal && !extraHeal) return false;
    try {
      const briefing = await buildBriefing(type, undefined, {
        nvdApiKey: env.NVD_API_KEY,
        env: env as unknown as ApiEnv,
      });
      const result = await writeBriefing(db, briefing);
      console.log(
        JSON.stringify({
          job: `briefing-heal(${type})`,
          status: result.written ? 'wrote' : `skipped(${result.reason})`,
          slug: briefing.slug,
          findings: briefing.stats.findings,
          iocs: briefing.stats.iocs,
        })
      );
    } catch (err) {
      console.error(
        JSON.stringify({
          job: `briefing-heal(${type})`,
          status: 'build_failed',
          error: err instanceof Error ? err.message : String(err),
        })
      );
    }
    return true; // attempted a build — this invocation's one slot is spent
  };

  // 1) daily-yesterday — skip at UTC hour 0 (the 00:30 dedicated cron owns it).
  //    NVD/cvefeed lag 12-24h, so re-enrich while live feeds still cover it;
  //    3h cooldown keeps a genuinely CVE-quiet day from rebuilding hourly.
  if (new Date().getUTCHours() !== 0) {
    const yesterday = new Date(Date.now() - 86400_000);
    const healed = await healOne('daily', `daily-${yesterday.toISOString().slice(0, 10)}`, {
      minAgeMs: 30 * 60_000,
      extraHealCheck: async (row) => dailyNeedsCveReenrich(row, { now: Date.now(), cooldownMs: 3 * 60 * 60_000 }),
    });
    if (healed) return;
  }

  // 2) weekly — the cron only fires Mondays, so without an hourly retry a
  //    degraded weekly stays stuck for 7 days. The extra check catches a weekly
  //    that `isBriefingRich` wrongly passes because its recent-only feeds no
  //    longer cover the window even though its dailies are rich (the W22 bug).
  await healOne('weekly', expectedWeeklySlug(), {
    minAgeMs: 30 * 60_000,
    extraHealCheck: async (row) => {
      let range: { range_start?: string; range_end?: string } = {};
      try {
        range = row?.body ? JSON.parse(row.body) : {};
      } catch {
        return false;
      }
      if (!range.range_start || !range.range_end) return false;
      return weeklyUndercountsDailies(db, expectedWeeklySlug(), range.range_start, range.range_end);
    },
  });
}
