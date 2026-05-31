/**
 * IOC Scoring & Decay Engine
 *
 * Implements a time-decay model for IOC confidence scoring, inspired by
 * the Diamond Model and STIX 2.1 confidence framework.
 *
 * Key concepts:
 *   - Base Score: 0-100, derived from source count and source reliability
 *   - Time Decay: Score halves every DECAY_HALF_LIFE_DAYS (default 30)
 *   - Correlation Boost: IOCs seen across multiple independent sources get
 *     a multiplicative boost (up to 1.5x)
 *   - Source Weighting: Each source has a reliability tier (A-F) that
 *     affects the base score contribution
 *
 * The scoring model is designed to:
 *   1. Prioritize fresh, multi-source IOCs in triage
 *   2. Automatically de-prioritize stale indicators
 *   3. Reward corroboration across independent sources
 *   4. Allow analysts to tune decay rates per indicator type
 *
 * Usage:
 *   import { scoreIoc, type IocObservation } from '../lib/ioc-scoring';
 *   const score = scoreIoc(observations);
 */

// ── Source Reliability Tiers (Admiralty Code) ─────────────────────

/**
 * Source reliability ratings following the NATO Admiralty Code (A-F).
 * Each tier has a weight multiplier for score calculation.
 */
export const SOURCE_RELIABILITY: Record<string, { weight: number; label: string }> = {
  'A': { weight: 1.0, label: 'Completely reliable' },
  'B': { weight: 0.8, label: 'Usually reliable' },
  'C': { weight: 0.6, label: 'Fairly reliable' },
  'D': { weight: 0.4, label: 'Not usually reliable' },
  'E': { weight: 0.2, label: 'Unreliable' },
  'F': { weight: 0.1, label: 'Reliability cannot be judged' },
};

/** Default reliability tier for sources not explicitly rated. */
const DEFAULT_RELIABILITY = 'C';

// ── Decay Configuration ──────────────────────────────────────────

/** Default half-life in days. After this period, an IOC's score drops to 50%. */
const DEFAULT_DECAY_HALF_LIFE_DAYS = 30;

/** Minimum score below which an IOC is considered "dormant". */
const DORMANT_THRESHOLD = 15;

/** Maximum correlation boost multiplier. */
const MAX_CORRELATION_BOOST = 1.5;

/** Number of independent sources for maximum correlation boost. */
const MAX_CORRELATION_SOURCES = 5;

// ── Types ────────────────────────────────────────────────────────

export interface IocObservation {
  /** Source identifier (e.g., 'virustotal', 'abuseipdb', 'threatfox'). */
  source: string;
  /** Source reliability tier (A-F). Defaults to 'C' if not provided. */
  reliability?: string;
  /** When this observation was made (ISO 8601). */
  observedAt: string;
  /** Raw score from this source (0-100). If not provided, uses source weight. */
  sourceScore?: number;
  /** Additional metadata from the source. */
  meta?: Record<string, unknown>;
}

export interface IocScore {
  /** Final composite score (0-100). */
  score: number;
  /** Base score before decay (0-100). */
  baseScore: number;
  /** Time decay multiplier applied (0-1). */
  decayFactor: number;
  /** Correlation boost multiplier applied (1.0 - MAX_CORRELATION_BOOST). */
  correlationBoost: number;
  /** Number of independent sources observed. */
  sourceCount: number;
  /** Most recent observation timestamp. */
  lastSeen: string;
  /** Oldest observation timestamp. */
  firstSeen: string;
  /** Whether the IOC is considered dormant (score < DORMANT_THRESHOLD). */
  isDormant: boolean;
  /** Admiralty-style confidence level. */
  confidence: 'HIGH' | 'MODERATE' | 'LOW';
  /** Per-source breakdown. */
  breakdown: Array<{
    source: string;
    reliability: string;
    weight: number;
    contribution: number;
    observedAt: string;
  }>;
}

// ── Core Scoring Logic ───────────────────────────────────────────

/**
 * Calculate the time decay factor for an observation.
 *
 * Uses exponential decay: factor = 2^(-age_days / half_life)
 *
 * - At age=0 (now): factor=1.0
 * - At age=half_life: factor=0.5
 * - At age=2*half_life: factor=0.25
 * - At age=3*half_life: factor=0.125
 */
function timeDecay(observedAt: string, now: Date, halfLifeDays: number): number {
  const observed = new Date(observedAt);
  const ageMs = now.getTime() - observed.getTime();
  const ageDays = Math.max(0, ageMs / (1000 * 60 * 60 * 24));
  return Math.pow(2, -ageDays / halfLifeDays);
}

/**
 * Calculate the correlation boost for multiple independent sources.
 *
 * More independent sources = higher confidence. The boost follows a
 * logarithmic curve: diminishing returns after 3-4 sources.
 */
function correlationBoost(sourceCount: number): number {
  if (sourceCount <= 1) return 1.0;
  // Logarithmic scaling: ln(sources) / ln(MAX) * (MAX_BOOST - 1) + 1
  const maxSources = Math.max(2, MAX_CORRELATION_SOURCES);
  const boost = Math.log(sourceCount) / Math.log(maxSources);
  return 1.0 + Math.min(boost, 1.0) * (MAX_CORRELATION_BOOST - 1.0);
}

/**
 * Get the reliability weight for a source tier.
 */
function getReliabilityWeight(tier?: string): number {
  const t = (tier ?? DEFAULT_RELIABILITY).toUpperCase();
  return SOURCE_RELIABILITY[t]?.weight ?? SOURCE_RELIABILITY[DEFAULT_RELIABILITY]?.weight ?? 0.6;
}

/**
 * Score an IOC based on its observations.
 *
 * @param observations - Array of observations from different sources
 * @param decayHalfLifeDays - Half-life for time decay (default: 30)
 * @returns Composite IOC score with breakdown
 */
export function scoreIoc(
  observations: IocObservation[],
  decayHalfLifeDays: number = DEFAULT_DECAY_HALF_LIFE_DAYS
): IocScore {
  if (observations.length === 0) {
    return {
      score: 0,
      baseScore: 0,
      decayFactor: 0,
      correlationBoost: 1.0,
      sourceCount: 0,
      lastSeen: '',
      firstSeen: '',
      isDormant: true,
      confidence: 'LOW',
      breakdown: [],
    };
  }

  const now = new Date();

  // Deduplicate by source (keep most recent per source).
  const bySource = new Map<string, IocObservation>();
  for (const obs of observations) {
    const existing = bySource.get(obs.source);
    if (!existing || new Date(obs.observedAt) > new Date(existing.observedAt)) {
      bySource.set(obs.source, obs);
    }
  }

  const unique = [...bySource.values()];
  if (unique.length === 0) {
    return {
      score: 0, baseScore: 0, decayFactor: 0, correlationBoost: 1.0,
      sourceCount: 0, lastSeen: '', firstSeen: '', isDormant: true,
      confidence: 'LOW', breakdown: [],
    };
  }
  const sourceCount = unique.length;

  // Calculate weighted, decayed score per source.
  let weightedSum = 0;
  let weightSum = 0;
  const breakdown: IocScore['breakdown'] = [];

  for (const obs of unique) {
    const weight = getReliabilityWeight(obs.reliability);
    const decay = timeDecay(obs.observedAt, now, decayHalfLifeDays);
    const baseContrib = obs.sourceScore ?? (weight * 100);
    const decayedContrib = baseContrib * decay;

    weightedSum += decayedContrib * weight;
    weightSum += weight;

    breakdown.push({
      source: obs.source,
      reliability: obs.reliability ?? DEFAULT_RELIABILITY,
      weight,
      contribution: Math.round(decayedContrib),
      observedAt: obs.observedAt,
    });
  }

  // Base score: weighted average of source contributions.
  const baseScore = weightSum > 0 ? weightedSum / weightSum : 0;

  // Apply correlation boost.
  const cBoost = correlationBoost(sourceCount);
  const boostedScore = Math.min(100, baseScore * cBoost);

  // Time decay of the most recent observation.
  const mostRecent = unique.reduce((a, b) =>
    new Date(a.observedAt) > new Date(b.observedAt) ? a : b
  );
  const oldest = unique.reduce((a, b) =>
    new Date(a.observedAt) < new Date(b.observedAt) ? a : b
  );
  if (!mostRecent || !oldest) {
    return {
      score: 0, baseScore: 0, decayFactor: 0, correlationBoost: 1.0,
      sourceCount: 0, lastSeen: '', firstSeen: '', isDormant: true,
      confidence: 'LOW', breakdown: [],
    };
  }
  const recentDecay = timeDecay(mostRecent.observedAt, now, decayHalfLifeDays);

  // Final score: boosted score * recent observation decay.
  const finalScore = Math.round(boostedScore * recentDecay);

  // Confidence classification.
  const confidence: IocScore['confidence'] =
    finalScore >= 70 && sourceCount >= 3 ? 'HIGH' :
    finalScore >= 40 && sourceCount >= 2 ? 'MODERATE' :
    'LOW';

  return {
    score: Math.min(100, Math.max(0, finalScore)),
    baseScore: Math.round(baseScore),
    decayFactor: Math.round(recentDecay * 100) / 100,
    correlationBoost: Math.round(cBoost * 100) / 100,
    sourceCount,
    lastSeen: mostRecent.observedAt,
    firstSeen: oldest.observedAt,
    isDormant: finalScore < DORMANT_THRESHOLD,
    confidence,
    breakdown,
  };
}

/**
 * Classify an IOC score into an Admiralty-style grade.
 */
export function scoreToGrade(score: number): { grade: string; label: string; color: string } {
  if (score >= 80) return { grade: 'A', label: 'Confirmed — high confidence, act on this', color: 'emerald' };
  if (score >= 60) return { grade: 'B', label: 'Probable — likely malicious, investigate', color: 'blue' };
  if (score >= 40) return { grade: 'C', label: 'Possible — suspicious, monitor', color: 'amber' };
  if (score >= 20) return { grade: 'D', label: 'Doubtful — low confidence, verify', color: 'orange' };
  if (score >= DORMANT_THRESHOLD) return { grade: 'E', label: 'Improbable — likely stale or false positive', color: 'red' };
  return { grade: 'F', label: 'Dormant — no recent activity', color: 'slate' };
}

/**
 * Calculate IOC lifecycle metrics from observations.
 */
export function calculateLifecycle(observations: IocObservation[]): {
  firstSeen: string;
  lastSeen: string;
  activeDays: number;
  observationCount: number;
  uniqueSources: number;
  trend: 'rising' | 'stable' | 'declining';
  decayRate: number;
} {
  if (observations.length === 0) {
    return {
      firstSeen: '',
      lastSeen: '',
      activeDays: 0,
      observationCount: 0,
      uniqueSources: 0,
      trend: 'stable',
      decayRate: 0,
    };
  }

  const sorted = [...observations].sort(
    (a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime()
  );

  const firstSeen = sorted[0]?.observedAt ?? '';
  const lastSeen = sorted[sorted.length - 1]?.observedAt ?? '';
  const activeDays = Math.ceil(
    (new Date(lastSeen).getTime() - new Date(firstSeen).getTime()) / (1000 * 60 * 60 * 24)
  );

  const uniqueSources = new Set(observations.map((o) => o.source)).size;

  // Trend: compare recent half vs older half observation frequency.
  const midpoint = Math.floor(sorted.length / 2);
  const olderHalf = sorted.slice(0, midpoint);
  const recentHalf = sorted.slice(midpoint);
  const olderRate = olderHalf.length / Math.max(1, activeDays / 2);
  const recentRate = recentHalf.length / Math.max(1, activeDays / 2);

  const trend: 'rising' | 'stable' | 'declining' =
    recentRate > olderRate * 1.3 ? 'rising' :
    recentRate < olderRate * 0.7 ? 'declining' :
    'stable';

  // Decay rate: how fast the score is declining (observations per day).
  const decayRate = observations.length / Math.max(1, activeDays);

  return {
    firstSeen,
    lastSeen,
    activeDays,
    observationCount: observations.length,
    uniqueSources,
    trend,
    decayRate: Math.round(decayRate * 100) / 100,
  };
}
