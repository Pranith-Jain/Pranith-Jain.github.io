/**
 * Bulk IoC enrichment for the intel-bundle pipeline.
 *
 * Unlike `routes/ioc.ts` (deep, all 29 providers, multi-second SSE), this is
 * the SHALLOW path: Maltiverse as the sole provider — a single search API
 * call per indicator that returns classification + blacklist sources + tags.
 * Covers every indicator type (ipv4, ipv6, domain, url, hash). Runs within
 * the Worker's 50-subrequest budget per invocation.
 *
 * Per-IoC output mirrors what `cti-stix-connector` emits: composite
 * `risk_score`, `confidence`, normalized `tags`, and the list of providers
 * that contributed. Returned as `IocEnrichment[]` for downstream STIX
 * `indicator` object assembly.
 *
 * Budget rules:
 *   - Up to MAX_IOCS_TO_ENRICH from the input list (highest-value types
 *     first: hash > url > domain > ipv4 > ipv6 > email).
 *   - Cache reads, fresh fetches, AND cache writes all count as subrequests
 *     (Free plan: 50/invocation). The whole call is bounded by
 *     HARD_SUBREQUEST_CAP; IoCs past the budget are still emitted, just
 *     without provider depth. See enrichBulk for the exact accounting.
 *   - Per-provider timeout from `BULK_PROVIDER_TIMEOUT_MS`.
 */

import type { Env } from '../env';
import type { IndicatorType } from './indicator';
import { safeNull } from './safe-catch';
import { ProviderCache } from './cache';
import { compositeScore } from './scoring';
import { BULK_ADAPTERS, PROVIDER_SUPPORT } from '../providers';
import type { Indicator, ProviderId, ProviderResult } from '../providers/types';

const BULK_PROVIDER_TIMEOUT_MS = 3000;

const BULK_PROVIDER_IDS = Object.keys(BULK_ADAPTERS) as ProviderId[];

/** Some adapters issue more than one fetch per call, so a single fetch slot
 *  can cost several subrequests. Weight them so the budget below counts real
 *  subrequests, not slots. Unlisted providers default to 1. */
const SUBREQUEST_WEIGHT: Partial<Record<ProviderId, number>> = {
  doh: 5, // A / MX / NS / TXT / DMARC TXT
  spamhaus: 2, // DROP + EDROP
};
const weightOf = (p: ProviderId): number => SUBREQUEST_WEIGHT[p] ?? 1;

/** Cap how many IoCs we enrich per item — protects the subrequest budget.
 *  Raised 20 → 60: the badge was firing on every briefing because the
 *  body extraction usually surfaces ≥20 IoCs across all the findings. */
export const MAX_IOCS_TO_ENRICH = 60;
/** Cap fresh upstream subrequests across the whole call. Workers hard-limit
 *  subrequests at 50/invocation (Free plan), and — unlike the old assumption
 *  baked into this file — KV/Cache-API reads AND writes count too. So the
 *  honest budget is reads + fetches + writes, bounded by HARD_SUBREQUEST_CAP
 *  below; this value just caps the fetch slice. */
export const MAX_FRESH_SUBREQUESTS = 35;
/** Total subrequests (cache reads + fresh fetches + cache writes) allowed
 *  across the whole call. Free plan is 50/invocation; leave headroom for the
 *  caller's D1 / analytics I/O. With Maltiverse as the sole bulk provider,
 *  each indicator costs at most 1 fresh fetch (the search API) + 1 cache
 *  write — far fewer subrequests than the old multi-provider fan-out. */
const HARD_SUBREQUEST_CAP = 45;
/** Cap cache reads (one batched KV read per indicator). Only the highest-
 *  priority slice gets a cache touch; the rest are still emitted (shallow) so
 *  the bundle carries every IoC. Bounding reads leaves room for fetches. */
const MAX_PRIME_READS = 18;
/** "Partial" only when IoCs were dropped entirely. Subrequest-budget
 *  noise (a real briefing has 30+ IoCs × 4-5 providers = far more than 35
 *  fresh calls) is the *normal* state and badging it just trains users
 *  to ignore the flag. The bundle still carries every IoC; only the
 *  provider-listing depth is shallow. The overflow flag — where we
 *  *dropped IoCs entirely* from the bundle — is the actually-meaningful
 *  signal of incompleteness. */
const PARTIAL_BADGE_MIN_OVERFLOW = 5;

const TYPE_PRIORITY: Record<IndicatorType, number> = {
  hash: 6,
  url: 5,
  domain: 4,
  ipv4: 3,
  ipv6: 2,
  email: 1,
  cve: 0,
  unknown: 0,
};

/** Per-provider score row carried alongside the composite for verdict provenance.
 *  Surfaced on the IntelView so the card UI can render "why suspicious?" detail
 *  without re-running the bulk pipeline. Errors and unsupported results are
 *  omitted — only adapters that actually completed contribute a row. */
export interface ProviderScore {
  source: ProviderId;
  score: number;
  verdict: 'malicious' | 'suspicious' | 'clean' | 'unknown';
  /** Trimmed copy of the provider's own tags so the UI tooltip can show
   *  e.g. "phishing, c2" without bloating the bundle. */
  tags: string[];
}

export interface IocEnrichment {
  type: IndicatorType;
  value: string;
  /** Composite risk score 0-100 (malicious-biased — see `lib/scoring.ts`). */
  riskScore: number;
  /** Number of contributing OK providers, 0-100 normalized for STIX `confidence`. */
  confidence: number;
  /** Provider tags after dedupe + normalization. */
  tags: string[];
  /** Provider IDs that returned an `ok` result for this indicator. */
  listedIn: ProviderId[];
  /** Verdict from `compositeScore` — 'malicious' | 'suspicious' | 'clean' | 'unknown'. */
  verdict: 'malicious' | 'suspicious' | 'clean' | 'unknown';
  /** Number of bulk providers attempted (excluded `unsupported`). */
  contributing: number;
  /** Per-provider scores for verdict provenance (UI hover/expand). */
  providerScores: ProviderScore[];
}

export interface BulkEnrichResult {
  enrichments: IocEnrichment[];
  /** True only when IoCs were dropped entirely (overflow). Subrequest-budget
   *  shortfalls no longer trigger this — see partial-badge comments. */
  partial: boolean;
  /** IoCs intentionally skipped (over MAX_IOCS_TO_ENRICH). Still surfaceable in `view.iocsOverflow`. */
  overflow: { type: IndicatorType; value: string }[];
  /** Number of fresh subrequests actually made (for observability). */
  freshSubrequests: number;
  /** Number of provider lookups dropped because the fresh-subrequest budget
   *  was exhausted. Useful for tuning MAX_FRESH_SUBREQUESTS — NOT user-facing. */
  droppedSubrequests: number;
}

/** Build the provider env shape required by adapters. */
function buildProviderEnv(env: Env) {
  return {
    VT_API_KEY: env.VT_API_KEY ?? '',
    ABUSEIPDB_API_KEY: env.ABUSEIPDB_API_KEY ?? '',
    SHODAN_API_KEY: env.SHODAN_API_KEY ?? '',
    CENSYS_PAT: env.CENSYS_PAT ?? '',
    CENSYS_ORG_ID: env.CENSYS_ORG_ID ?? '',
    NETLAS_API_KEY: env.NETLAS_API_KEY ?? '',
    OTX_API_KEY: env.OTX_API_KEY ?? '',
    URLSCAN_API_KEY: env.URLSCAN_API_KEY ?? '',
    HYBRID_ANALYSIS_API_KEY: env.HYBRID_ANALYSIS_API_KEY ?? '',
    ABUSECH_AUTH_KEY: env.ABUSECH_AUTH_KEY,
    MALSHARE_API_KEY: env.MALSHARE_API_KEY,
  };
}

function normalizeTags(input: ProviderResult[]): string[] {
  const seen = new Set<string>();
  for (const r of input) {
    if (r.status !== 'ok') continue;
    for (const t of r.tags) {
      // Normalize: lowercase, strip provider prefixes for downstream consumers.
      // STIX `indicator.labels` already uses a controlled vocabulary
      // ('malicious-activity', etc.), so the provider-tag noise is best kept
      // in our custom `x_tags` field rather than `labels`.
      const lower = t.toLowerCase();
      seen.add(lower);
    }
  }
  return [...seen].slice(0, 20);
}

/** Sort IoCs by priority (high-signal first). Stable on equal keys. */
function prioritizeIocs(iocs: Indicator[]): Indicator[] {
  return [...iocs].sort((a, b) => (TYPE_PRIORITY[b.type] ?? 0) - (TYPE_PRIORITY[a.type] ?? 0));
}

/** Eligible bulk providers for a given indicator type. */
function eligibleProvidersFor(type: IndicatorType): ProviderId[] {
  return BULK_PROVIDER_IDS.filter((p) => PROVIDER_SUPPORT[p]?.includes(type));
}

/**
 * Enrich a set of indicators using Maltiverse as the sole bulk provider.
 *
 * Subrequest accounting (Free plan = 50/invocation): batched cache reads,
 * fresh fetches, AND cache writes all count. We prime each indicator's
 * combined cache entry with ONE KV read (not one per provider), fetch Maltiverse
 * for a bounded number of misses, and write each touched indicator back once.
 * Keeping reads + 2·fetches ≤ HARD_SUBREQUEST_CAP (writes ≤ fetches)
 * guarantees the true total stays under the cap.
 */
export async function enrichBulk(
  rawIocs: Indicator[],
  env: Env,
  options: {
    maxIocs?: number;
    maxFresh?: number;
    perProviderTimeoutMs?: number;
    maxPrimeReads?: number;
    maxSubrequests?: number;
  } = {}
): Promise<BulkEnrichResult> {
  const maxIocs = options.maxIocs ?? MAX_IOCS_TO_ENRICH;
  const maxFresh = options.maxFresh ?? MAX_FRESH_SUBREQUESTS;
  const perTimeout = options.perProviderTimeoutMs ?? BULK_PROVIDER_TIMEOUT_MS;
  const cap = options.maxSubrequests ?? HARD_SUBREQUEST_CAP;

  const prioritized = prioritizeIocs(rawIocs);
  const chosen = prioritized.slice(0, maxIocs);
  const overflow = prioritized.slice(maxIocs).map(({ type, value }) => ({ type, value }));

  const providerEnv = buildProviderEnv(env);
  const ikey = (i: Indicator) => `${i.type}|${i.value.toLowerCase()}`;

  // Only the highest-priority slice gets a cache touch; the cap bounds reads
  // (which count as subrequests). Un-primed IoCs are still emitted (shallow).
  const primeCount = Math.min(chosen.length, options.maxPrimeReads ?? MAX_PRIME_READS, cap);
  const primed = chosen.slice(0, primeCount);

  // Phase 1: one batched KV read per primed indicator (parallel). Each
  // ProviderCache instance holds the combined entry for a single indicator.
  const caches = new Map<string, ProviderCache>();
  await Promise.all(
    primed.map(async (indicator) => {
      const pc = new ProviderCache(env.KV_CACHE);
      try {
        await pc.primeBatch(indicator);
      } catch {
        /* transient cache error — treat as cold */
      }
      caches.set(ikey(indicator), pc);
    })
  );

  // Resolve cache hits in memory (free) and collect the misses. Pre-seed a
  // results bucket for every chosen IoC so parallel writers never race on
  // map creation, and un-primed IoCs still aggregate (to an empty list).
  type Slot = { indicator: Indicator; provider: ProviderId };
  const resultsByIndicator = new Map<string, ProviderResult[]>();
  const missSlots: Slot[] = [];
  let totalMissPairs = 0;
  for (const indicator of chosen) {
    resultsByIndicator.set(ikey(indicator), []);
    const pc = caches.get(ikey(indicator));
    for (const provider of eligibleProvidersFor(indicator.type)) {
      const hit = pc?.getBatched(provider) ?? null;
      if (hit) {
        resultsByIndicator.get(ikey(indicator))!.push(hit);
        continue;
      }
      totalMissPairs++;
      // Only primed indicators are fetch-eligible — fetching an un-primed
      // miss would orphan a cache write we can't afford.
      if (pc) missSlots.push({ indicator, provider });
    }
  }

  // Phase 2: greedily select misses to fetch within the budget. `spent`
  // tracks reads already made; each accepted slot costs weight(provider) for
  // the fetch(es) plus 1 reserved for its eventual cache write. Because the
  // reserve is per-slot and writes are per-indicator (≤ slots), the real
  // total (reads + Σweight + writes) can never exceed `cap`.
  let spent = primed.length;
  let freshSubrequests = 0;
  const toFetch: Slot[] = [];
  for (const s of missSlots) {
    if (toFetch.length >= maxFresh) break;
    const cost = weightOf(s.provider) + 1;
    if (spent + cost > cap) break;
    spent += cost;
    freshSubrequests += weightOf(s.provider);
    toFetch.push(s);
  }
  // We intentionally do NOT flip `partial` on a subrequest-budget shortfall.
  // Every IoC is still emitted into the bundle; the provider-coverage depth
  // is shallower but the bundle isn't materially incomplete. Observability only.
  const droppedSubrequests = totalMissPairs - toFetch.length;

  const touched = new Set<string>();
  await Promise.all(
    toFetch.map(async (s) => {
      const adapter = BULK_ADAPTERS[s.provider];
      if (!adapter) return;
      const signal = AbortSignal.timeout(perTimeout);
      const pc = caches.get(ikey(s.indicator));
      try {
        const r = await adapter(s.indicator, providerEnv, signal);
        resultsByIndicator.get(ikey(s.indicator))!.push(r);
        if (r.status === 'ok' && pc) {
          pc.stageBatched(s.provider, s.indicator, r);
          touched.add(ikey(s.indicator));
        }
      } catch (err) {
        resultsByIndicator.get(ikey(s.indicator))!.push({
          source: s.provider,
          status: 'error',
          score: 0,
          verdict: 'unknown',
          raw_summary: {},
          tags: [],
          error: err instanceof Error ? err.message : String(err),
          fetched_at: new Date().toISOString(),
          cached: false,
        });
      }
    })
  );

  // Phase 2b: write each touched indicator back in ONE batched KV put. Skip
  // untouched indicators so we never pay a write for a read-only hit.
  await Promise.all(
    primed
      .filter((indicator) => touched.has(ikey(indicator)))
      .map((indicator) => safeNull(caches.get(ikey(indicator))!.flushBatch(indicator)))
  );

  // Phase 3: aggregate per indicator.
  const enrichments: IocEnrichment[] = [];
  for (const indicator of chosen) {
    const results = resultsByIndicator.get(ikey(indicator)) ?? [];

    const composite = compositeScore(indicator.type, results);
    const okResults = results.filter((r) => r.status === 'ok');
    // Provenance: keep every ok-status row sorted by score desc so the UI
    // can render the contributing signals top-down without re-sorting. Tag
    // list trimmed to 6 per provider to bound the bundle size on noisy
    // results (urlhaus alone can return 20+ tags).
    const providerScores: ProviderScore[] = okResults
      .map((r) => ({
        source: r.source,
        score: r.score,
        verdict: r.verdict,
        tags: r.tags.slice(0, 6),
      }))
      .sort((a, b) => b.score - a.score);
    enrichments.push({
      type: indicator.type,
      value: indicator.value,
      riskScore: composite.score,
      confidence: composite.confidence === 'high' ? 95 : composite.confidence === 'medium' ? 75 : 50,
      tags: normalizeTags(results),
      listedIn: okResults.filter((r) => r.score >= 40).map((r) => r.source),
      verdict: composite.verdict,
      contributing: composite.contributing,
      providerScores,
    });
  }

  return {
    enrichments,
    // Badge only when the bundle is materially incomplete — i.e. IoCs
    // were dropped entirely off the tail (overflow). Subrequest-budget
    // shortfalls don't trigger the badge anymore; see comments above.
    partial: overflow.length >= PARTIAL_BADGE_MIN_OVERFLOW,
    overflow,
    freshSubrequests,
    droppedSubrequests,
  };
}
