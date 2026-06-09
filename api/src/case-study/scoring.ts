import type { DedupRecord } from './types';

const DAY_MS = 24 * 3600 * 1000;
const FOURTEEN_DAYS = 14 * DAY_MS;
const NINETY_DAYS = 90 * DAY_MS;

export function recencyScore(eventIso: string, now: Date): number {
  const age = now.getTime() - new Date(eventIso).getTime();
  if (age <= DAY_MS) return 1.0;
  if (age >= FOURTEEN_DAYS) return 0;
  return 1 - (age - DAY_MS) / (FOURTEEN_DAYS - DAY_MS);
}

export interface SeverityInput {
  cvss?: number;
  kev?: boolean;
  victims?: number;
}

export function severityScore(input: SeverityInput): number {
  if (input.kev) return 1.0;
  if (typeof input.cvss === 'number') return Math.min(1, Math.max(0, input.cvss / 10));
  if (typeof input.victims === 'number') return Math.min(1, input.victims / 5);
  return 0.5;
}

export function noveltyScore(prev: DedupRecord | null, now: Date): number {
  if (!prev) return 1.0;
  const age = now.getTime() - new Date(prev.lastSeenAt).getTime();
  if (age >= NINETY_DAYS) return 1.0;
  // Exponential decay: items seen today get ~0, items seen a week ago get ~0.3
  // This strongly penalizes recently seen content to prevent repetition.
  const normalizedAge = age / NINETY_DAYS;
  return Math.max(0, Math.pow(normalizedAge, 0.5));
}

export interface FinalScoreInput {
  recency: number;
  severity: number;
  novelty: number;
  sourceWeight: number; // 0..1
}

export function finalScore({ recency, severity, novelty, sourceWeight }: FinalScoreInput): number {
  // Novelty weight increased from 0.25 to 0.35 to strongly penalize
  // recently seen items and prevent repetition in discovery.
  const weighted = 0.25 * recency + 0.3 * severity + 0.35 * novelty + 0.1 * sourceWeight;
  return Number(weighted.toFixed(4));
}

export interface FreshnessAwareScoreInput extends FinalScoreInput {
  /** 0..1 bonus for topics not seen recently (0 = seen today, 1 = never seen) */
  topicFreshness?: number;
}

/** Score with topic freshness bonus to ensure variety across discovery runs. */
export function finalScoreWithFreshness({
  recency,
  severity,
  novelty,
  sourceWeight,
  topicFreshness,
}: FreshnessAwareScoreInput): number {
  if (typeof topicFreshness !== 'number') return finalScore({ recency, severity, novelty, sourceWeight });
  // Blend: 60% base score + 40% topic freshness
  // This ensures topics not seen recently get a significant boost
  const base = finalScore({ recency, severity, novelty, sourceWeight });
  return Number((base * 0.6 + topicFreshness * 0.4).toFixed(4));
}

export interface TrendingAwareScoreInput extends FinalScoreInput {
  trending?: number;
}

export function finalScoreWithTrending({
  recency,
  severity,
  novelty,
  sourceWeight,
  trending,
}: TrendingAwareScoreInput): number {
  if (typeof trending !== 'number') return finalScore({ recency, severity, novelty, sourceWeight });
  // Novelty weight increased to strongly penalize recently seen items
  const weighted = 0.2 * recency + 0.2 * severity + 0.3 * novelty + 0.1 * sourceWeight + 0.2 * trending;
  return Number(weighted.toFixed(4));
}
