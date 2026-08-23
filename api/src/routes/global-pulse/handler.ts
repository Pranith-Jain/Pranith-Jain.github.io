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
  GP_FEED_CACHE_KEYS,
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
  fromFirms,
  fromUkmto,
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

/* ─── Shared sync build — callable from the request handler AND the DO cron ── */
/* The free-plan 10ms CPU cap kills a stateless rebuild: the sync build reads 21
 * KV warm slices + 3 self-fetches + ~10 converters. The DO cron
 * (`gp-30-rebuild`) has a 30s CPU budget, so it runs this directly (via an
 * in-DO warm) instead of SELF.fetch-ing `?force=1` (which re-enters the 10ms
 * stateless worker). Keep the request path as the cheap primary:
 * Cache-API → GP KV last-good → this build.

/**
 * Build the sync GlobalPulse payload from warm-KV slices + direct self-fetches.
 * Pure work, no hono context, no cache writes — the caller (handler or DO cron)
 * owns the Cache-API / KV writes. Returns the payload + the incoming warm KV
 * map so the DO cron can additionally persist a last-good copy.
 */
export async function buildGlobalPulseSync(
  env: Pick<Env, 'SELF' | 'KV_CACHE' | 'INTERNAL_TOKEN_SECRET' | 'BRIEFINGS_DB'>,
  _waitUntil?: (p: Promise<unknown>) => void,
  full = false
): Promise<{ payload: GlobalPulseResponse; warm: Record<string, unknown>; sync: number }> {
  const kv = env.KV_CACHE;
  const cache = caches.default;

  // Safe wrapper — used by both the sync fetch and the background build.
  const safe = <T>(fn: () => T): T => {
    try {
      return fn();
    } catch (_catchErr) {
      logError('handler failed', _catchErr);
      return [] as unknown as T;
    }
  };

  // ── Shared subrequest budget ─────────────────────────────────────────
  // Every subrequest below (route cache.match, KV get, external upstream
  // fetch, SELF.fetch) consumes the free-plan 50-subrequest invocation cap.
  // Route-cache reads are prioritized (they're the LIVE data); warm-KV
  // fallback reads are gated LAST so an exhausted budget degrades a layer
  // (it renders 0 for this cycle) instead of aborting the whole build — the
  // poisoning guard keeps a fuller map already in KV.
  // 44 internal + the handler's own reads/writes after the build (last-good
  // routeCacheGet + cache.put + routeCachePut + kv.get/put ≈ 7) must stay
  // under the free-plan 50-subrequest invocation cap (51 with the 2 new
  // firms/ukmto feeds, but those share a single cache key so at most +1).
  const BUDGET_MAX = 44;
  const budget = { used: 0 };
  const consume = (n = 1): boolean => {
    if (budget.used + n > BUDGET_MAX) return false;
    budget.used += n;
    return true;
  };

  // ── LIVE per-route Cache-API reads (one cheap cache.match per feed) ──
  // These are the same responses the public /api/v1/* endpoints serve —
  // SWR-revalidated on visitor traffic with each route's own freshness TTL
  // (minutes, not hours). Reading them directly (rather than re-entering the
  // route handler, which would re-run its own fetch fan-out) is 1 subrequest
  // per feed and populates the map from LIVE data — the user-facing fix for
  // "layers stuck on warmup data". Per-colo by nature: a cold colo falls back
  // to the global warm KV slices last.
  const live: Record<string, unknown> = {};
  await Promise.all(
    GP_FEEDS.map(async (f) => {
      const key = GP_FEED_CACHE_KEYS[f.key];
      if (!key || !consume()) return;
      try {
        const hit = await cache.match(new Request(key));
        if (hit) live[f.key] = (await hit.json()) as unknown;
      } catch {
        /* cold / parse error → fall back to warm KV below */
      }
    })
  );

  // ── LIVE external fetchers (c2_tracker / supply_chain / blocklist / kev / etc.)
  // Previously FULL-only (only when ?force=1 DO rebuild) so visitor sync builds
  // rendered those layers 0 until the DO's next 10-min tick. Now budget-gated
  // but attempted on EVERY sync build: consume() guards the 50-subrequest cap,
  // so a cold colo degrades a warm layer rather than aborting. The DO full
  // build still guarantees completeness via stale-if-error + KV last-good.
  let botnetC2: PulseEvent[] = [];
  let supplyChain: PulseEvent[] = [];
  let dshieldAttackers: PulseEvent[] = [];
  let compromisedIPs: PulseEvent[] = [];
  let blocklistAttackers: PulseEvent[] = [];
  let cisaKev: PulseEvent[] = [];
  let urlhausMalware: PulseEvent[] = [];
  let briefingEvents: PulseEvent[] = [];
  // External threat-intel fetchers — always try, budget-gated. `full` no longer
  // required; the DO rebuild and the per-colo route caches already amortize cost.
  [botnetC2, supplyChain, dshieldAttackers, compromisedIPs, blocklistAttackers, cisaKev, urlhausMalware] =
    await Promise.all([
      consume(3) ? fetchBotnetC2() : Promise.resolve([] as PulseEvent[]),
      consume() ? fetchSupplyChain() : Promise.resolve([] as PulseEvent[]),
      consume() ? fetchDShieldAttackers() : Promise.resolve([] as PulseEvent[]),
      consume() ? fetchCompromisedIPs() : Promise.resolve([] as PulseEvent[]),
      consume() ? fetchBlocklistAttackers() : Promise.resolve([] as PulseEvent[]),
      consume() ? fetchCisaKev() : Promise.resolve([] as PulseEvent[]),
      consume() ? fetchUrlhaus() : Promise.resolve([] as PulseEvent[]),
    ]);

  // ── Briefings (D1) ────────────────────────────────────────────────
  try {
    if (env.BRIEFINGS_DB) {
      const { items } = await listBriefings(env.BRIEFINGS_DB, { limit: 5 });
      briefingEvents = fromBriefings(items);
    }
  } catch (_catchErr) {
    logError('handler failed', _catchErr);
    /* degraded */
  }
  // Silence unused `full` param (kept for call-site compatibility).
  void full;

  // ── CyberPulse incidents (D1) ────────────────────────────────────────
  let cyberpulseEvents: PulseEvent[] = [];
  if (consume()) {
    try {
      const cpRes = await signedSelfFetch(env.SELF, '/api/v1/cyberpulse/incidents?days=7&limit=30', env, 10000);
      if (cpRes && cpRes.ok) {
        const cpData = (await cpRes.json()) as Parameters<typeof fromCyberPulse>[0];
        cyberpulseEvents = safe(() => fromCyberPulse(cpData));
      }
    } catch (_catchErr) {
      logError('handler failed', _catchErr);
    }
  }

  // ── Warm KV slice fallback (cross-colo) — LAST ──────────────────────
  // Route caches are per-colo; a reader in a cold colo (or a feed without a
  // route cache key) falls back to the global gp:warm:<key> slice written by
  // the queue consumer. Deliberately the lowest priority — the user asked for
  // LIVE data, warmup slices only fill what live reads couldn't. Budget-gated:
  // once the cap is reached, remaining layers stay empty this cycle rather
  // than aborting the invocation.
  const warm: Record<string, unknown> = {};
  if (kv) {
    await Promise.all(
      GP_FEEDS.map(async (f) => {
        if (live[f.key] != null) return; // route cache already won
        if (!consume()) return;
        const val = await readKvJson(kv, gpWarmKey(f.key));
        if (val != null) warm[f.key] = val;
      })
    );
  }

  // ── Convert collected data → events ──────────────────────────────────
  const merged: Record<string, unknown> = { ...warm, ...live };
  const warmEvents: PulseEvent[] = [
    ...safe(() => (merged.tm ? iocFromThreatMap(merged.tm as Parameters<typeof iocFromThreatMap>[0]) : [])),
    ...safe(() => (merged.ioc ? fromLiveIocs(merged.ioc as Parameters<typeof fromLiveIocs>[0]) : [])),
    ...safe(() => (merged.telegram ? fromTelegram(merged.telegram as Parameters<typeof fromTelegram>[0]) : [])),
    ...safe(() => (merged.reddit ? fromReddit(merged.reddit as Parameters<typeof fromReddit>[0]) : [])),
    ...safe(() => (merged.x ? fromXFeed(merged.x as Parameters<typeof fromXFeed>[0]) : [])),
    ...safe(() => (merged.scam ? fromScam(merged.scam as Parameters<typeof fromScam>[0]) : [])),
    ...safe(() => (merged.breach ? fromBreaches(merged.breach as Parameters<typeof fromBreaches>[0]) : [])),
    ...safe(() => (merged.stealer ? fromStealerForum(merged.stealer as Parameters<typeof fromStealerForum>[0]) : [])),
    ...safe(() => (merged.phishing ? fromPhishing(merged.phishing as Parameters<typeof fromPhishing>[0]) : [])),
    ...safe(() => (merged.malware ? fromMalware(merged.malware as Parameters<typeof fromMalware>[0]) : [])),
    ...safe(() => (merged.cybercrime ? fromCybercrime(merged.cybercrime as Parameters<typeof fromCybercrime>[0]) : [])),
    ...safe(() => (merged.writeups ? fromWriteups(merged.writeups as Parameters<typeof fromWriteups>[0]) : [])),
    ...safe(() => (merged.xclaims ? fromXClaims(merged.xclaims as XClaimsResponse) : [])),
    ...safe(() => (merged.actor ? fromActorTimeline(merged.actor as ActorTimelineResponse) : [])),
    ...safe(() => (merged.iocc ? fromIocCorrelation(merged.iocc as IocCorrelationResponse) : [])),
    ...safe(() =>
      merged.secretleaks ? fromSecretLeaks(merged.secretleaks as Parameters<typeof fromSecretLeaks>[0]) : []
    ),
    ...safe(() =>
      merged.malpkg ? fromMaliciousPackages(merged.malpkg as Parameters<typeof fromMaliciousPackages>[0]) : []
    ),
    ...safe(() => (merged.exploit ? fromExploitDb(merged.exploit as Parameters<typeof fromExploitDb>[0]) : [])),
    ...safe(() => (merged.ghsa ? fromGithubAdvisories(merged.ghsa as Parameters<typeof fromGithubAdvisories>[0]) : [])),
    ...safe(() => (merged.kev ? fromCisaKev(merged.kev as Parameters<typeof fromCisaKev>[0]) : [])),
    ...safe(() => (merged.rss ? fromRss(merged.rss as Parameters<typeof fromRss>[0]) : [])),
    ...safe(() =>
      merged.webamon ? fromWebamonCampaigns(merged.webamon as Parameters<typeof fromWebamonCampaigns>[0]) : []
    ),
    ...safe(() => (merged.honeypot ? fromHoneypot(merged.honeypot as Parameters<typeof fromHoneypot>[0]) : [])),
    ...safe(() => (merged.cve ? fromCveRecent(merged.cve as Parameters<typeof fromCveRecent>[0]) : [])),
    ...safe(() => (merged.ransom ? fromRansomware(merged.ransom as Parameters<typeof fromRansomware>[0]) : [])),
    ...safe(() =>
      (merged.firms ?? merged.ukmto) ? fromFirms((merged.firms ?? merged.ukmto) as Parameters<typeof fromFirms>[0]) : []
    ),
    ...safe(() =>
      (merged.ukmto ?? merged.firms) ? fromUkmto((merged.ukmto ?? merged.firms) as Parameters<typeof fromUkmto>[0]) : []
    ),
  ];

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
  const allEvents = [
    ...warmEvents,
    ...safe(() => briefingEvents),
    ...safe(() => cyberpulseEvents),
    ...safe(() => botnetC2),
    ...safe(() => supplyChain),
    ...safe(() => dshieldAttackers),
    ...safe(() => compromisedIPs),
    ...safe(() => blocklistAttackers),
    ...safe(() => cisaKev),
    ...safe(() => urlhausMalware),
  ]
    .map((e) => ({ ...e, cti: tagCti(e.kind) }))
    .sort((a, b) => {
      const sd = sevRank(b.severity) - sevRank(a.severity);
      if (sd !== 0) return sd;
      const ta = new Date(a.timestamp).getTime();
      const tb = new Date(b.timestamp).getTime();
      return Number.isNaN(ta) || Number.isNaN(tb) ? 0 : tb - ta;
    });

  // Full layer map (all PulseKind keys present, like the background build)
  // so the SPA's layer list shows every layer — zero for empty, not missing.
  const zeroLayers = (): Record<PulseKind, number> => ({
    earthquake: 0,
    ioc_activity: 0,
    geopolitical: 0,
    tech_news: 0,
    reddit: 0,
    telegram: 0,
    x_feed: 0,
    scam: 0,
    breach: 0,
    briefing: 0,
    cyber_attack: 0,
    aircraft: 0,
    war_room: 0,
    c2_tracker: 0,
    cisa_advisory: 0,
    blocklist: 0,
    infostealer: 0,
    phishing: 0,
    malware: 0,
    ransomware: 0,
    cybercrime: 0,
    research: 0,
    cve: 0,
    actor_sighting: 0,
    ioc_correlation: 0,
    secret_leak: 0,
    malicious_package: 0,
    exploit: 0,
    github_advisory: 0,
    supply_chain_attacks: 0,
    kev: 0,
    firm: 0,
    maritime: 0,
    cyberpulse: 0,
    rss: 0,
    honeypot: 0,
  });

  const layers: Record<PulseKind, number> = zeroLayers();
  for (const e of allEvents) {
    layers[e.kind] = (layers[e.kind] ?? 0) + 1;
  }

  const payload: GlobalPulseResponse = {
    generated_at: new Date().toISOString(),
    total_events: allEvents.length,
    events: allEvents,
    layers,
  };

  return { payload, warm: merged, sync: allEvents.length };
}

/* ─── Handler ───────────────────────────────────────────────────────────── */

// In-isolate single-flight for the cold-miss sync build (DOS-1 pattern from
// live-iocs): concurrent cold-miss visitors join one in-flight build.
let inflightGpSyncBuild: Promise<GlobalPulseResponse> | null = null;

export async function globalPulseHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const force = new URL(c.req.url).searchParams.get('force') === '1';
  const cache = caches.default;
  const cacheReq = new Request(GLOBAL_PULSE_CACHE);

  // ── Self-heal nudge (no cron) ──────────────────────────────────────────
  // When the payload we're about to serve is stale, ask the GlobalPulse DO to
  // run an on-demand full rebuild (in-process, 30s CPU budget — a browser
  // `?force=1` can't survive the stateless 10ms cap, the DO can). That
  // rebuild populates every layer — including the external-fetcher ones the
  // sync build skips — so visitor traffic drives freshness instead of the
  // hourly/30-min crons. The DO throttles to ~1 rebuild/8 min and skips when
  // its data is already fresh, so this is a cheap no-op on warm traffic.
  const maybeNudgeDo = (p: { generated_at?: string } | null | undefined): void => {
    if (!c.env.GLOBAL_PULSE_DO || !p?.generated_at) return;
    const ageMs = Date.now() - new Date(p.generated_at).getTime();
    if (ageMs < 10 * 60_000) return;
    const doId = c.env.GLOBAL_PULSE_DO.idFromName('global');
    c.executionCtx.waitUntil(
      c.env.GLOBAL_PULSE_DO.get(doId)
        .fetch(new Request('https://global-pulse-do.internal/rebuild-if-stale', { method: 'POST' }))
        .catch(() => {})
    );
  };

  if (!force) {
    const cached = await cache.match(cacheReq);
    if (cached) return new Response(cached.body, cached);
  }

  const kv = c.env.KV_CACHE;

  if (!force) {
    const cachedBody = await routeCacheGet<unknown>(GP_RESPONSE_KEY);
    if (cachedBody) {
      const kvBody = JSON.stringify(cachedBody);
      maybeNudgeDo(cachedBody as { generated_at?: string } | null);
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

  // Cache miss. buildGlobalPulseSync assembles the response synchronously
  // from LIVE data within the free-plan 50-subrequest budget:
  //   1. Per-route Cache-API entries (the live responses the public /api/v1/*
  //      endpoints serve, SWR-revalidated on visitor traffic) — 1 cache.match
  //      each, no handler re-entry, no fan-out
  //   2. External fetchers (botnet C2, supply chain, DShield, blocklists,
  //      CISA KEV, URLhaus) + D1 briefings — the layers that used to be
  //      background-build-only and rendered 0 when the CPU-killed background
  //      build didn't finish
  //   3. Per-feed warm KV slices (gp:warm:<key>) as the cross-colo fallback
  //      for route caches that are cold in this colo
  // The old full 30+ source background build still runs via waitUntil to
  // refresh caches; if it gets killed by CPU limits the sync data above is
  // already a complete map.
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

  // ── Shared sync build (also used by the DO gp-30-rebuild cron) ──────
  // `full` = the DO gp-30-rebuild cron path (30s CPU budget, force=1): includes
  // the external-fetcher layers + D1 briefings. The visitor cache-miss path
  // stays cheap (route caches + warm slices + cyberpulse) so the free-plan
  // 10ms CPU cap can't kill the request — the DO's full build populates
  // KV/cache and the stale-if-error guard serves the fuller map.
  // ── Shared sync build (also used by the DO gp-30-rebuild cron) ──────
  // Single-flight: N concurrent cold-miss visitors share ONE build instead of
  // each running the full ~44-subrequest assembly (same DOS-1 collapse as
  // live-iocs' inflightLiveIoccsBuild). Payload is request-agnostic.
  if (!inflightGpSyncBuild) {
    inflightGpSyncBuild = buildGlobalPulseSync(c.env, c.executionCtx.waitUntil.bind(c.executionCtx), force).then(
      (r) => r.payload
    );
    void inflightGpSyncBuild.finally(() => {
      inflightGpSyncBuild = null;
    });
  }
  const syncResult = await inflightGpSyncBuild;

  // Stale-if-error guard: the sync build now covers every layer itself, but a
  // cold colo or a budget-gated build can still come up with fewer non-zero
  // layers than a recent full build (e.g. all route caches cold AND KV warm
  // slices expired). If a recent FULL build is available and populates more
  // layers than this sync build, serve it instead — staleness is bounded by one
  // build cycle, and a cold cache never blanks half the map for the whole
  // GP_RESPONSE_TTL.
  const nonZeroLayers = (l: unknown): number =>
    l && typeof l === 'object'
      ? Object.values(l as Record<string, unknown>).filter((n) => typeof n === 'number' && n > 0).length
      : 0;
  let payload: GlobalPulseResponse = syncResult;
  const lastGood = await routeCacheGet<GlobalPulseResponse>(GP_LAST_GOOD_KEY);
  if (
    lastGood &&
    Array.isArray(lastGood.events) &&
    lastGood.layers &&
    nonZeroLayers(lastGood.layers) > nonZeroLayers(syncResult.layers)
  ) {
    payload = lastGood;
  }

  // Self-heal: a stale served payload (cold colo, or the crons lagging)
  // kicks the DO to rebuild on-demand so the next poll/WS push is live.
  maybeNudgeDo(payload);

  const json = JSON.stringify(payload);
  const response = new Response(json, {
    headers: {
      'content-type': 'application/json',
      'cache-control': `public, max-age=${CACHE_TTL}, s-maxage=${CACHE_TTL}`,
      'access-control-allow-origin': '*',
    },
  });
  c.executionCtx.waitUntil(
    (async () => {
      await Promise.all([
        cache.put(cacheReq, response.clone()),
        routeCachePut(GP_RESPONSE_KEY, payload, GP_RESPONSE_TTL),
      ]);
      // ALSO write to KV (cross-colo) so the GlobalPulse DO's KV fallback
      // (pollFeeds reads kv.get(GP_RESPONSE_KEY)) actually has data. Without
      // this, the DO's KV fallback 404s and the WS live feed goes stale once
      // the per-colo Cache-API entry (300s TTL) expires — the page shows
      // "2 hours ago" because the DO has nothing newer to broadcast.
      // Write-on-change: an unchanged build must not burn the scarce free-plan
      // KV write quota (1k/day) — a cheap read skips the put when nothing moved.
      // Poisoning guard: a partial sync build (cold colo, warm slices missing)
      // must NOT clobber a fuller map already in KV (written by the background
      // build or a prior cycle). Compare non-zero layer counts before writing;
      // only overwrite when the new payload is at least as complete.
      if (kv) {
        const newNonZero = payload.layers ? nonZeroLayers(payload.layers) : 0;
        const existing = await readKvJson<GlobalPulseResponse>(kv, GP_RESPONSE_KEY);
        const existingNonZero = existing?.layers ? nonZeroLayers(existing.layers) : 0;
        if (existingNonZero > newNonZero) {
          // keep the fuller map — skip the put
        } else if ((await kv.get(GP_RESPONSE_KEY)) !== json) {
          await kv.put(GP_RESPONSE_KEY, json, { expirationTtl: GP_RESPONSE_TTL });
        }
        // Last-good: the sync build is now a complete map (route caches +
        // external fetchers + D1), so also refresh the long-lived last-good
        // copy here — the background build (the old sole writer) is killed by
        // the subrequest cap after the sync build consumes most of the 50,
        // and a fresh last-good keeps the stale-if-error guard + DO fallback
        // from serving an hours-old map. Same poisoning guard: never clobber
        // a fuller map already persisted.
        const lgExisting = await readKvJson<GlobalPulseResponse>(kv, GP_LAST_GOOD_KEY);
        const lgExistingNonZero = lgExisting?.layers ? nonZeroLayers(lgExisting.layers) : 0;
        if (newNonZero >= lgExistingNonZero) {
          await routeCachePut(GP_LAST_GOOD_KEY, payload, GP_LAST_GOOD_TTL);
          await kv.put(GP_LAST_GOOD_KEY, json, { expirationTtl: GP_LAST_GOOD_TTL });
        }
      }
    })()
  );

  // ── Background build for external fetchers (botnet C2, supply chain, etc.) ──
  // GATED behind ?force=1 (admin / GlobalPulse-DO rebuilds only). On the
  // stateless request path the sync build above consumes ~37+ of the 50
  // free-plan subrequests, so this build's first steps (27 parallel warm-slice
  // KV reads) deterministically throw "Too many subrequests" before reaching
  // its terminal cache/KV writes — pure wasted CPU/log noise on every visitor
  // miss. The DO cron (gp-30 / on-demand nudge) is the real refresher.
  if (force) {
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

          // Live IOCs are warm-slice-only (see the sync-build note above): the
          // direct self-fetch fans out ~35 sources on a cold slice set, exceeds
          // the free-plan subrequest cap, and aborts the whole invocation before
          // the cache/KV writes below — which is exactly how gp:response:v3 /
          // gp:last-good:v1 went missing. When the `ioc` warm slice is absent the
          // cyber_attack layer is empty for this cycle (the queue consumer
          // re-warms it) rather than killing the build.
          const finalLiveIocEvents = liveIocEvents;

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
          ].sort((a, b) => {
            const ta = new Date(a.timestamp).getTime();
            const tb = new Date(b.timestamp).getTime();
            return Number.isNaN(ta) || Number.isNaN(tb) ? 0 : tb - ta;
          });

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
          // ALSO write to KV (cross-colo) so the GlobalPulse DO's KV fallback
          // has data after the per-colo Cache-API entry expires. See the sync
          // path above for the full rationale.
          if (kv) await kv.put(GP_RESPONSE_KEY, JSON.stringify(result), { expirationTtl: GP_RESPONSE_TTL });
          // Long-lived last-good copy for the stale-if-error guard on the sync path.
          // Only written here (the sole path that populates the external-fetcher
          // layers), so it always holds a full map.
          await routeCachePut(GP_LAST_GOOD_KEY, result, GP_LAST_GOOD_TTL);
          if (kv) await kv.put(GP_LAST_GOOD_KEY, JSON.stringify(result), { expirationTtl: GP_LAST_GOOD_TTL });

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
  }

  return response;
}
