import type { Context } from 'hono';
import type { Env } from '../../env';
import { logError } from '../../lib/logger';
import type {
  PulseEvent,
  PulseKind,
  GlobalPulseResponse,
  XClaimsResponse,
  ActorTimelineResponse,
  IocCorrelationResponse,
} from './types';
import {
  GP_FEEDS,
  gpWarmKey,
  GLOBAL_PULSE_CACHE,
  CACHE_TTL,
  GP_RESPONSE_KEY,
  GP_RESPONSE_TTL,
  GP_LAST_GOOD_KEY,
  GP_LAST_GOOD_TTL,
} from './config';
import { routeCacheGet, routeCachePut } from '../../lib/route-cache';
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
  fromCyberPulse,
  fromRss,
  fromWebamonCampaigns,
  fromHoneypot,
} from './converters';
import {
  fetchBotnetC2,
  fetchSupplyChain,
  fetchDShieldAttackers,
  fetchCompromisedIPs,
  fetchBlocklistAttackers,
  fetchCisaKev,
  fetchUrlhaus,
} from './fetchers';

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

  if (!force) {
    const cachedBody = await routeCacheGet<unknown>(GP_RESPONSE_KEY);
    if (cachedBody) {
      const kvBody = JSON.stringify(cachedBody);
      c.executionCtx.waitUntil(
        cache.put(cacheReq, new Response(kvBody, { headers: { 'content-type': 'application/json' } })).catch(() => {})
      );
      return new Response(kvBody, {
        headers: {
          'content-type': 'application/json',
          'cache-control': `public, max-age=${CACHE_TTL}, s-maxage=${CACHE_TTL}`,
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
  // includes external fetchers (botnet C2, supply chain, DShield, etc.) runs
  // in the background via waitUntil — if it completes, it populates the caches
  // for the next request; if it gets killed by CPU limits, the sync data
  // still serves a useful map.
  const self = c.env.SELF;

  // Safe wrapper — used by both the sync fetch and the background build.
  const safe = <T>(fn: () => T): T => {
    try {
      return fn();
    } catch (_catchErr) {
      logError('handler failed', _catchErr);
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
    logError('global-pulse sync fetch failed', _catchErr);
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
  if (warm.webamon)
    warmEvents.push(...safe(() => fromWebamonCampaigns(warm.webamon as Parameters<typeof fromWebamonCampaigns>[0])));
  if (warm.honeypot) warmEvents.push(...safe(() => fromHoneypot(warm.honeypot as Parameters<typeof fromHoneypot>[0])));

  // ── CyberPulse incidents (D1) ────────────────────────────────────────
  let cyberpulseEvents: PulseEvent[] = [];
  try {
    const cpRes = await signedSelfFetch(self, '/api/v1/cyberpulse/incidents?days=7&limit=30', c.env, 10000);
    if (cpRes && cpRes.ok) {
      const cpData = (await cpRes.json()) as Parameters<typeof fromCyberPulse>[0];
      cyberpulseEvents = safe(() => fromCyberPulse(cpData));
    }
  } catch (_catchErr) {
    logError('handler failed', _catchErr);
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
      case 'honeypot':
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

  const syncPayload = {
    generated_at: new Date().toISOString(),
    total_events: allEvents.length,
    events: allEvents,
    layers: syncLayers,
  };

  // Stale-if-error guard: the sync build above only sees warm-KV slices + the 3
  // direct feeds, so the background-only layers (c2_tracker, supply_chain_attacks,
  // blocklist, briefing, cisa_advisory) are absent here and would render as 0 on
  // the page during cold-cache windows. If a recent FULL build is available and
  // populates more layers than this partial sync build, serve it instead. The
  // background build below still refreshes the cache, so staleness is bounded by
  // one build cycle — a cold cache or a CPU-killed background build never blanks
  // half the map for the whole GP_RESPONSE_TTL.
  const nonZeroLayers = (l: unknown): number =>
    l && typeof l === 'object'
      ? Object.values(l as Record<string, unknown>).filter((n) => typeof n === 'number' && n > 0).length
      : 0;
  let payload: typeof syncPayload | GlobalPulseResponse = syncPayload;
  const lastGood = await routeCacheGet<GlobalPulseResponse>(GP_LAST_GOOD_KEY);
  if (
    lastGood &&
    Array.isArray(lastGood.events) &&
    lastGood.layers &&
    nonZeroLayers(lastGood.layers) > nonZeroLayers(syncLayers)
  ) {
    payload = lastGood;
  }

  const json = JSON.stringify(payload);
  const response = new Response(json, {
    headers: {
      'content-type': 'application/json',
      'cache-control': `public, max-age=${CACHE_TTL}, s-maxage=${CACHE_TTL}`,
      'access-control-allow-origin': '*',
    },
  });
  c.executionCtx.waitUntil(
    Promise.all([cache.put(cacheReq, response.clone()), routeCachePut(GP_RESPONSE_KEY, payload, GP_RESPONSE_TTL)])
  );

  // ── Background build for external fetchers (botnet C2, supply chain, etc.) ──
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
        const finalSecretLeaks = warm.secretleaks ?? null;
        const finalMalpkg = warm.malpkg ?? null;
        const finalExploit = warm.exploit ?? null;
        const finalGhsa = warm.ghsa ?? null;
        const finalKev = warm.kev ?? null;
        const finalRss = warm.rss ?? null;
        const finalWebamon = warm.webamon ?? null;
        const finalHoneypot = warm.honeypot ?? null;

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
            logError('handler failed', _catchErr);
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
        const rssEvents = safe(() => (finalRss ? fromRss(finalRss as Parameters<typeof fromRss>[0]) : []));
        const webamonEvents = safe(() =>
          finalWebamon ? fromWebamonCampaigns(finalWebamon as Parameters<typeof fromWebamonCampaigns>[0]) : []
        );
        const honeypotEvents = safe(() =>
          finalHoneypot ? fromHoneypot(finalHoneypot as Parameters<typeof fromHoneypot>[0]) : []
        );
        const cybercrimeEvents = safe(() => (finalCybercrime ? fromCybercrime(finalCybercrime) : []));
        const researchEvents = safe(() => (finalWriteups ? fromWriteups(finalWriteups) : []));
        const cveEvents = safe(() => (mergedCve ? fromCveRecent(mergedCve) : []));
        const xClaimsEvents = safe(() => (mergedXClaims ? fromXClaims(mergedXClaims as XClaimsResponse) : []));
        const actorEvents = safe(() => (mergedActor ? fromActorTimeline(mergedActor as ActorTimelineResponse) : []));
        const iocCorrEvents = safe(() =>
          mergedIocCorr ? fromIocCorrelation(mergedIocCorr as IocCorrelationResponse) : []
        );

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
            logError('handler failed', _catchErr);
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
            logError('handler failed', _catchErr);
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
            logError('handler failed', _catchErr);
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
            logError('handler failed', _catchErr);
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
            logError('handler failed', _catchErr);
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
            logError('handler failed', _catchErr);
            /* degraded */
          }
        }

        // Fetch cyber threat-intel data from free public APIs
        const [botnetC2, supplyChain, dshieldAttackers, compromisedIPs, blocklistAttackers, cisaKev, urlhausMalware] =
          await Promise.all([
            fetchBotnetC2(),
            fetchSupplyChain(),
            fetchDShieldAttackers(),
            fetchCompromisedIPs(),
            fetchBlocklistAttackers(),
            fetchCisaKev(),
            fetchUrlhaus(),
          ]);

        // Briefings (D1)
        let briefingEvents: PulseEvent[] = [];
        try {
          const db = c.env.BRIEFINGS_DB;
          if (db) {
            const { items } = await listBriefings(db, { limit: 5 });
            briefingEvents = fromBriefings(items);
          }
        } catch (_catchErr) {
          logError('handler failed', _catchErr);
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
          logError('handler failed', _catchErr);
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
            logError('handler failed', _catchErr);
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
            logError('handler failed', _catchErr);
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
            logError('handler failed', _catchErr);
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
            logError('handler failed', _catchErr);
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
            logError('handler failed', _catchErr);
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
            logError('handler failed', _catchErr);
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
            logError('handler failed', _catchErr);
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
            logError('handler failed', _catchErr);
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
            logError('handler failed', _catchErr);
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
            logError('handler failed', _catchErr);
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
            logError('handler failed', _catchErr);
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
            case 'honeypot':
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
          ...tagAll(botnetC2),
          ...tagAll(supplyChain),
          ...tagAll(dshieldAttackers),
          ...tagAll(compromisedIPs),
          ...tagAll(blocklistAttackers),
          // CISA KEV arrives twice — warm KV (`kev`, kind `kev`) and the direct
          // `fetchCisaKev` external fetcher (`cisa_advisory`). Same catalog, so
          // prefer the warm slice and only fall back to the external fetch when
          // it's empty; otherwise every KEV renders as two overlapping points.
          ...(finalKevEvents.length > 0 ? [] : tagAll(cisaKev)),
          ...tagAll(urlhausMalware),
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
          ...tagAll(cyberpulseEvents),
          ...tagAll(rssEvents),
          ...tagAll(webamonEvents),
          ...tagAll(honeypotEvents),
        ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        const result: GlobalPulseResponse = {
          generated_at: new Date().toISOString(),
          total_events: allEvents.length,
          events: allEvents,
          layers: {
            earthquake: 0,
            ioc_activity: finalIocEvents.length,
            geopolitical: 0,
            tech_news: 0,
            war_room: 0,
            aircraft: 0,
            c2_tracker: botnetC2.length,
            supply_chain_attacks: supplyChain.length,
            cisa_advisory: finalKevEvents.length > 0 ? 0 : cisaKev.length,
            blocklist: blocklistAttackers.length + compromisedIPs.length,
            cyber_attack: finalLiveIocEvents.length + dshieldAttackers.length,
            reddit: finalRedditEvents.length,
            telegram: finalTelegramEvents.length,
            x_feed: xEvents.length,
            scam: finalScamEvents.length,
            breach: breachEvents.length,
            briefing: briefingEvents.length,
            infostealer: finalInfostealerEvents.length,
            phishing: finalPhishingEvents.length + webamonEvents.filter((e) => e.kind === 'phishing').length,
            malware:
              finalMalwareEvents.length +
              urlhausMalware.length +
              webamonEvents.filter((e) => e.kind === 'malware').length,
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
            firm: 0,
            maritime: 0,
            cyberpulse: cyberpulseEvents.length,
            rss: rssEvents.length,
            honeypot: honeypotEvents.length,
          },
        };

        const json = JSON.stringify(result);
        const response = new Response(json, {
          headers: {
            'content-type': 'application/json',
            'cache-control': `public, max-age=${CACHE_TTL}, s-maxage=${CACHE_TTL}`,
            'access-control-allow-origin': '*',
          },
        });
        await cache.put(cacheReq, response.clone());
        await routeCachePut(GP_RESPONSE_KEY, result, GP_RESPONSE_TTL);
        // Long-lived last-good copy for the stale-if-error guard on the sync path.
        // Only written here (the sole path that populates the external-fetcher
        // layers), so it always holds a full map.
        await routeCachePut(GP_LAST_GOOD_KEY, result, GP_LAST_GOOD_TTL);

        // NOTE: global-pulse does NOT write the warm keys. A Worker can't fetch
        // its own public endpoints (loopback fails), so this handler's direct-
        // fetch fallback is mostly null — writing it would poison the data. The
        // queue consumer (worker/queue-consumer.ts) is the sole writer of
        // `gp:warm:<key>`, populated one feed per invocation via in-process
        // apiApp.fetch and enqueued by the hourly cron. This handler reads them.
      } catch (e) {
        logError('global-pulse background build error', e);
      }
    })()
  );

  return response;
}
