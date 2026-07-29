import type { Context } from 'hono';
import type { Env } from '../../env';
import type {
  PulseEvent,
  PulseKind,
  GlobalPulseResponse,
  XClaimsResponse,
  ActorTimelineResponse,
  IocCorrelationResponse,
} from './types';
import { GP_FEEDS, gpWarmKey, GLOBAL_PULSE_CACHE, CACHE_TTL, GP_RESPONSE_KEY, GP_RESPONSE_TTL } from './config';
import { listBriefings } from '../../lib/briefing-builder';
import { readKvJson } from './shared';
import { signInternalToken } from '../../lib/internal-token';
import {
  iocFromThreatMap,
  fromReddit,
  fromTelegram,
  fromXFeed,
  fromScam,
  fromBreaches,
  fromBriefings,
  fromLiveIocs,
  fromSecretLeaks,
  fromMaliciousPackages,
  fromExploitDb,
  fromGithubAdvisories,
  fromCisaKev,
  fromStealerForum,
  fromPhishing,
  fromMalware,
  fromRansomware,
  fromCybercrime,
  fromWriteups,
  fromCveRecent,
  fromXClaims,
  fromActorTimeline,
  fromIocCorrelation,
  fromFirms,
  fromUkmto,
  fromCyberPulse,
  fromRss,
} from './converters';
import {
  fetchEarthquakes,
  fetchNaturalEvents,
  fetchFlights,
  fetchGdacsAlerts,
  fetchBotnetC2,
  fetchSupplyChain,
  fetchDShieldAttackers,
  fetchCompromisedIPs,
  fetchBlocklistAttackers,
  fetchCisaKev,
  fetchUrlhaus,
} from './fetchers';
import { getTechInfrastructureEvents, getGeopoliticalEvents, getCableEvents, getFinancialEvents } from './static-data';

/* ─── Signed self-fetch helper ──────────────────────────────────────────── */
// Retry fallbacks need to call SELF.fetch() with an internal token so the
// auth middleware lets them through. Signs once per handler invocation.
async function signedSelfFetch(
  self: { fetch: (req: RequestInfo, init?: RequestInit) => Promise<Response> } | undefined,
  path: string,
  env: { INTERNAL_TOKEN_SECRET?: string },
  timeoutMs = 10_000
): Promise<Response | null> {
  if (!self) return null;
  const tokenSecret = env.INTERNAL_TOKEN_SECRET;
  if (!tokenSecret) return null;
  try {
    const token = await signInternalToken('cron', tokenSecret);
    return await self.fetch(
      new Request(`https://self${path}`, {
        headers: { 'x-internal-token': token },
        signal: AbortSignal.timeout(timeoutMs),
      })
    );
  } catch {
    return null;
  }
}

/* ─── Handler ───────────────────────────────────────────────────────────── */

export async function globalPulseHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const force = new URL(c.req.url).searchParams.get('force') === '1';
  const cache = caches.default;
  const cacheReq = new Request(GLOBAL_PULSE_CACHE);

  if (!force) {
    const cached = await cache.match(cacheReq);
    if (cached) return new Response(cached.body, cached);
  }

  const kv = c.env.KV_CACHE;

  // Global full-response cache (KV is global; the Cache-API above is per-colo).
  // A reader in a colo that hasn't built the response recently serves the last
  // successful build with ONE cheap KV read instead of re-running the whole
  // multi-source build — which on a cold cache can exceed the Free-plan
  // 50-subrequest cap (and CPU budget) and return HTTP 503. Rewritten by the
  // background build below.
  if (!force && kv) {
    const kvBody = await kv.get(GP_RESPONSE_KEY);
    if (kvBody) {
      // Warm the per-colo Cache-API so repeat crawls in this colo skip KV.
      c.executionCtx.waitUntil(
        cache.put(cacheReq, new Response(kvBody, { headers: { 'content-type': 'application/json' } })).catch(() => {})
      );
      return new Response(kvBody, {
        headers: {
          'content-type': 'application/json',
          'cache-control': `public, max-age=${CACHE_TTL}`,
          'access-control-allow-origin': '*',
        },
      });
    }
  }

  // Cache miss. Instead of kicking off a background build that exceeds the
  // Free-plan CPU/subrequest budget and gets killed silently, assemble the
  // response synchronously from two cheap sources:
  //   1. Per-feed warm KV slices (gp:warm:<key>) — warmed by the queue consumer
  //   2. Direct SELF.fetch for the 3 highest-value feeds (CVE, ransomware, IOCs)
  // This stays within the 50-subrequest budget (21 KV reads + 3 SELF.fetch = 24)
  // and returns immediately with real data. The full 30+ source build that
  // includes external fetchers (earthquakes, flights, botnet C2, etc.) runs
  // in the background via waitUntil — if it completes, it populates the caches
  // for the next request; if it gets killed by CPU limits, the sync data
  // still serves a useful map.
  const self = c.env.SELF;

  // Safe wrapper — used by both the sync fetch and the background build.
  const safe = <T>(fn: () => T): T => {
    try {
      return fn();
    } catch (_catchErr) {
      console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
      return [] as unknown as T;
    }
  };

  // ── Read per-feed warm KV slices (one batched read) ──────────────────
  const warm: Record<string, unknown> = {};
  if (kv) {
    const sliceVals = await Promise.all(GP_FEEDS.map((f) => readKvJson(kv, gpWarmKey(f.key))));
    GP_FEEDS.forEach((f, i) => {
      if (sliceVals[i] != null) warm[f.key] = sliceVals[i];
    });
  }

  // ── Synchronously fetch the 3 highest-value feeds ────────────────────
  const syncEvents: PulseEvent[] = [];
  try {
    const [cveRes, ransomRes, iocRes] = await Promise.allSettled([
      signedSelfFetch(self, '/api/v1/cve-recent?days=7', c.env, 12000),
      signedSelfFetch(self, '/api/v1/ransomware-recent?days=7', c.env, 10000),
      signedSelfFetch(self, '/api/v1/live-iocs', c.env, 10000),
    ]);
    if (cveRes.status === 'fulfilled' && cveRes.value?.ok) {
      const cveData = (await cveRes.value.json()) as Parameters<typeof fromCveRecent>[0];
      syncEvents.push(...safe(() => fromCveRecent(cveData)));
    }
    if (ransomRes.status === 'fulfilled' && ransomRes.value?.ok) {
      const ransomData = (await ransomRes.value.json()) as Parameters<typeof fromRansomware>[0];
      syncEvents.push(...safe(() => fromRansomware(ransomData)));
    }
    if (iocRes.status === 'fulfilled' && iocRes.value?.ok) {
      const iocData = (await iocRes.value.json()) as Parameters<typeof fromLiveIocs>[0];
      syncEvents.push(...safe(() => fromLiveIocs(iocData)));
    }
  } catch (_catchErr) {
    console.error(
      'global-pulse sync fetch failed:',
      _catchErr instanceof Error ? _catchErr.message : String(_catchErr)
    );
  }

  // ── Convert warm KV slices to events ─────────────────────────────────
  const warmEvents: PulseEvent[] = [];
  if (warm.tm) warmEvents.push(...safe(() => iocFromThreatMap(warm.tm as Parameters<typeof iocFromThreatMap>[0])));
  if (warm.telegram) warmEvents.push(...safe(() => fromTelegram(warm.telegram as Parameters<typeof fromTelegram>[0])));
  if (warm.reddit) warmEvents.push(...safe(() => fromReddit(warm.reddit as Parameters<typeof fromReddit>[0])));
  if (warm.x) warmEvents.push(...safe(() => fromXFeed(warm.x as Parameters<typeof fromXFeed>[0])));
  if (warm.scam) warmEvents.push(...safe(() => fromScam(warm.scam as Parameters<typeof fromScam>[0])));
  if (warm.breach) warmEvents.push(...safe(() => fromBreaches(warm.breach as Parameters<typeof fromBreaches>[0])));
  if (warm.stealer)
    warmEvents.push(...safe(() => fromStealerForum(warm.stealer as Parameters<typeof fromStealerForum>[0])));
  if (warm.phishing) warmEvents.push(...safe(() => fromPhishing(warm.phishing as Parameters<typeof fromPhishing>[0])));
  if (warm.malware) warmEvents.push(...safe(() => fromMalware(warm.malware as Parameters<typeof fromMalware>[0])));
  if (warm.cybercrime)
    warmEvents.push(...safe(() => fromCybercrime(warm.cybercrime as Parameters<typeof fromCybercrime>[0])));
  if (warm.writeups) warmEvents.push(...safe(() => fromWriteups(warm.writeups as Parameters<typeof fromWriteups>[0])));
  if (warm.xclaims) warmEvents.push(...safe(() => fromXClaims(warm.xclaims as XClaimsResponse)));
  if (warm.actor) warmEvents.push(...safe(() => fromActorTimeline(warm.actor as ActorTimelineResponse)));
  if (warm.iocc) warmEvents.push(...safe(() => fromIocCorrelation(warm.iocc as IocCorrelationResponse)));
  if (warm.secretleaks)
    warmEvents.push(...safe(() => fromSecretLeaks(warm.secretleaks as Parameters<typeof fromSecretLeaks>[0])));
  if (warm.malpkg)
    warmEvents.push(...safe(() => fromMaliciousPackages(warm.malpkg as Parameters<typeof fromMaliciousPackages>[0])));
  if (warm.exploit) warmEvents.push(...safe(() => fromExploitDb(warm.exploit as Parameters<typeof fromExploitDb>[0])));
  if (warm.ghsa)
    warmEvents.push(...safe(() => fromGithubAdvisories(warm.ghsa as Parameters<typeof fromGithubAdvisories>[0])));
  if (warm.kev) warmEvents.push(...safe(() => fromCisaKev(warm.kev as Parameters<typeof fromCisaKev>[0])));
  if (warm.rss) warmEvents.push(...safe(() => fromRss(warm.rss as Parameters<typeof fromRss>[0])));

  // ── CyberPulse incidents (D1) ────────────────────────────────────────
  let cyberpulseEvents: PulseEvent[] = [];
  try {
    const cpRes = await signedSelfFetch(self, '/api/v1/cyberpulse/incidents?days=7&limit=30', c.env, 10000);
    if (cpRes && cpRes.ok) {
      const cpData = (await cpRes.json()) as Parameters<typeof fromCyberPulse>[0];
      cyberpulseEvents = safe(() => fromCyberPulse(cpData));
    }
  } catch (_catchErr) {
    console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
  }

  // ── Merge + sort ─────────────────────────────────────────────────────
  const tagCti = <T extends PulseKind>(kind: T): PulseEvent['cti'] => {
    switch (kind) {
      case 'ransomware':
        return 'ransomware';
      case 'cve':
      case 'cisa_advisory':
        return 'cve';
      case 'ioc_activity':
      case 'cyber_attack':
      case 'c2_tracker':
      case 'blocklist':
        return 'ioc';
      case 'cyberpulse':
        return 'threat';
      case 'ioc_correlation':
        return 'ioc';
      case 'rss':
        return 'other';
      default:
        return 'other';
    }
  };
  const sevRank = (s: string): number => (s === 'critical' ? 4 : s === 'high' ? 3 : s === 'medium' ? 2 : 1);
  const allEvents = [...syncEvents, ...warmEvents, ...cyberpulseEvents]
    .map((e) => ({ ...e, cti: tagCti(e.kind) }))
    .sort((a, b) => {
      const sd = sevRank(b.severity) - sevRank(a.severity);
      if (sd !== 0) return sd;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

  const syncLayers: Record<string, number> = {};
  for (const e of allEvents) {
    syncLayers[e.kind] = (syncLayers[e.kind] ?? 0) + 1;
  }

  const json = JSON.stringify({
    generated_at: new Date().toISOString(),
    total_events: allEvents.length,
    events: allEvents,
    layers: syncLayers,
  });
  const response = new Response(json, {
    headers: {
      'content-type': 'application/json',
      'cache-control': `public, max-age=${CACHE_TTL}`,
      'access-control-allow-origin': '*',
    },
  });
  c.executionCtx.waitUntil(
    Promise.all([
      cache.put(cacheReq, response.clone()),
      kv ? kv.put(GP_RESPONSE_KEY, json, { expirationTtl: GP_RESPONSE_TTL }).catch(() => {}) : Promise.resolve(),
    ])
  );

  // ── Background build for external fetchers (earthquakes, flights, etc.) ──
  // Best-effort: if it completes, it enriches the next cache write. If the
  // CPU limit kills it, the sync data above still serves a useful map.
  c.executionCtx.waitUntil(
    (async () => {
      try {
        // ── Per-source data sources ───────────────────────────────────────
        // NOTE: the per-source Cache-API entries (CACHE_KEYS.*) are NEVER written —
        // only the full-response cache (GLOBAL_PULSE_CACHE) and the cron's `gp:*` KV
        // keys are. Reading them here was 22 dead subrequests every invocation that
        // pushed the build past the Free-plan 50-subrequest cap, starving the real
        // KV reads + direct fetches below (so telegram/x/reddit/cve silently came
        // back empty). Data now flows from cron-warmed KV (below) + direct fetches.
        // ── Single batched warm-cache read (gp:warm) ──────────────────────
        // ONE KV read here + ONE write at the end of the build replace the ~21
        // individual KV reads + ~21 writes that — together with the dead per-source
        // Cache-API reads — blew the Free-plan 50-subrequest cap and silently starved
        // telegram/x/reddit/cve/actor. With the budget freed, the direct-fetch
        // fallbacks below resolve every source. The blob is the raw per-source data
        // written by this same handler's prior build (self-warming).
        // Per-feed warm slices (`gp:warm:<key>`), written by the queue consumer one
        // feed per invocation. Read all keys in parallel — ≤21 KV reads on the read
        // path's own 50-subrequest budget (and the whole response is edge-cached, so
        // actual KV reads stay low). Falls back to the legacy single `gp:warm` blob
        // for any key not yet migrated to a per-feed slice.
        const warm: Record<string, unknown> = {};
        if (kv) {
          const legacy = (await readKvJson(kv, 'gp:warm')) as Record<string, unknown> | null;
          if (legacy && typeof legacy === 'object' && !Array.isArray(legacy)) {
            for (const k of Object.keys(legacy)) {
              if (Object.prototype.hasOwnProperty.call(legacy, k) && !k.startsWith('__')) {
                (warm as Record<string, unknown>)[k] = (legacy as Record<string, unknown>)[k];
              }
            }
          }
          const sliceVals = await Promise.all(GP_FEEDS.map((f) => readKvJson(kv, gpWarmKey(f.key))));
          GP_FEEDS.forEach((f, i) => {
            if (sliceVals[i] != null) warm[f.key] = sliceVals[i];
          });
        }
        const finalTm = warm.tm ?? null;
        const finalTg = warm.telegram ?? null;
        const finalRansom = warm.ransom ?? null;
        const finalStealer = warm.stealer ?? null;
        const finalCve = warm.cve ?? null;
        const finalIoc = warm.ioc ?? null;
        const finalReddit = warm.reddit ?? null;
        const finalX = warm.x ?? null;
        const finalScam = warm.scam ?? null;
        const finalBreach = warm.breach ?? null;
        const finalPhishing = warm.phishing ?? null;
        const finalMalware = warm.malware ?? null;
        const finalCybercrime = warm.cybercrime ?? null;
        const finalWriteups = warm.writeups ?? null;
        const finalXClaims = warm.xclaims ?? null;
        const finalActor = warm.actor ?? null;
        const finalIocCorr = warm.iocc ?? null;
        const finalFirms = warm.firms ?? null;
        const finalUkmto = warm.ukmto ?? null;
        const finalSecretLeaks = warm.secretleaks ?? null;
        const finalMalpkg = warm.malpkg ?? null;
        const finalExploit = warm.exploit ?? null;
        const finalGhsa = warm.ghsa ?? null;
        const finalKev = warm.kev ?? null;

        // ── Direct endpoint fallback for still-missing layers ─────────────
        // Fetch ALL missing endpoints via SELF binding (in-process, no loopback).
        // Workers cannot fetch their own public URL (Cloudflare blocks loopback),
        // so the old `fetch('https://pranithjain.qzz.io/...')` approach always
        // returned null for every feed when KV was cold — making every page visit
        // a fresh invocation with no data. SELF.fetch() avoids the loopback.
        // (self is declared in the outer scope — shared with the sync fetch above.)

        // The warm KV slices (gp:warm:<key>, warmed globally by the queue consumer
        // — one feed per invocation, 90-min TTL) are the read source for feed data.
        //
        // The previous fallback fanned out to ~20 SELF service-binding calls here
        // (one per feed missing from warm KV). Each call re-entered a feed handler
        // that does its OWN upstream fetches, so a cold-cache rebuild spent
        // 20 service-binding subrequests + their internal fetches + the 22 KV reads
        // + the 10 external layers below — well past the Free-plan 50-subrequest
        // cap — and Cloudflare returned HTTP 503 ("Couldn't load this"). Removed:
        // when a feed is absent from warm KV we skip that layer (a degraded map,
        // not a failed page). The conditional signedSelfFetch calls further down
        // still top up the highest-value feeds within budget.
        const direct: Record<string, unknown> = {};

        // Final merged data — cache/KV takes priority, direct is fallback
        const mergedTm = finalTm ?? (direct.tm as typeof finalTm);
        const mergedReddit = finalReddit ?? (direct.reddit as typeof finalReddit);
        const mergedX = finalX ?? (direct.x as typeof finalX);
        const mergedCve = finalCve ?? (direct.cve as typeof finalCve);
        const mergedRansom = finalRansom ?? (direct.ransom as typeof finalRansom);
        const mergedBreach = finalBreach ?? (direct.breach as typeof finalBreach);
        const mergedIoc = finalIoc ?? (direct.ioc as typeof finalIoc);
        const mergedPhishing = finalPhishing ?? (direct.phishing as typeof finalPhishing);
        const mergedMalware = finalMalware ?? (direct.malware as typeof finalMalware);
        const mergedScam = finalScam ?? (direct.scam as typeof finalScam);
        const mergedXClaims = finalXClaims ?? (direct.xclaims as typeof finalXClaims);
        const mergedActor = finalActor ?? (direct.actor as typeof finalActor);
        const mergedIocCorr = finalIocCorr ?? (direct.iocc as typeof finalIocCorr);
        const mergedFirms = finalFirms ?? (direct.firms as typeof finalFirms);
        const mergedUkmto = finalUkmto ?? (direct.ukmto as typeof finalUkmto);
        const mergedSecretLeaks = finalSecretLeaks ?? (direct.secretleaks as typeof finalSecretLeaks);
        const mergedMalpkg = finalMalpkg ?? (direct.malpkg as typeof finalMalpkg);
        const mergedExploit = finalExploit ?? (direct.exploit as typeof finalExploit);
        const mergedGhsa = finalGhsa ?? (direct.ghsa as typeof finalGhsa);
        const mergedKev = finalKev ?? (direct.kev as typeof finalKev);

        // ── Convert → events ───────────────────────────────────────────────
        const iocEvents = safe(() =>
          mergedTm ? iocFromThreatMap(mergedTm as Parameters<typeof iocFromThreatMap>[0]) : []
        );

        // Fetch threat map directly if cache is empty
        let finalIocEvents = iocEvents;
        if (finalIocEvents.length === 0) {
          try {
            const tmRes = await signedSelfFetch(self, '/api/v1/threat-map', c.env);
            if (tmRes && tmRes.ok) {
              const tmData = (await tmRes.json()) as Parameters<typeof iocFromThreatMap>[0];
              finalIocEvents = safe(() => iocFromThreatMap(tmData));
            }
          } catch (_catchErr) {
            console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
            /* degraded */
          }
        }
        const redditEvents = safe(() =>
          mergedReddit ? fromReddit(mergedReddit as Parameters<typeof fromReddit>[0]) : []
        );
        const telegramEvents = safe(() => (finalTg ? fromTelegram(finalTg) : []));
        const xEvents = safe(() => (mergedX ? fromXFeed(mergedX) : []));
        const scamEvents = safe(() => (mergedScam ? fromScam(mergedScam) : []));
        const breachEvents = safe(() => (mergedBreach ? fromBreaches(mergedBreach) : []));
        const liveIocEvents = safe(() => (mergedIoc ? fromLiveIocs(mergedIoc) : []));
        const infostealerEvents = safe(() => (finalStealer ? fromStealerForum(finalStealer) : []));
        const phishingEvents = safe(() => (mergedPhishing ? fromPhishing(mergedPhishing) : []));
        const malwareEvents = safe(() => (mergedMalware ? fromMalware(mergedMalware) : []));
        const ransomwareEvents = safe(() => (mergedRansom ? fromRansomware(mergedRansom) : []));
        // ── New CTI feed layers (warm-only; populated by the gp:warm cron) ──
        const secretLeakEvents = safe(() =>
          mergedSecretLeaks ? fromSecretLeaks(mergedSecretLeaks as Parameters<typeof fromSecretLeaks>[0]) : []
        );
        const malpkgEvents = safe(() =>
          mergedMalpkg ? fromMaliciousPackages(mergedMalpkg as Parameters<typeof fromMaliciousPackages>[0]) : []
        );
        const exploitEvents = safe(() =>
          mergedExploit ? fromExploitDb(mergedExploit as Parameters<typeof fromExploitDb>[0]) : []
        );
        const ghsaEvents = safe(() =>
          mergedGhsa ? fromGithubAdvisories(mergedGhsa as Parameters<typeof fromGithubAdvisories>[0]) : []
        );
        const kevEvents = safe(() => (mergedKev ? fromCisaKev(mergedKev as Parameters<typeof fromCisaKev>[0]) : []));
        const firmsEvents = safe(() =>
          fromFirms((mergedFirms ?? null) as Parameters<typeof fromFirms>[0])
        ) as PulseEvent[];
        const ukmtoEvents = safe(() =>
          fromUkmto((mergedUkmto ?? null) as Parameters<typeof fromUkmto>[0])
        ) as PulseEvent[];
        const cybercrimeEvents = safe(() => (finalCybercrime ? fromCybercrime(finalCybercrime) : []));
        const researchEvents = safe(() => (finalWriteups ? fromWriteups(finalWriteups) : []));
        const cveEvents = safe(() => (mergedCve ? fromCveRecent(mergedCve) : []));
        const xClaimsEvents = safe(() => (mergedXClaims ? fromXClaims(mergedXClaims as XClaimsResponse) : []));
        const actorEvents = safe(() => (mergedActor ? fromActorTimeline(mergedActor as ActorTimelineResponse) : []));
        const iocCorrEvents = safe(() =>
          mergedIocCorr ? fromIocCorrelation(mergedIocCorr as IocCorrelationResponse) : []
        );

        // Fetch earthquakes directly from USGS (cache was never populated)
        const earthquakes = await fetchEarthquakes();

        // Fetch CVE data directly if cache is empty
        let finalCveEvents = cveEvents;
        if (finalCveEvents.length === 0) {
          try {
            // cve-recent aggregates NVD + cvefeed and can take ~12s cold — give it 20s.
            const cveRes = await signedSelfFetch(self, '/api/v1/cve-recent?days=7', c.env, 20000);
            if (cveRes && cveRes.ok) {
              const cveData = (await cveRes.json()) as Parameters<typeof fromCveRecent>[0];
              finalCveEvents = safe(() => fromCveRecent(cveData));
            }
          } catch (_catchErr) {
            console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
            /* degraded */
          }
        }

        // Fetch ransomware data directly if cache is empty
        let finalRansomwareEvents = ransomwareEvents;
        if (finalRansomwareEvents.length === 0) {
          try {
            const ransomRes = await signedSelfFetch(self, '/api/v1/ransomware-recent?days=7', c.env);
            if (ransomRes && ransomRes.ok) {
              const ransomData = (await ransomRes.json()) as Parameters<typeof fromRansomware>[0];
              finalRansomwareEvents = safe(() => fromRansomware(ransomData));
            }
          } catch (_catchErr) {
            console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
            /* degraded */
          }
        }

        // Fetch live IOCs directly if cache is empty
        let finalLiveIocEvents = liveIocEvents;
        if (finalLiveIocEvents.length === 0) {
          try {
            const iocRes = await signedSelfFetch(self, '/api/v1/live-iocs', c.env);
            if (iocRes && iocRes.ok) {
              const iocData = (await iocRes.json()) as Parameters<typeof fromLiveIocs>[0];
              finalLiveIocEvents = safe(() => fromLiveIocs(iocData));
            }
          } catch (_catchErr) {
            console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
            /* degraded */
          }
        }

        // Fetch phishing data directly if cache is empty
        let finalPhishingEvents = phishingEvents;
        if (finalPhishingEvents.length === 0) {
          try {
            const phishRes = await signedSelfFetch(self, '/api/v1/phishing-urls', c.env);
            if (phishRes && phishRes.ok) {
              const phishData = (await phishRes.json()) as Parameters<typeof fromPhishing>[0];
              finalPhishingEvents = safe(() => fromPhishing(phishData));
            }
          } catch (_catchErr) {
            console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
            /* degraded */
          }
        }

        // Fetch malware data directly if cache is empty
        let finalMalwareEvents = malwareEvents;
        if (finalMalwareEvents.length === 0) {
          try {
            const malRes = await signedSelfFetch(self, '/api/v1/malware-samples', c.env);
            if (malRes && malRes.ok) {
              const malData = (await malRes.json()) as Parameters<typeof fromMalware>[0];
              finalMalwareEvents = safe(() => fromMalware(malData));
            }
          } catch (_catchErr) {
            console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
            /* degraded */
          }
        }

        // Fetch Reddit directly if cache is empty
        let finalRedditEvents = redditEvents;
        if (finalRedditEvents.length === 0) {
          try {
            const res = await signedSelfFetch(self, '/api/v1/reddit-feed', c.env);
            if (res && res.ok) {
              const data = (await res.json()) as Parameters<typeof fromReddit>[0];
              finalRedditEvents = safe(() => fromReddit(data));
            }
          } catch (_catchErr) {
            console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
            /* degraded */
          }
        }

        // Fetch additional geo-located data from free public APIs (inspired by World Monitor)
        const [
          naturalEvents,
          flights,
          gdacsAlerts,
          botnetC2,
          supplyChain,
          dshieldAttackers,
          compromisedIPs,
          blocklistAttackers,
          cisaKev,
          urlhausMalware,
        ] = await Promise.all([
          fetchNaturalEvents(),
          fetchFlights(),
          fetchGdacsAlerts(),
          fetchBotnetC2(),
          fetchSupplyChain(),
          fetchDShieldAttackers(),
          fetchCompromisedIPs(),
          fetchBlocklistAttackers(),
          fetchCisaKev(),
          fetchUrlhaus(),
        ]);

        // Tech infrastructure (static data — no network needed)
        const techInfra = getTechInfrastructureEvents();

        // Geopolitical hotspots (static data — conflicts, sanctions, military, nuclear)
        const geopoliticalEvents = getGeopoliticalEvents();

        // Additional static data layers (cables, financial centers)
        const cableEvents = getCableEvents();
        const financialEvents = getFinancialEvents();

        // Briefings (D1)
        let briefingEvents: PulseEvent[] = [];
        try {
          const db = c.env.BRIEFINGS_DB;
          if (db) {
            const { items } = await listBriefings(db, { limit: 5 });
            briefingEvents = fromBriefings(items);
          }
        } catch (_catchErr) {
          console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
          /* degraded */
        }

        // CyberPulse incidents (D1 — breach/leak/extortion incidents from
        // social-media firehose ingestion). Same DB as briefings, different table.
        let cyberpulseEvents: PulseEvent[] = [];
        try {
          const cpRes = await signedSelfFetch(self, '/api/v1/cyberpulse/incidents?days=7&limit=30', c.env);
          if (cpRes && cpRes.ok) {
            const cpData = (await cpRes.json()) as Parameters<typeof fromCyberPulse>[0];
            cyberpulseEvents = safe(() => fromCyberPulse(cpData));
          }
        } catch (_catchErr) {
          console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
          /* degraded */
        }

        // Direct fetches for remaining cache-dependent sources
        let finalTelegramEvents = telegramEvents;
        let finalInfostealerEvents = infostealerEvents;
        let finalCybercrimeEvents = cybercrimeEvents;
        let finalResearchEvents = researchEvents;

        // Fetch X/Telegram directly if empty
        if (finalTelegramEvents.length === 0) {
          try {
            const res = await signedSelfFetch(self, '/api/v1/telegram-feed', c.env);
            if (res && res.ok) {
              const data = (await res.json()) as Parameters<typeof fromTelegram>[0];
              finalTelegramEvents = safe(() => fromTelegram(data));
            }
          } catch (_catchErr) {
            console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
            /* degraded */
          }
        }

        // Fetch scam directly if empty
        let finalScamEvents = scamEvents;
        if (finalScamEvents.length === 0) {
          try {
            const res = await signedSelfFetch(self, '/api/v1/crypto-scam-feed', c.env);
            if (res && res.ok) {
              const data = (await res.json()) as Parameters<typeof fromScam>[0];
              finalScamEvents = safe(() => fromScam(data));
            }
          } catch (_catchErr) {
            console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
            /* degraded */
          }
        }

        // Fetch phishing directly if empty
        if (finalPhishingEvents.length === 0) {
          try {
            const res = await signedSelfFetch(self, '/api/v1/phishing-urls', c.env);
            if (res && res.ok) {
              const data = (await res.json()) as Parameters<typeof fromPhishing>[0];
              finalPhishingEvents = safe(() => fromPhishing(data));
            }
          } catch (_catchErr) {
            console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
            /* degraded */
          }
        }

        // Fetch infostealer directly if empty
        if (finalInfostealerEvents.length === 0) {
          try {
            const res = await signedSelfFetch(self, '/api/v1/stealer-forum-intel', c.env);
            if (res && res.ok) {
              const data = (await res.json()) as Parameters<typeof fromStealerForum>[0];
              finalInfostealerEvents = safe(() => fromStealerForum(data));
            }
          } catch (_catchErr) {
            console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
            /* degraded */
          }
        }

        // Fetch cybercrime directly if empty
        if (finalCybercrimeEvents.length === 0) {
          try {
            const res = await signedSelfFetch(self, '/api/v1/cyber-crime', c.env);
            if (res && res.ok) {
              const data = (await res.json()) as Parameters<typeof fromCybercrime>[0];
              finalCybercrimeEvents = safe(() => fromCybercrime(data));
            }
          } catch (_catchErr) {
            console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
            /* degraded */
          }
        }

        // Fetch research/writeups directly if empty
        if (finalResearchEvents.length === 0) {
          try {
            const res = await signedSelfFetch(self, '/api/v1/writeups', c.env);
            if (res && res.ok) {
              const data = (await res.json()) as Parameters<typeof fromWriteups>[0];
              finalResearchEvents = safe(() => fromWriteups(data));
            }
          } catch (_catchErr) {
            console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
            /* degraded */
          }
        }

        // Fetch secret leaks directly if empty
        let finalSecretLeakEvents = secretLeakEvents;
        if (finalSecretLeakEvents.length === 0) {
          try {
            const res = await signedSelfFetch(self, '/api/v1/secret-leaks', c.env);
            if (res && res.ok) {
              const data = (await res.json()) as Parameters<typeof fromSecretLeaks>[0];
              finalSecretLeakEvents = safe(() => fromSecretLeaks(data));
            }
          } catch (_catchErr) {
            console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
          }
        }

        // Fetch malicious packages directly if empty
        let finalMalpkgEvents = malpkgEvents;
        if (finalMalpkgEvents.length === 0) {
          try {
            const res = await signedSelfFetch(self, '/api/v1/malicious-packages', c.env);
            if (res && res.ok) {
              const data = (await res.json()) as Parameters<typeof fromMaliciousPackages>[0];
              finalMalpkgEvents = safe(() => fromMaliciousPackages(data));
            }
          } catch (_catchErr) {
            console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
          }
        }

        // Fetch exploit DB directly if empty
        let finalExploitEvents = exploitEvents;
        if (finalExploitEvents.length === 0) {
          try {
            const res = await signedSelfFetch(self, '/api/v1/exploit-db?latest=1', c.env);
            if (res && res.ok) {
              const data = (await res.json()) as Parameters<typeof fromExploitDb>[0];
              finalExploitEvents = safe(() => fromExploitDb(data));
            }
          } catch (_catchErr) {
            console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
          }
        }

        // Fetch GitHub advisories directly if empty
        let finalGhsaEvents = ghsaEvents;
        if (finalGhsaEvents.length === 0) {
          try {
            const res = await signedSelfFetch(self, '/api/v1/github-security?ecosystem=npm', c.env);
            if (res && res.ok) {
              const data = (await res.json()) as Parameters<typeof fromGithubAdvisories>[0];
              finalGhsaEvents = safe(() => fromGithubAdvisories(data));
            }
          } catch (_catchErr) {
            console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
          }
        }

        // Fetch CISA KEV directly if empty
        let finalKevEvents = kevEvents;
        if (finalKevEvents.length === 0) {
          try {
            const res = await signedSelfFetch(self, '/api/v1/cisa-kev?days=30', c.env);
            if (res && res.ok) {
              const data = (await res.json()) as Parameters<typeof fromCisaKev>[0];
              finalKevEvents = safe(() => fromCisaKev(data));
            }
          } catch (_catchErr) {
            console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
          }
        }

        // ── CTI category tagging ──────────────────────────────────────────
        const tagCti = <T extends PulseKind>(kind: T): PulseEvent['cti'] => {
          switch (kind) {
            case 'ransomware':
              return 'ransomware';
            case 'cve':
            case 'cisa_advisory':
              return 'cve';
            case 'ioc_activity':
            case 'cyber_attack':
            case 'c2_tracker':
            case 'blocklist':
              return 'ioc';
            case 'malware':
            case 'phishing':
            case 'infostealer':
            case 'breach':
            case 'cybercrime':
            case 'scam':
            case 'actor_sighting':
            case 'secret_leak':
            case 'malicious_package':
            case 'exploit':
            case 'github_advisory':
            case 'kev':
              return 'threat';
            case 'ioc_correlation':
              return 'ioc';
            case 'cyberpulse':
              return 'threat';
            default:
              return 'other';
          }
        };
        const tagAll = <T extends { kind: PulseKind }>(arr: T[]): (T & { cti: PulseEvent['cti'] })[] =>
          arr.map((e) => ({ ...e, cti: tagCti(e.kind) }));

        // ── Merge + sort ───────────────────────────────────────────────────
        const allEvents = [
          ...tagAll(earthquakes),
          ...tagAll(naturalEvents),
          ...tagAll(gdacsAlerts),
          ...tagAll(flights),
          ...tagAll(botnetC2),
          ...tagAll(supplyChain),
          ...tagAll(dshieldAttackers),
          ...tagAll(compromisedIPs),
          ...tagAll(blocklistAttackers),
          ...tagAll(cisaKev),
          ...tagAll(urlhausMalware),
          ...tagAll(techInfra),
          ...tagAll(geopoliticalEvents),
          ...tagAll(cableEvents),
          ...tagAll(financialEvents),
          ...tagAll(finalIocEvents),
          ...tagAll(finalLiveIocEvents),
          ...tagAll(finalRansomwareEvents),
          ...tagAll(finalInfostealerEvents),
          ...tagAll(finalPhishingEvents),
          ...tagAll(finalMalwareEvents),
          ...tagAll(finalCveEvents),
          ...tagAll(finalCybercrimeEvents),
          ...tagAll(breachEvents),
          ...tagAll(finalResearchEvents),
          ...tagAll(briefingEvents),
          ...tagAll(finalRedditEvents),
          ...tagAll(finalTelegramEvents),
          ...tagAll(xEvents),
          ...tagAll(finalScamEvents),
          ...tagAll(xClaimsEvents),
          ...tagAll(actorEvents),
          ...tagAll(iocCorrEvents),
          ...tagAll(finalSecretLeakEvents),
          ...tagAll(finalMalpkgEvents),
          ...tagAll(finalExploitEvents),
          ...tagAll(finalGhsaEvents),
          ...tagAll(finalKevEvents),
          ...tagAll(firmsEvents),
          ...tagAll(ukmtoEvents),
          ...tagAll(cyberpulseEvents),
        ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        const result: GlobalPulseResponse = {
          generated_at: new Date().toISOString(),
          total_events: allEvents.length,
          events: allEvents,
          layers: {
            earthquake: earthquakes.length,
            ioc_activity: finalIocEvents.length,
            geopolitical:
              naturalEvents.length +
              gdacsAlerts.length +
              geopoliticalEvents.filter((e) => e.kind === 'geopolitical').length +
              financialEvents.length,
            tech_news: techInfra.length + cableEvents.length,
            war_room:
              naturalEvents.filter((e) => e.kind === 'war_room').length +
              geopoliticalEvents.filter((e) => e.kind === 'war_room').length,
            aircraft: flights.length,
            c2_tracker: botnetC2.length,
            supply_chain_attacks: supplyChain.length,
            cisa_advisory: cisaKev.length,
            blocklist: blocklistAttackers.length + compromisedIPs.length,
            cyber_attack: finalLiveIocEvents.length + dshieldAttackers.length,
            reddit: finalRedditEvents.length,
            telegram: finalTelegramEvents.length,
            x_feed: xEvents.length,
            scam: finalScamEvents.length,
            breach: breachEvents.length,
            briefing: briefingEvents.length,
            infostealer: finalInfostealerEvents.length,
            phishing: finalPhishingEvents.length,
            malware: finalMalwareEvents.length + urlhausMalware.length,
            ransomware: finalRansomwareEvents.length,
            cybercrime: finalCybercrimeEvents.length,
            research: finalResearchEvents.length,
            cve: finalCveEvents.length,
            actor_sighting: actorEvents.length,
            ioc_correlation: iocCorrEvents.length,
            secret_leak: finalSecretLeakEvents.length,
            malicious_package: finalMalpkgEvents.length,
            exploit: finalExploitEvents.length,
            github_advisory: finalGhsaEvents.length,
            kev: finalKevEvents.length,
            firm: firmsEvents.length,
            maritime: ukmtoEvents.length,
            cyberpulse: cyberpulseEvents.length,
            rss: 0,
          },
        };

        const json = JSON.stringify(result);
        const response = new Response(json, {
          headers: {
            'content-type': 'application/json',
            'cache-control': `public, max-age=${CACHE_TTL}`,
            'access-control-allow-origin': '*',
          },
        });
        await cache.put(cacheReq, response.clone());
        // Publish to global KV so readers in other colos serve it cheaply (see
        // the read at the top of this handler) instead of each colo re-running
        // the build. Best-effort: a KV write failure must not lose the build.
        if (kv) {
          await kv.put(GP_RESPONSE_KEY, json, { expirationTtl: GP_RESPONSE_TTL }).catch(() => {});
        }

        // NOTE: global-pulse does NOT write the warm keys. A Worker can't fetch
        // its own public endpoints (loopback fails), so this handler's direct-
        // fetch fallback is mostly null — writing it would poison the data. The
        // queue consumer (worker/queue-consumer.ts) is the sole writer of
        // `gp:warm:<key>`, populated one feed per invocation via in-process
        // apiApp.fetch and enqueued by the hourly cron. This handler reads them.
      } catch (e) {
        console.error('global-pulse background build error:', e instanceof Error ? e.message : String(e));
      }
    })()
  );

  return response;
}
