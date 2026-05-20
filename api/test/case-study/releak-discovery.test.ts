import { describe, it, expect } from 'vitest';
import { discoverReleaks, type ReleakRow } from '../../src/case-study/discovery/releak';

function row(o: Partial<ReleakRow> & Pick<ReleakRow, 'key' | 'group_count' | 'latest'>): ReleakRow {
  return {
    raw_names: [o.key],
    claims: [],
    ...o,
  };
}

describe('discoverReleaks', () => {
  const now = new Date('2026-05-20T00:00:00Z');

  it('filters out rows below the 2-group threshold', async () => {
    const rows: ReleakRow[] = [
      row({ key: 'acme', group_count: 1, latest: '2026-05-15T00:00:00Z', raw_names: ['acme corp'] }),
      row({ key: 'beta', group_count: 2, latest: '2026-05-15T00:00:00Z', raw_names: ['beta inc'] }),
    ];
    const out = await discoverReleaks({
      fetchReleaks: async () => rows,
      now,
      getDedup: async () => null,
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.evidence).toMatchObject({ subtype: 'releak', victim: 'beta inc', group_count: 2 });
  });

  it('drops rows whose latest claim is outside the 60-day window', async () => {
    const rows: ReleakRow[] = [
      row({ key: 'stale', group_count: 3, latest: '2025-01-01T00:00:00Z', raw_names: ['stale ltd'] }),
      row({ key: 'fresh', group_count: 2, latest: '2026-05-19T00:00:00Z', raw_names: ['fresh ltd'] }),
    ];
    const out = await discoverReleaks({ fetchReleaks: async () => rows, now, getDedup: async () => null });
    expect(out.map((c) => c.evidence.victim)).toEqual(['fresh ltd']);
  });

  it('uses `releak-<victim-key>` for the dedup key', async () => {
    const rows: ReleakRow[] = [row({ key: 'acme', group_count: 2, latest: '2026-05-15T00:00:00Z' })];
    const out = await discoverReleaks({ fetchReleaks: async () => rows, now, getDedup: async () => null });
    expect(out[0]!.key).toBe('releak-acme');
  });

  it('returns at most MAX_CANDIDATES (4) sorted by score', async () => {
    const rows: ReleakRow[] = Array.from({ length: 12 }, (_, i) =>
      row({
        key: `v${i}`,
        group_count: 2 + (i % 3), // varying group counts → varying severity
        latest: `2026-05-${(15 + (i % 5)).toString().padStart(2, '0')}T00:00:00Z`,
        raw_names: [`victim ${i}`],
      })
    );
    const out = await discoverReleaks({ fetchReleaks: async () => rows, now, getDedup: async () => null });
    expect(out.length).toBeLessThanOrEqual(4);
    for (let i = 1; i < out.length; i += 1) expect(out[i - 1]!.score).toBeGreaterThanOrEqual(out[i]!.score);
  });

  it('returns empty when fetchReleaks throws', async () => {
    const out = await discoverReleaks({
      fetchReleaks: async () => {
        throw new Error('upstream down');
      },
      now,
      getDedup: async () => null,
    });
    expect(out).toEqual([]);
  });

  it('subtype:releak is set on every candidate so the prompt can lean into the narrative', async () => {
    const rows: ReleakRow[] = [row({ key: 'x', group_count: 2, latest: '2026-05-19T00:00:00Z', raw_names: ['x inc'] })];
    const out = await discoverReleaks({ fetchReleaks: async () => rows, now, getDedup: async () => null });
    expect((out[0]!.evidence as { subtype?: string }).subtype).toBe('releak');
  });
});
