import { describe, it, expect } from 'vitest';
import { mulberry32, dateSeed, weightedSampleByScore } from '../../../src/case-study/discovery/sampling';
import type { Candidate } from '../../../src/case-study/types';

const c = (key: string, score: number): Candidate => ({
  key,
  type: 'cve',
  title: key,
  rationale: '',
  score,
  evidence: {},
  discoveredAt: '2026-06-04T06:00:00Z',
  status: 'pending',
});

describe('dateSeed', () => {
  it('is stable within a UTC day and differs across days', () => {
    expect(dateSeed(new Date('2026-06-04T01:00:00Z'))).toBe(dateSeed(new Date('2026-06-04T23:00:00Z')));
    expect(dateSeed(new Date('2026-06-04T06:00:00Z'))).not.toBe(dateSeed(new Date('2026-06-05T06:00:00Z')));
  });
});

describe('weightedSampleByScore', () => {
  const pool = [c('a', 0.9), c('b', 0.8), c('c', 0.7), c('d', 0.6), c('e', 0.5)];

  it('returns all (sorted) when k >= pool size', () => {
    const out = weightedSampleByScore(pool.slice(0, 2), 5, mulberry32(1));
    expect(out.map((x) => x.key)).toEqual(['a', 'b']);
  });

  it('returns exactly k unique items', () => {
    const out = weightedSampleByScore(pool, 3, mulberry32(42));
    expect(out).toHaveLength(3);
    expect(new Set(out.map((x) => x.key)).size).toBe(3);
  });

  it('always includes the single highest-scored item', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const out = weightedSampleByScore(pool, 3, mulberry32(seed));
      expect(out.map((x) => x.key)).toContain('a');
    }
  });

  it('produces varied selections across seeds (not a fixed top-k)', () => {
    // Ignore the guaranteed top item ('a'); collect the lower-slot picks.
    const seen = new Set<string>();
    for (let seed = 0; seed < 50; seed += 1) {
      const out = weightedSampleByScore(pool, 3, mulberry32(seed));
      seen.add(
        out
          .map((x) => x.key)
          .slice(1)
          .sort()
          .join(',')
      );
    }
    // A strict top-k selector would yield the same set every run (size 1).
    expect(seen.size).toBeGreaterThan(1);
  });
});
