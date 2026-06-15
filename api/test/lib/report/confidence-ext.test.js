import { describe, it, expect } from 'vitest';
import { gradeSources, freshnessDecay } from '../../../src/lib/report/confidence-ext';
describe('gradeSources', () => {
    it('returns a known registry grade and falls back to F for unknown ids', () => {
        const grades = gradeSources(['nvd', 'totally-unknown-source']);
        const nvd = grades.find((g) => g.id === 'nvd');
        const unknown = grades.find((g) => g.id === 'totally-unknown-source');
        expect(nvd).toBeDefined();
        expect(['A', 'B']).toContain(nvd.reliability);
        expect(unknown.reliability).toBe('F');
    });
});
describe('freshnessDecay', () => {
    const now = Date.parse('2026-06-04T00:00:00Z');
    it('is 1.0 for a just-fetched source', () => {
        expect(freshnessDecay('2026-06-04T00:00:00Z', now)).toBeCloseTo(1.0, 5);
    });
    it('halves roughly every 30 days', () => {
        expect(freshnessDecay('2026-05-05T00:00:00Z', now)).toBeCloseTo(0.5, 1);
    });
    it('clamps undefined/invalid timestamps to a low but non-zero floor', () => {
        expect(freshnessDecay(undefined, now)).toBeGreaterThan(0);
        expect(freshnessDecay('not-a-date', now)).toBeGreaterThan(0);
    });
});
