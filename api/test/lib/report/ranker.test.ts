import { describe, it, expect } from 'vitest';
import { rankEvidence } from '../../../src/lib/report/ranker';
import type { SourceResult } from '../../../src/lib/report/types';

const now = Date.parse('2026-06-04T00:00:00Z');
const src = (
  id: string,
  authority: SourceResult['authority'],
  observed: string | undefined,
  text: string
): SourceResult => ({
  id,
  name: id,
  authority,
  fetched_at: '2026-06-04T00:00:00Z',
  status: 'ok',
  total: 1,
  items: [{ text, observed_at: observed }],
});

describe('rankEvidence', () => {
  it('ranks a fresh authoritative relevant item above a stale low-authority one', () => {
    const ranked = rankEvidence(
      [
        src('a', 'A', '2026-06-03T00:00:00Z', 'LockBit ransomware activity'),
        src('b', 'E', '2025-01-01T00:00:00Z', 'unrelated note'),
      ],
      { canonical: 'LockBit' },
      now
    );
    expect(ranked[0]?.sourceId).toBe('a');
  });
  it('trims to maxItems', () => {
    const many: SourceResult[] = Array.from({ length: 30 }, (_, i) =>
      src(`s${i}`, 'C', '2026-06-03T00:00:00Z', 'LockBit item')
    );
    const ranked = rankEvidence(many, { canonical: 'LockBit' }, now, 10);
    expect(ranked).toHaveLength(10);
  });
});
