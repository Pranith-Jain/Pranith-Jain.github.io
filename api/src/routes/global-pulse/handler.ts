import type { Context } from 'hono';
import type { Env } from '../../env';
import type { PulseEvent, PulseKind, GlobalPulseResponse, XClaimsResponse, ActorTimelineResponse, IocCorrelationResponse } from './types';
import { GP_FEEDS, gpWarmKey, GLOBAL_PULSE_CACHE, CACHE_TTL } from './config';
import { listBriefings } from '../../lib/briefing-builder';
import { readKvJson } from './shared';
import {
  iocFromThreatMap, fromReddit, fromTelegram, fromXFeed, fromScam,
  fromBreaches, fromBriefings, fromLiveIocs, fromSecretLeaks,
  fromMaliciousPackages, fromExploitDb, fromGithubAdvisories, fromCisaKev,
  fromStealerForum, fromPhishing, fromMalware, fromRansomware, fromCybercrime,
  fromWriteups, fromCveRecent, fromXClaims, fromActorTimeline, fromIocCorrelation,
} from './converters';
import {
  fetchEarthquakes, fetchNaturalEvents, fetchFlights, fetchGdacsAlerts,
  fetchBotnetC2, fetchSupplyChain, fetchDShieldAttackers, fetchCompromisedIPs,
  fetchBlocklistAttackers, fetchCisaKev, fetchUrlhaus, fetchRansomwatch,
} from './fetchers';
import { getTechInfrastructureEvents, getGeopoliticalEvents, getCableEvents, getFinancialEvents } from './static-data';

/* ─── Handler ───────────────────────────────────────────────────────────── */

export async function globalPulseHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const cache = caches.default;
    const cacheReq = new Request(GLOBAL_PULSE_CACHE);
    const cached = await cache.match(cacheReq);
    if (cached) return new Response(cached.body, cached);

    const kv = c.env.KV_CACHE;

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
      if (legacy) Object.assign(warm, legacy);
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

    // ── Direct endpoint fallback for still-missing layers ─────────────
    // Fetch ALL missing endpoints via SELF binding (in-process, no loopback).
    // Workers cannot fetch their own public URL (Cloudflare blocks loopback),
    // so the old `fetch('https://pranithjain.qzz.io/...')` approach always
    // returned null for every feed when KV was cold — making every page visit
    // a fresh invocation with no data. SELF.fetch() avoids the loopback.
    const self = c.env.SELF;
    const fetchDirect = async (path: string): Promise<unknown | null> => {
      try {
        const res = await self.fetch(new Request(`https://self${path}`, { signal: AbortSignal.timeout(10000) }));
        if (!res.ok) return null;
        return await res.json();
      } catch {
        return null;
      }
    };

    // Build list of all missing endpoints — fetch them all in parallel
    const missing: Array<[string, string]> = [];
    if (!finalTm) missing.push(['/api/v1/threat-map', 'tm']);
    if (!finalReddit) missing.push(['/api/v1/reddit-feed', 'reddit']);
    if (!finalX) missing.push(['/api/v1/x-feed', 'x']);
    if (!finalCve) missing.push(['/api/v1/cve-recent?days=7', 'cve']);
    if (!finalRansom) missing.push(['/api/v1/ransomware-recent?days=7', 'ransom']);
    if (!finalBreach) missing.push(['/api/v1/breach-disclosures', 'breach']);
    if (!finalIoc) missing.push(['/api/v1/live-iocs', 'ioc']);
    if (!finalPhishing) missing.push(['/api/v1/phishing-urls', 'phishing']);
    if (!finalMalware) missing.push(['/api/v1/malware-samples', 'malware']);
    if (!finalScam) missing.push(['/api/v1/crypto-scam-feed', 'scam']);
    if (!finalXClaims) missing.push(['/api/v1/x-claims', 'xclaims']);
    if (!finalActor) missing.push(['/api/v1/actor-timeline', 'actor']);
    if (!finalIocCorr) missing.push(['/api/v1/ioc-correlation', 'iocc']);

    // Fetch all missing in parallel (Workers subrequest limit is 50)
    const directResults = await Promise.all(missing.map(([path]) => fetchDirect(path)));

    // Apply direct results to fill in all gaps
    const direct: Record<string, unknown> = {};
    for (let i = 0; i < missing.length; i++) {
      const entry = missing[i];
      if (!entry) continue;
      const [, key] = entry;
      const data = directResults[i];
      if (data) direct[key] = data;
    }

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

    // ── Convert → events ───────────────────────────────────────────────
    const safe = <T>(fn: () => T): T => {
      try {
        return fn();
      } catch {
        return [] as unknown as T;
      }
    };
    const iocEvents = safe(() =>
      mergedTm ? iocFromThreatMap(mergedTm as Parameters<typeof iocFromThreatMap>[0]) : []
    );

    // Fetch threat map directly if cache is empty
    let finalIocEvents = iocEvents;
    if (finalIocEvents.length === 0) {
      try {
        const tmRes = await self.fetch(
          new Request('https://self/api/v1/threat-map', {
            signal: AbortSignal.timeout(10000),
          })
        );
        if (tmRes.ok) {
          const tmData = (await tmRes.json()) as Parameters<typeof iocFromThreatMap>[0];
          finalIocEvents = safe(() => iocFromThreatMap(tmData));
        }
      } catch {
        /* degraded */
      }
    }
    const redditEvents = safe(() => (mergedReddit ? fromReddit(mergedReddit as Parameters<typeof fromReddit>[0]) : []));
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
      warm.secretleaks ? fromSecretLeaks(warm.secretleaks as Parameters<typeof fromSecretLeaks>[0]) : []
    );
    const malpkgEvents = safe(() =>
      warm.malpkg ? fromMaliciousPackages(warm.malpkg as Parameters<typeof fromMaliciousPackages>[0]) : []
    );
    const exploitEvents = safe(() =>
      warm.exploit ? fromExploitDb(warm.exploit as Parameters<typeof fromExploitDb>[0]) : []
    );
    const ghsaEvents = safe(() =>
      warm.ghsa ? fromGithubAdvisories(warm.ghsa as Parameters<typeof fromGithubAdvisories>[0]) : []
    );
    const kevEvents = safe(() => (warm.kev ? fromCisaKev(warm.kev as Parameters<typeof fromCisaKev>[0]) : []));
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
        // cve-recent aggregates NVD + cvefeed and can take ~12s cold — the
        // generic 10s fetchDirect above times out, so give this retry 20s.
        const cveRes = await self.fetch(
          new Request('https://self/api/v1/cve-recent?days=7', {
            signal: AbortSignal.timeout(20000),
          })
        );
        if (cveRes.ok) {
          const cveData = (await cveRes.json()) as Parameters<typeof fromCveRecent>[0];
          finalCveEvents = safe(() => fromCveRecent(cveData));
        }
      } catch {
        /* degraded */
      }
    }

    // Fetch ransomware data directly if cache is empty
    let finalRansomwareEvents = ransomwareEvents;
    if (finalRansomwareEvents.length === 0) {
      try {
        const ransomRes = await self.fetch(
          new Request('https://self/api/v1/ransomware-recent?days=7', {
            signal: AbortSignal.timeout(10000),
          })
        );
        if (ransomRes.ok) {
          const ransomData = (await ransomRes.json()) as Parameters<typeof fromRansomware>[0];
          finalRansomwareEvents = safe(() => fromRansomware(ransomData));
        }
      } catch {
        /* degraded */
      }
    }

    // Fetch live IOCs directly if cache is empty
    let finalLiveIocEvents = liveIocEvents;
    if (finalLiveIocEvents.length === 0) {
      try {
        const iocRes = await self.fetch(
          new Request('https://self/api/v1/live-iocs', {
            signal: AbortSignal.timeout(10000),
          })
        );
        if (iocRes.ok) {
          const iocData = (await iocRes.json()) as Parameters<typeof fromLiveIocs>[0];
          finalLiveIocEvents = safe(() => fromLiveIocs(iocData));
        }
      } catch {
        /* degraded */
      }
    }

    // Fetch phishing data directly if cache is empty
    let finalPhishingEvents = phishingEvents;
    if (finalPhishingEvents.length === 0) {
      try {
        const phishRes = await self.fetch(
          new Request('https://self/api/v1/phishing-urls', {
            signal: AbortSignal.timeout(10000),
          })
        );
        if (phishRes.ok) {
          const phishData = (await phishRes.json()) as Parameters<typeof fromPhishing>[0];
          finalPhishingEvents = safe(() => fromPhishing(phishData));
        }
      } catch {
        /* degraded */
      }
    }

    // Fetch malware data directly if cache is empty
    let finalMalwareEvents = malwareEvents;
    if (finalMalwareEvents.length === 0) {
      try {
        const malRes = await self.fetch(
          new Request('https://self/api/v1/malware-samples', {
            signal: AbortSignal.timeout(10000),
          })
        );
        if (malRes.ok) {
          const malData = (await malRes.json()) as Parameters<typeof fromMalware>[0];
          finalMalwareEvents = safe(() => fromMalware(malData));
        }
      } catch {
        /* degraded */
      }
    }

    // Fetch Reddit directly if cache is empty
    let finalRedditEvents = redditEvents;
    if (finalRedditEvents.length === 0) {
      try {
        const res = await self.fetch(
          new Request('https://self/api/v1/reddit-feed', {
            signal: AbortSignal.timeout(10000),
          })
        );
        if (res.ok) {
          const data = (await res.json()) as Parameters<typeof fromReddit>[0];
          finalRedditEvents = safe(() => fromReddit(data));
        }
      } catch {
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
      fetchRansomwatch(),
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
    } catch {
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
        const res = await self.fetch(
          new Request('https://self/api/v1/telegram-feed', {
            signal: AbortSignal.timeout(10000),
          })
        );
        if (res.ok) {
          const data = (await res.json()) as Parameters<typeof fromTelegram>[0];
          finalTelegramEvents = safe(() => fromTelegram(data));
        }
      } catch {
        /* degraded */
      }
    }

    // Fetch scam directly if empty
    let finalScamEvents = scamEvents;
    if (finalScamEvents.length === 0) {
      try {
        const res = await self.fetch(
          new Request('https://self/api/v1/crypto-scam-feed', {
            signal: AbortSignal.timeout(10000),
          })
        );
        if (res.ok) {
          const data = (await res.json()) as Parameters<typeof fromScam>[0];
          finalScamEvents = safe(() => fromScam(data));
        }
      } catch {
        /* degraded */
      }
    }

    // Fetch phishing directly if empty
    if (finalPhishingEvents.length === 0) {
      try {
        const res = await self.fetch(
          new Request('https://self/api/v1/phishing-urls', {
            signal: AbortSignal.timeout(10000),
          })
        );
        if (res.ok) {
          const data = (await res.json()) as Parameters<typeof fromPhishing>[0];
          finalPhishingEvents = safe(() => fromPhishing(data));
        }
      } catch {
        /* degraded */
      }
    }

    // Fetch infostealer directly if empty
    if (finalInfostealerEvents.length === 0) {
      try {
        const res = await self.fetch(
          new Request('https://self/api/v1/stealer-forum-intel', {
            signal: AbortSignal.timeout(10000),
          })
        );
        if (res.ok) {
          const data = (await res.json()) as Parameters<typeof fromStealerForum>[0];
          finalInfostealerEvents = safe(() => fromStealerForum(data));
        }
      } catch {
        /* degraded */
      }
    }

    // Fetch cybercrime directly if empty
    if (finalCybercrimeEvents.length === 0) {
      try {
        const res = await self.fetch(
          new Request('https://self/api/v1/cyber-crime', {
            signal: AbortSignal.timeout(10000),
          })
        );
        if (res.ok) {
          const data = (await res.json()) as Parameters<typeof fromCybercrime>[0];
          finalCybercrimeEvents = safe(() => fromCybercrime(data));
        }
      } catch {
        /* degraded */
      }
    }

    // Fetch research/writeups directly if empty
    if (finalResearchEvents.length === 0) {
      try {
        const res = await self.fetch(
          new Request('https://self/api/v1/writeups', { signal: AbortSignal.timeout(10000) })
        );
        if (res.ok) {
          const data = (await res.json()) as Parameters<typeof fromWriteups>[0];
          finalResearchEvents = safe(() => fromWriteups(data));
        }
      } catch {
        /* degraded */
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
      ...tagAll(secretLeakEvents),
      ...tagAll(malpkgEvents),
      ...tagAll(exploitEvents),
      ...tagAll(ghsaEvents),
      ...tagAll(kevEvents),
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
        secret_leak: secretLeakEvents.length,
        malicious_package: malpkgEvents.length,
        exploit: exploitEvents.length,
        github_advisory: ghsaEvents.length,
        kev: kevEvents.length,
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
    c.executionCtx.waitUntil(cache.put(cacheReq, response.clone()));

    // NOTE: global-pulse does NOT write the warm keys. A Worker can't fetch its
    // own public endpoints (loopback fails), so this handler's direct-fetch
    // fallback is mostly null — writing it would poison the data. The queue
    // consumer (worker/queue-consumer.ts) is the sole writer of `gp:warm:<key>`,
    // populated one feed per invocation via in-process apiApp.fetch and enqueued
    // by the hourly cron. This handler is a pure reader of those per-feed keys.

    return response;
  } catch (e) {
    console.error('global-pulse error:', e instanceof Error ? e.message : String(e));
    return c.json({ error: 'internal_error', message: e instanceof Error ? e.message : 'unknown' }, 500);
  }
}
