import apiApp from '../api/src/index';
import {
  BRIEFING_MAX_AGE_DAYS,
  buildBriefing,
  writeBriefing,
  sweepOldBriefings,
  expectedWeeklySlug,
} from '../api/src/lib/briefing-builder';
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

        const isRich = (statsJson: string | undefined): boolean => {
          try {
            const s = JSON.parse(statsJson || '{}') as { findings?: number; iocs?: number };
            return (s.findings ?? 0) > 0 || (s.iocs ?? 0) > 0;
          } catch {
            return false;
          }
        };
        const healOne = async (type: 'daily' | 'weekly', slug: string) => {
          if (!db) return;
          const row = await db
            .prepare('SELECT stats_json FROM briefings WHERE slug = ?')
            .bind(slug)
            .first<{ stats_json: string }>();
          if (row && isRich(row.stats_json)) return;
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
        if (db && new Date().getUTCHours() !== 0) {
          const yesterday = new Date(Date.now() - 86400_000);
          await healOne('daily', `daily-${yesterday.toISOString().slice(0, 10)}`);
        }
        // Weekly self-heal once/day at UTC hour 2
        if (db && new Date().getUTCHours() === 2) {
          await healOne('weekly', expectedWeeklySlug());
        }

        if (rebuiltThisHour) {
          console.log('scheduled: skipped snapshot warm this hour — briefing catch-up took the subrequest budget');
          return;
        }

        // No rebuild needed → warm caches with the full budget.
        const start = Date.now();
        const baseUrl = 'https://pranithjain.qzz.io';
        const perSourceTargets = [
          '/api/v1/threat-map',
          '/api/v1/rules',
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

        // === Watch engine ===
        try {
          const watchAlerts = await checkWatches(env.KV_CACHE as unknown as KVNamespace, new Date().toISOString());
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

        // === RAG corpus re-index (every 6h, at ~:20 past) ===
        if (csNow.getUTCHours() % 6 === 2) {
          try {
            const telegram = await indexTelegramLeaks(env as unknown as ApiEnv);
            const corpora = await indexAllCorpora(env as unknown as ApiEnv);
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
      })().catch(logCronFail('hourly-cron'))
    );
    ctx.waitUntil(Promise.resolve().then(() => logCronDone({ path: 'hourly' })));
    return;
  }

  // === Dedicated briefings cron path ===
  if (cron !== '30 0 * * *' && cron !== '45 0 * * 1') return;
  if (!env.BRIEFINGS_DB) {
    console.warn('scheduled: BRIEFINGS_DB not bound, skipping');
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
