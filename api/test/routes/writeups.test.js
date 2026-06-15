import { describe, it, expect } from 'vitest';
import { roundRobinBySource, cmpByPublished } from '../../src/routes/writeups';
function makeItem(source, id, published) {
    return { source, id, ...(published ? { published } : {}) };
}
describe('cmpByPublished', () => {
    it('sorts newest first', () => {
        const a = { published: '2026-05-12T00:00:00Z' };
        const b = { published: '2026-05-01T00:00:00Z' };
        expect(cmpByPublished(a, b)).toBeLessThan(0);
        expect(cmpByPublished(b, a)).toBeGreaterThan(0);
    });
    it('sorts undated items to the tail', () => {
        const dated = { published: '2026-05-12T00:00:00Z' };
        const undated = {};
        expect(cmpByPublished(dated, undated)).toBeLessThan(0);
        expect(cmpByPublished(undated, dated)).toBeGreaterThan(0);
    });
    it('treats two undated items as equal', () => {
        expect(cmpByPublished({}, {})).toBe(0);
    });
});
describe('roundRobinBySource', () => {
    it('returns items in newest-first order when only one source exists', () => {
        const items = [
            makeItem('A', 'a1', '2026-05-01T00:00:00Z'),
            makeItem('A', 'a2', '2026-05-10T00:00:00Z'),
            makeItem('A', 'a3', '2026-05-05T00:00:00Z'),
        ];
        const out = roundRobinBySource(items, 10);
        expect(out.map((i) => i.id)).toEqual(['a2', 'a3', 'a1']);
    });
    it('interleaves sources fairly when one feed dominates volume', () => {
        // Source A has 6 items (chatty), Source B has 2 (slow).
        // With pure newest-first + cap 4 we would only see A's 4 newest.
        // Round-robin should give both sources representation.
        const items = [
            makeItem('A', 'a1', '2026-05-10T00:00:00Z'),
            makeItem('A', 'a2', '2026-05-09T00:00:00Z'),
            makeItem('A', 'a3', '2026-05-08T00:00:00Z'),
            makeItem('A', 'a4', '2026-05-07T00:00:00Z'),
            makeItem('A', 'a5', '2026-05-06T00:00:00Z'),
            makeItem('A', 'a6', '2026-05-05T00:00:00Z'),
            makeItem('B', 'b1', '2026-05-04T00:00:00Z'),
            makeItem('B', 'b2', '2026-05-03T00:00:00Z'),
        ];
        const out = roundRobinBySource(items, 4);
        const sources = out.map((i) => i.source);
        // Both sources must appear within the first 4 items.
        expect(sources).toContain('A');
        expect(sources).toContain('B');
        // No source should claim more than 2 of the 4 slots.
        const aCount = sources.filter((s) => s === 'A').length;
        const bCount = sources.filter((s) => s === 'B').length;
        expect(aCount).toBeLessThanOrEqual(2);
        expect(bCount).toBeLessThanOrEqual(2);
    });
    it('does not leave a slow source off the visible list entirely', () => {
        // Reproduces the production bug: 18 chatty + 2 slow sources, cap 36.
        // Without round-robin, the slow sources get squeezed out.
        const items = [];
        // 18 chatty sources × 5 items each, all newer than the slow sources.
        for (let s = 1; s <= 18; s++) {
            for (let i = 1; i <= 5; i++) {
                const date = `2026-05-${String(20 - i).padStart(2, '0')}T00:00:00Z`;
                items.push(makeItem(`fast-${s}`, `f${s}-${i}`, date));
            }
        }
        // 2 slow sources with 2 items each, all dated earlier.
        items.push(makeItem('slow-1', 's1-1', '2026-04-01T00:00:00Z'));
        items.push(makeItem('slow-1', 's1-2', '2026-03-01T00:00:00Z'));
        items.push(makeItem('slow-2', 's2-1', '2026-04-15T00:00:00Z'));
        items.push(makeItem('slow-2', 's2-2', '2026-03-15T00:00:00Z'));
        const out = roundRobinBySource(items, 36);
        const sources = new Set(out.map((i) => i.source));
        // Both slow sources MUST appear in the visible list.
        expect(sources.has('slow-1')).toBe(true);
        expect(sources.has('slow-2')).toBe(true);
    });
    it('caps the output at maxItems', () => {
        const items = Array.from({ length: 100 }, (_, i) => makeItem(`src-${i % 10}`, `i${i}`, `2026-05-12T00:00:${String(i).padStart(2, '0')}Z`));
        expect(roundRobinBySource(items, 25)).toHaveLength(25);
        expect(roundRobinBySource(items, 10)).toHaveLength(10);
        expect(roundRobinBySource(items, 0)).toHaveLength(0);
    });
    it('returns all items when input is smaller than maxItems', () => {
        const items = [makeItem('A', 'a1', '2026-05-01T00:00:00Z'), makeItem('B', 'b1', '2026-05-02T00:00:00Z')];
        const out = roundRobinBySource(items, 100);
        expect(out).toHaveLength(2);
    });
    it('handles undated items in a source bucket', () => {
        const items = [
            makeItem('A', 'a1', '2026-05-10T00:00:00Z'),
            makeItem('A', 'a-undated'), // no published date
            makeItem('B', 'b1', '2026-05-05T00:00:00Z'),
        ];
        const out = roundRobinBySource(items, 10);
        expect(out).toHaveLength(3);
        // The undated A item should still appear (just at the tail of its bucket).
        expect(out.find((i) => i.id === 'a-undated')).toBeDefined();
    });
    it('preserves chronological feel — newer heads pulled first', () => {
        const items = [
            makeItem('A', 'a-newer', '2026-05-12T00:00:00Z'),
            makeItem('B', 'b-older', '2026-04-01T00:00:00Z'),
            makeItem('A', 'a-mid', '2026-05-01T00:00:00Z'),
            makeItem('B', 'b-mid', '2026-04-15T00:00:00Z'),
        ];
        const out = roundRobinBySource(items, 4);
        // First slot should be A's newest (May 12) because A's head outdates B's head.
        expect(out[0]?.id).toBe('a-newer');
        // Second slot is the other source's head.
        expect(out[1]?.source).toBe('B');
    });
});
