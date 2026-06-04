import type { SourceReliability } from '../confidence';
import type { SourceResult } from './types';
import { freshnessDecay } from './confidence-ext';

export interface RankedItem {
  sourceId: string;
  authority: SourceReliability;
  text: string;
  url?: string;
  observed_at?: string;
  score: number;
}

const authorityWeight = (r: SourceReliability): number =>
  ({ A: 1.0, B: 0.85, C: 0.7, D: 0.5, E: 0.3, F: 0.15 })[r] ?? 0.15;

function relevance(text: string, canonical: string): number {
  const t = text.toLowerCase();
  const q = canonical.toLowerCase();
  if (!q) return 0.5;
  if (t.includes(q)) return 1.0;
  const tokens = q.split(/\s+/).filter(Boolean);
  const hits = tokens.filter((tok) => t.includes(tok)).length;
  return tokens.length ? 0.3 + 0.7 * (hits / tokens.length) : 0.5;
}

/** Flatten source items and order by recency × authority × relevance; trim to maxItems. */
export function rankEvidence(
  sources: SourceResult[],
  subject: { canonical: string },
  nowMs: number,
  maxItems = 40
): RankedItem[] {
  const flat: RankedItem[] = [];
  for (const s of sources) {
    if (s.status !== 'ok') continue;
    for (const item of s.items) {
      const score =
        freshnessDecay(item.observed_at, nowMs) *
        authorityWeight(s.authority) *
        relevance(item.text, subject.canonical);
      flat.push({
        sourceId: s.id,
        authority: s.authority,
        text: item.text,
        url: item.url,
        observed_at: item.observed_at,
        score,
      });
    }
  }
  flat.sort((a, b) => b.score - a.score);
  return flat.slice(0, maxItems);
}
