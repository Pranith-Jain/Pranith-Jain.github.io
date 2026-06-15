import { describe, it, expect } from 'vitest';
import { buildStatusSnapshot, computeStatusDeltas, } from '../../src/lib/breach-forum-status';
function snap(observedAt, rows) {
    return { observed_at: observedAt, rows };
}
describe('buildStatusSnapshot', () => {
    it('normalises names to lowercase and dedupes curated over ddc', () => {
        const ddc = {
            entries: [
                {
                    name: 'BreachForums',
                    url: 'http://breachforums.example',
                    onion: false,
                    status: 'online',
                    category: 'Criminal Forums',
                    source_file: 'x.md',
                },
                {
                    name: 'Other',
                    url: 'http://other.example',
                    onion: false,
                    status: 'online',
                    category: 'Criminal Forums',
                    source_file: 'x.md',
                },
            ],
        };
        const curated = [
            {
                name: 'BreachForums',
                status: 'volatile',
                category: 'Notable breach/leak forum',
                url: 'https://darkwebinformer.com/?s=BreachForums',
                note: 'n/a',
            },
            {
                name: 'Fresh',
                status: 'active',
                category: 'Notable breach/leak forum',
                url: 'https://darkwebinformer.com/?s=Fresh',
                note: 'n/a',
            },
        ];
        const out = buildStatusSnapshot(ddc, curated, '2026-06-04T00:00:00Z');
        expect(out.observed_at).toBe('2026-06-04T00:00:00Z');
        const byName = new Map(out.rows.map((r) => [r.name, r]));
        expect(byName.get('breachforums')?.source).toBe('curated');
        expect(byName.get('breachforums')?.status).toBe('volatile');
        expect(byName.get('other')?.source).toBe('ddc');
        expect(byName.get('fresh')?.source).toBe('curated');
        // 3 unique names after dedup (curated wins, ddc row dropped).
        expect(out.rows.length).toBe(3);
    });
    it('infers onion flag from curated url', () => {
        const ddc = { entries: [] };
        const curated = [
            {
                name: 'Dread',
                status: 'active',
                category: 'Notable breach/leak forum',
                url: 'http://dreadytofatroptsdj6io7l3xptbet6onoyno2yv7jicoxknyazubrad.onion',
                note: 'n/a',
            },
            {
                name: 'Exposed',
                status: 'active',
                category: 'Notable breach/leak forum',
                url: 'https://darkwebinformer.com/?s=Exposed',
                note: 'n/a',
            },
        ];
        const out = buildStatusSnapshot(ddc, curated, '2026-06-04T00:00:00Z');
        const dread = out.rows.find((r) => r.name === 'dread');
        const exposed = out.rows.find((r) => r.name === 'exposed');
        expect(dread?.onion).toBe(true);
        expect(exposed?.onion).toBe(false);
    });
});
describe('computeStatusDeltas', () => {
    it('emits a delta when a status changes', () => {
        const prev = snap('2026-06-04T00:00:00Z', [
            { name: 'breachforums', source: 'curated', status: 'volatile', onion: false },
        ]);
        const curr = snap('2026-06-04T01:00:00Z', [
            { name: 'breachforums', source: 'curated', status: 'seized', onion: false },
        ]);
        const deltas = computeStatusDeltas(prev, curr);
        expect(deltas.length).toBe(1);
        expect(deltas[0]).toMatchObject({
            name: 'breachforums',
            from: 'volatile',
            to: 'seized',
            observed_at: '2026-06-04T01:00:00Z',
            previous_observed_at: '2026-06-04T00:00:00Z',
        });
    });
    it('emits no delta when status is unchanged', () => {
        const prev = snap('2026-06-04T00:00:00Z', [{ name: 'xss', source: 'curated', status: 'active', onion: false }]);
        const curr = snap('2026-06-04T01:00:00Z', [{ name: 'xss', source: 'curated', status: 'active', onion: false }]);
        expect(computeStatusDeltas(prev, curr)).toEqual([]);
    });
    it('emits a first-observation delta (from=unknown) for new forums', () => {
        const prev = snap('2026-06-04T00:00:00Z', []);
        const curr = snap('2026-06-04T01:00:00Z', [
            { name: 'newforum', source: 'curated', status: 'active', onion: false },
        ]);
        const deltas = computeStatusDeltas(prev, curr);
        expect(deltas.length).toBe(1);
        expect(deltas[0]).toMatchObject({ name: 'newforum', from: 'unknown', to: 'active' });
    });
    it('emits a removal delta (to=unknown) for forums that disappeared', () => {
        const prev = snap('2026-06-04T00:00:00Z', [{ name: 'gone', source: 'ddc', status: 'online', onion: true }]);
        const curr = snap('2026-06-04T01:00:00Z', []);
        const deltas = computeStatusDeltas(prev, curr);
        expect(deltas.length).toBe(1);
        expect(deltas[0]).toMatchObject({
            name: 'gone',
            from: 'online',
            to: 'unknown',
            previous_observed_at: '2026-06-04T00:00:00Z',
        });
    });
    it('sorts deltas alphabetically for stable UI ordering', () => {
        const prev = snap('2026-06-04T00:00:00Z', []);
        const curr = snap('2026-06-04T01:00:00Z', [
            { name: 'zebra', source: 'ddc', status: 'online', onion: false },
            { name: 'apple', source: 'ddc', status: 'online', onion: false },
            { name: 'mango', source: 'ddc', status: 'online', onion: false },
        ]);
        const deltas = computeStatusDeltas(prev, curr);
        expect(deltas.map((d) => d.name)).toEqual(['apple', 'mango', 'zebra']);
    });
    it('handles a complex multi-forum diff with mixed transitions', () => {
        const prev = snap('2026-06-04T00:00:00Z', [
            { name: 'a', source: 'curated', status: 'active', onion: false },
            { name: 'b', source: 'curated', status: 'active', onion: false },
            { name: 'c', source: 'curated', status: 'active', onion: false },
        ]);
        const curr = snap('2026-06-04T01:00:00Z', [
            // a unchanged
            { name: 'a', source: 'curated', status: 'active', onion: false },
            // b changed
            { name: 'b', source: 'curated', status: 'seized', onion: false },
            // c removed
            // d added
            { name: 'd', source: 'curated', status: 'active', onion: false },
        ]);
        const deltas = computeStatusDeltas(prev, curr);
        expect(deltas.map((d) => `${d.name}:${d.from}->${d.to}`).sort()).toEqual([
            'b:active->seized',
            'c:active->unknown',
            'd:unknown->active',
        ]);
    });
});
