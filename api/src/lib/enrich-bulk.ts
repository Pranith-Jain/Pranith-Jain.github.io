/**
 * Bulk IoC enrichment for the intel-bundle pipeline.
 *
 * Unlike `routes/ioc.ts` (deep, all 29 providers, multi-second SSE), this is
 * the SHALLOW path: run only the free, cheap providers that don't need a
 * paid API key, aggressively use the edge-cache, and respect the Worker's
 * 50-subrequest budget per invocation.
 *
 * Per-IoC output mirrors what `cti-stix-connector` emits: composite
 * `risk_score`, `confidence`, normalized `tags`, and the list of providers
 * that contributed. Returned as `IocEnrichment[]` for downstream STIX
 * `indicator` object assembly.
 *
 * Budget rules:
 *   - Up to MAX_IOCS_TO_ENRICH from the input list (highest-value types
 *     first: hash > url > domain > ipv4 > ipv6 > email).
 *   - Cached results are free. Only fresh upstream calls count toward
 *     MAX_FRESH_SUBREQUESTS. Beyond that, remaining (ioc × provider) pairs
 *     are skipped and marked partial.
 *   - Per-provider timeout from `PROVIDER_TIMEOUT_MS`.
 */

import type { Env } from '../env';
import type { IndicatorType } from './indicator';
import { ProviderCache } from './cache';
import { compositeScore } from './scoring';
import {
  PROVIDER_SUPPORT,
  type Indicator,
  type ProviderAdapter,
  type ProviderId,
  type ProviderResult,
} from '../providers/types';

// Tighter than the deep `/api/v1/ioc` path (8s) — the bulk pipeline is
// rendering live cards, so trading completeness for snappy first-paint
// is the right call. Providers that exceed this drop into the
// `partial` flag rather than holding the bundle.
const BULK_PROVIDER_TIMEOUT_MS = 3000;

// Free providers — no paid API key required. The abuse.ch set (urlhaus,
// threatfox, malwarebazaar, yaraify) needs ABUSECH_AUTH_KEY which the
// platform already sets in the Worker env; if missing they each return
// `error` and are dropped from the composite without surfacing.
import { urlhaus } from '../providers/urlhaus';
import { threatfox } from '../providers/threatfox';
import { malwarebazaar } from '../providers/malwarebazaar';
import { malshare } from '../providers/malshare';
import { yaraify } from '../providers/yaraify';
import { tor } from '../providers/tor';
import { spamhaus } from '../providers/spamhaus';
import { doh } from '../providers/doh';
import { openphish } from '../providers/openphish';
import { cinsarmy } from '../providers/cinsarmy';
import { bitwire } from '../providers/bitwire';
import { blocklistde } from '../providers/blocklistde';
import { binarydefense } from '../providers/binarydefense';
import { ipsum } from '../providers/ipsum';
import { phishingArmy } from '../providers/phishingArmy';
import { tweetfeed } from '../providers/tweetfeed';
import { hashlookup } from '../providers/hashlookup';
import { c2tracker } from '../providers/c2tracker';
import { sslbl } from '../providers/sslbl';
import { malwareworld } from '../providers/malwareworld';
import { emailrep } from '../providers/emailrep';

/** Adapters allowed in the bulk path. */
const BULK_ADAPTERS: Partial<Record<ProviderId, ProviderAdapter>> = {
  urlhaus,
  threatfox,
  malwarebazaar,
  malshare,
  yaraify,
  tor,
  spamhaus,
  doh,
  openphish,
  cinsarmy,
  bitwire,
  blocklistde,
  binarydefense,
  ipsum,
  phishingArmy,
  tweetfeed,
  hashlookup,
  c2tracker,
  sslbl,
  malwareworld,
  emailrep,
};

const BULK_PROVIDER_IDS = Object.keys(BULK_ADAPTERS) as ProviderId[];

/** Cap how many IoCs we enrich per item — protects the subrequest budget.
 *  Raised 20 → 60: the badge was firing on every briefing because the
 *  body extraction usually surfaces ≥20 IoCs across all the findings. */
export const MAX_IOCS_TO_ENRICH = 60;
/** Cap fresh upstream subrequests across the whole call. Cached lookups
 *  are free. Workers hard-limit subrequests at 50/invocation, so we leave
 *  headroom for D1 reads / writes / cache I/O. */
export const MAX_FRESH_SUBREQUESTS = 35;
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
 * Enrich a set of indicators using only the free bulk-provider subset.
 * Reads the edge cache first for every (provider, indicator) pair — only
 * misses count toward the fresh-subrequest budget.
 */
export async function enrichBulk(
  rawIocs: Indicator[],
  env: Env,
  options: { maxIocs?: number; maxFresh?: number; perProviderTimeoutMs?: number } = {}
): Promise<BulkEnrichResult> {
  const maxIocs = options.maxIocs ?? MAX_IOCS_TO_ENRICH;
  const maxFresh = options.maxFresh ?? MAX_FRESH_SUBREQUESTS;
  const perTimeout = options.perProviderTimeoutMs ?? BULK_PROVIDER_TIMEOUT_MS;

  const prioritized = prioritizeIocs(rawIocs);
  const chosen = prioritized.slice(0, maxIocs);
  const overflow = prioritized.slice(maxIocs).map(({ type, value }) => ({ type, value }));

  const cache = new ProviderCache(env.KV_CACHE);
  const providerEnv = buildProviderEnv(env);

  // Build the full (indicator, provider) work list up front so all uncached
  // fetches run in a single parallel batch — bounding wall-clock time by
  // ~perTimeout rather than (perTimeout × IoCs).
  type Slot = { indicator: Indicator; provider: ProviderId; cached?: ProviderResult };
  const slots: Slot[] = [];
  for (const indicator of chosen) {
    for (const provider of eligibleProvidersFor(indicator.type)) {
      slots.push({ indicator, provider });
    }
  }

  // Phase 1: cache reads (cheap, parallel).
  await Promise.all(
    slots.map(async (s) => {
      const hit = await cache.get(s.provider, s.indicator);
      if (hit) s.cached = hit;
    })
  );

  // Phase 2: schedule fresh upstream calls — respect the global budget.
  const freshSlots = slots.filter((s) => !s.cached);
  const toFetch = freshSlots.slice(0, maxFresh);
  // We intentionally do NOT flip `partial` on a subrequest-budget shortfall.
  // Every IoC is still emitted into the bundle; the provider-coverage depth
  // is shallower but the bundle isn't materially incomplete. Tracked here
  // for observability only.
  const droppedSubrequests = freshSlots.length - toFetch.length;

  const freshResults = new Map<string, ProviderResult>();
  await Promise.all(
    toFetch.map(async (s) => {
      const adapter = BULK_ADAPTERS[s.provider];
      if (!adapter) return;
      const signal = AbortSignal.timeout(perTimeout);
      const key = `${s.indicator.type}|${s.indicator.value.toLowerCase()}|${s.provider}`;
      try {
        const r = await adapter(s.indicator, providerEnv, signal);
        freshResults.set(key, r);
        if (r.status === 'ok') {
          await cache.set(s.provider, s.indicator, r).catch(() => {
            /* cache writes are non-fatal */
          });
        }
      } catch (err) {
        freshResults.set(key, {
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

  // Phase 3: aggregate per indicator.
  const enrichments: IocEnrichment[] = [];
  for (const indicator of chosen) {
    const indicatorKey = `${indicator.type}|${indicator.value.toLowerCase()}`;
    const results: ProviderResult[] = [];
    for (const provider of eligibleProvidersFor(indicator.type)) {
      const slot = slots.find((s) => s.indicator === indicator && s.provider === provider);
      if (!slot) continue;
      if (slot.cached) {
        results.push(slot.cached);
      } else {
        const r = freshResults.get(`${indicatorKey}|${provider}`);
        if (r) results.push(r);
      }
    }

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
    freshSubrequests: toFetch.length,
    droppedSubrequests,
  };
}
