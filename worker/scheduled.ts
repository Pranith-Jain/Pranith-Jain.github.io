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
import { buildBlocklists } from '../api/src/lib/blocklist-builder';
import { indexTelegramLeaks } from '../api/src/routes/rag-index';
import { indexAllCorpora } from '../api/src/routes/rag-corpus-index';
import { detectPirAlerts } from '../api/src/routes/pir';
import { runGraphIngest } from '../api/src/routes/graph-ingest';
import { autoRunFeedJobs } from '../api/src/routes/feed-scheduler';
import type { D1Database } from '@cloudflare/workers-types';
import type { Env as ApiEnv } from '../api/src/env';
import type { Env } from './env';

/**
 * Cron-triggered work. Dispatched on cron string:
 * - "5 0 * * *"  → daily briefing for the prior calendar day
 * - "15 0 * * 1" → weekly briefing for the prior ISO week (Mon → Sun)
 * - "0 * * * *"  → warm /api/v1/snapshot + /api/v1/ioc-snapshot once
 *                  per hour. Was every 5 min — that cadence was burning
 *                  Workers KV writes for negligible UX gain. Snapshot
 *                  cache TTL bumped to 1h to match.
 */
export async function handleScheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
  const cron = event.cron;
  const startMs = Date.now();

  // === Per-cron-string single-flight lock ============================
  if (env.KV_CACHE) {
    try {
      const lockKey = `cron:lock:${cron}`;
      const held = await env.KV_CACHE.get(lockKey);
      if (held) {
        console.log(JSON.stringify({ job: 'cron-lock', cron, status: 'skipped_overlap', held_since: held }));
        return;
      }
      await env.KV_CACHE.put(lockKey, new Date().toISOString(), { expirationTtl: 120 });
    } catch {
      /* KV transient — fail-open */
    }
  }

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
    ctx.waitUntil(runTelegramArchive(env).catch(logCronFail('telegram-archive')));
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

  // Case-study discovery — its OWN invocation
  if (csCron === '5 0 * * *') {
    ctx.waitUntil(
      runDiscoveryNow(env as unknown as CaseStudyEnv, csNow)
        .catch(logCronFail('discovery'))
        .finally(() => logCronDone({ path: 'discovery' }))
    );
    return;
  }

  // Case-study planner — its own invocation.
  if (csCron === '15 0 * * 1') {
    ctx.waitUntil(
      runPlannerNow(env as unknown as CaseStudyEnv, csNow)
        .catch(logCronFail('planner'))
        .finally(() => logCronDone({ path: 'planner' }))
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

        let rebuiltThisHour = false;

        const healOne = async (
          type: 'daily' | 'weekly',
          slug: string,
          opts?: {
            minAgeMs?: number;
            /**
             * Extra "this row is stale" predicate consulted when the standard
             * richness/degraded check says the row is fine. Lets the weekly
             * heal catch a briefing that `isBriefingRich` wrongly passes (e.g.
             * W22's 5 findings) by comparing it against its dailies.
             */
            extraHealCheck?: (row: { stats_json?: string; body?: string } | null) => Promise<boolean>;
          }
        ) => {
          if (!db) return;
          // Read stats AND body in one query: stats decide richness, body
          // carries the `degraded` flag + `generated_at` the cooldown needs.
          // A degraded briefing keeps its abuse.ch IOCs, so a richness-only
          // check (the old isRich short-circuit) saw iocs>0 and skipped it
          // forever — weekly-2026-W22 stayed degraded indefinitely after
          // upstreams recovered. `briefingNeedsHeal` keeps degraded rows
          // eligible for rebuild, subject only to the cooldown.
          const row = await db
            .prepare('SELECT stats_json, body FROM briefings WHERE slug = ?')
            .bind(slug)
            .first<{ stats_json?: string; body?: string }>();
          const needsHeal = briefingNeedsHeal(row, { now: Date.now(), cooldownMs: opts?.minAgeMs });
          const extraHeal = !needsHeal && opts?.extraHealCheck ? await opts.extraHealCheck(row) : false;
          if (!needsHeal && !extraHeal) return;
          rebuiltThisHour = true;
          try {
            const briefing = await buildBriefing(type, undefined, {
              nvdApiKey: env.NVD_API_KEY,
              env: env as unknown as ApiEnv,
            });
            const result = await writeBriefing(db, briefing);
            if (result.written) {
              console.log(
                `scheduled(${type}-catch-up): wrote ${briefing.slug} (findings=${briefing.stats.findings}, iocs=${briefing.stats.iocs})`
              );
            }
          } catch (err) {
            console.error(
              JSON.stringify({
                job: `scheduled(${type}-catch-up)`,
                status: 'build_failed',
                error: err instanceof Error ? err.message : String(err),
              })
            );
          }
        };

        // Daily: skip UTC hour 0 — the 00:30 dedicated cron is imminent.
        // Cooldown 30min — the daily catches up on quiet days; doesn't need
        // to retry every hour, but once an hour is fine and short enough
        // that the next attempt lands inside most rate-limit cool-offs.
        if (db && new Date().getUTCHours() !== 0) {
          const yesterday = new Date(Date.now() - 86400_000);
          await healOne('daily', `daily-${yesterday.toISOString().slice(0, 10)}`, {
            minAgeMs: 30 * 60_000,
            // NVD (and sometimes cvefeed) lags 12-24h, so the 00:30 build can
            // miss yesterday's high/critical CVEs and land findings=0 while the
            // abuse.ch IOC feeds still populate. isBriefingRich counts iocs>0 as
            // complete, so without this the daily would freeze CVE-less for good
            // (the early-May dailies). Re-enrich while live feeds still cover
            // yesterday; 3h cooldown keeps a genuinely CVE-quiet day from
            // rebuilding hourly.
            extraHealCheck: async (row) => dailyNeedsCveReenrich(row, { now: Date.now(), cooldownMs: 3 * 60 * 60_000 }),
          });
        }
        // Weekly self-heal — every hour (was: once/day at UTC hour 2). The
        // weekly cron only fires Mondays, so a degraded weekly was previously
        // stuck for 7 days. Hourly retry with a 30min cooldown recovers
        // within an hour of KEV/NVD coming back, while not burning a full
        // rebuild on back-to-back hours while upstreams stay blocked.
        if (db) {
          await healOne('weekly', expectedWeeklySlug(), {
            minAgeMs: 30 * 60_000,
            // The weekly feeds are recent-only, so a weekly built late re-queries
            // a window they no longer cover and collapses to KEV-only even though
            // its dailies are rich (the W22 bug). `isBriefingRich` then sees a few
            // findings and skips the heal forever. Catch that by comparing the
            // stored weekly against its constituent dailies; the rebuild now rolls
            // them in, so once repaired it's no longer sparse and stops rebuilding.
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

        // When a briefing catch-up already spent this hour's subrequest budget,
        // skip ONLY the heavy cache-warm fan-out below — but still fall through
        // to the cheap KV/D1 maintenance jobs (watch engine, blocklist, PIR
        // alerts, retention, feed scheduler). This previously `return`ed, which
        // paused alerting + retention for the entire hour on upstream-lag days.
        const start = Date.now();
        const baseUrl = 'https://pranithjain.qzz.io';
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
          '/api/v1/maltiverse/search?q=ransomware',
          '/api/v1/certspotter/search?domain=example.com',
        ];
        const composerTargets = ['/api/v1/snapshot', '/api/v1/ioc-snapshot'];
        async function warm(path: string) {
          const req = new Request(baseUrl + path, { method: 'GET' });
          const res = await apiApp.fetch(req, env as never, ctx);
          await res.arrayBuffer();
          return { path, status: res.status };
        }
        if (rebuiltThisHour) {
          console.log('scheduled: skipped snapshot warm this hour — briefing catch-up took the subrequest budget');
        } else {
          const perSource = await Promise.allSettled(perSourceTargets.map(warm));
          const composers = await Promise.allSettled(composerTargets.map(warm));
          const summary = [...perSource, ...composers]
            .map((r, i) => {
              const path = [...perSourceTargets, ...composerTargets][i];
              return r.status === 'fulfilled'
                ? `${r.value.path}=${r.value.status}`
                : `${path}=err(${(r.reason as Error).message})`;
            })
            .join(' ');
          console.log(`scheduled: warmed in ${Date.now() - start}ms — ${summary}`);
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
          try {
            if (!db) {
              console.warn('graph-ingest: no db');
              return;
            }
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

        // === 30-day data retention sweep ===
        // Runs on the hourly cron so we don't burn a 6th trigger slot.
        // The sweep is a no-op most hours (no rows past 30d yet) but
        // guarantees the data-minimization policy is enforced.
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
      })().catch(logCronFail('hourly-cron'))
    );
    ctx.waitUntil(Promise.resolve().then(() => logCronDone({ path: 'hourly' })));
    return;
  }

  // === Dedicated briefings cron path ===
  if (cron !== '30 0 * * *' && cron !== '45 0 * * 1' && cron !== '30 2 1 * *') return;
  if (!env.BRIEFINGS_DB) {
    console.warn('scheduled: BRIEFINGS_DB not bound, skipping');
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
            `scheduled(landscape): ${result.written ? 'wrote' : 'skipped'} ${slug} (reason=${result.reason ?? 'n/a'}, victims=${report.stats.ransomware_victims}, groups=${report.stats.top_groups})`
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
      })().catch(logCronFail('landscape-dedicated'))
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
          `scheduled: wrote ${briefing.slug} (findings=${briefing.stats.findings}, iocs=${briefing.stats.iocs})`
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
            `scheduled: swept ${result.deleted.length} old briefings (${result.deleted.join(', ')}); kept ${result.kept}`
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
    })().catch(logCronFail('briefing-dedicated'))
  );
}
