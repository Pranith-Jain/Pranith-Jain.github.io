import { SOURCE_RELIABILITY_REGISTRY, type SourceReliability } from '../confidence';

export interface SourceGrade {
  id: string;
  reliability: SourceReliability;
  description?: string;
}

/** Per-source Admiralty reliability for the report's sources appendix. */
export function gradeSources(sourceIds: string[]): SourceGrade[] {
  return sourceIds.map((id) => {
    const entry = SOURCE_RELIABILITY_REGISTRY[id];
    return {
      id,
      reliability: entry?.reliability ?? 'F',
      description: entry?.description,
    };
  });
}

const HALF_LIFE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const FLOOR = 0.1;

/**
 * Temporal decay factor in (FLOOR, 1] using a 30-day half-life. A freshly
 * fetched/observed claim scores 1.0; a 30-day-old one ≈0.5. Invalid or missing
 * timestamps clamp to FLOOR so stale-but-unknown data is down-weighted, not zeroed.
 */
export function freshnessDecay(observedAt: string | undefined, nowMs: number): number {
  if (!observedAt) return FLOOR;
  const t = Date.parse(observedAt);
  if (Number.isNaN(t)) return FLOOR;
  const ageMs = Math.max(0, nowMs - t);
  const factor = Math.pow(0.5, ageMs / HALF_LIFE_MS);
  return Math.max(FLOOR, Math.min(1, factor));
}
