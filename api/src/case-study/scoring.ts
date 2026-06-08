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
  return Math.max(0, age / NINETY_DAYS);
}

export interface FinalScoreInput {
  recency: number;
  severity: number;
  novelty: number;
  sourceWeight: number; // 0..1
}

export function finalScore({ recency, severity, novelty, sourceWeight }: FinalScoreInput): number {
  const weighted = 0.3 * recency + 0.35 * severity + 0.25 * novelty + 0.1 * sourceWeight;
  return Number(weighted.toFixed(4));
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
  const weighted = 0.25 * recency + 0.25 * severity + 0.2 * novelty + 0.1 * sourceWeight + 0.2 * trending;
  return Number(weighted.toFixed(4));
}
