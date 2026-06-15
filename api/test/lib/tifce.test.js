import { describe, it, expect } from 'vitest';
import { originalityPillar, envRelevancePillar, signalNoisePillar, freshnessPillar, letterGrade, buildCrossFeedIndex, scoreAllFeeds, } from '../../src/lib/tifce';
const NOW = Date.parse('2026-06-04T12:00:00.000Z');
function liveIoc(value, source, observed_at) {
    return { value, kind: 'ip', source, observed_at };
}
function feed(id, items, newest) {
    return {
        feedId: id,
        items,
        source: {
            id,
            ok: true,
            count: items.length,
            newest_observation: newest,
        },
    };
}
describe('originalityPillar', () => {
    it('returns 0 for an empty feed', () => {
        const out = originalityPillar(feed('a', []), { counts: new Map(), sources: new Map() });
        expect(out.score).toBe(0);
        expect(out.label).toBe('no contribution');
        expect(out.rationale).toMatch(/did not return/);
    });
    it('rewards a feed whose IOCs are all unique (count=1)', () => {
        const f = feed('a', [liveIoc('1.1.1.1', 'a'), liveIoc('1.1.1.2', 'a'), liveIoc('1.1.1.3', 'a')]);
        const cross = {
            counts: new Map([
                ['1.1.1.1', 1],
                ['1.1.1.2', 1],
                ['1.1.1.3', 1],
            ]),
            sources: new Map(),
        };
        const out = originalityPillar(f, cross);
        expect(out.score).toBe(100);
        expect(out.details.unique).toBe(3);
        expect(out.details.shared).toBe(0);
    });
    it('penalizes a feed whose IOCs are all in 5 other feeds too (count=6)', () => {
        const f = feed('a', [liveIoc('1.1.1.1', 'a'), liveIoc('1.1.1.2', 'a')]);
        const cross = {
            counts: new Map([
                ['1.1.1.1', 6],
                ['1.1.1.2', 6],
            ]),
            sources: new Map(),
        };
        const out = originalityPillar(f, cross);
        // Avg rarity 1/6 + unique share 0 → blended ~ 0.7 * (1/6) = ~11.7
        expect(out.score).toBeLessThan(20);
        expect(out.score).toBeGreaterThan(0);
        expect(out.details.shared).toBe(2);
        expect(out.details.unique).toBe(0);
    });
    it('blends rarity average with unique-share so a feed of mostly duplicates + a few uniques still scores visibly above zero', () => {
        const f = feed('a', [
            liveIoc('1.1.1.1', 'a'),
            liveIoc('1.1.1.2', 'a'),
            liveIoc('1.1.1.3', 'a'),
            liveIoc('1.1.1.4', 'a'),
        ]);
        // 1 unique (1.1.1.1), 3 in 2 feeds each
        const cross = {
            counts: new Map([
                ['1.1.1.1', 1],
                ['1.1.1.2', 2],
                ['1.1.1.3', 2],
                ['1.1.1.4', 2],
            ]),
            sources: new Map(),
        };
        const out = originalityPillar(f, cross);
        // avg rarity = (1 + 0.5*3) / 4 = 0.625, unique share = 0.25
        // blended = 0.625 * 0.7 + 0.25 * 0.3 = 0.4375 + 0.075 = 0.5125 → 51
        expect(out.score).toBeGreaterThan(45);
        expect(out.score).toBeLessThan(60);
    });
    it('clamps to 100 even if a feed reports the same IOC twice with a denominator of 1', () => {
        const f = feed('a', [liveIoc('1.1.1.1', 'a'), liveIoc('1.1.1.1', 'a')]);
        const cross = { counts: new Map([['1.1.1.1', 1]]), sources: new Map() };
        const out = originalityPillar(f, cross);
        expect(out.score).toBe(100);
    });
});
describe('envRelevancePillar', () => {
    const tp = new Set(['1.1.1.1', '1.1.1.2']);
    const det = new Set(['1.1.1.3']);
    const plat = new Set(['1.1.1.4']);
    it('returns 0 for an empty feed', () => {
        const out = envRelevancePillar(feed('a', []), tp, det, plat);
        expect(out.score).toBe(0);
    });
    it('returns 100 when every IOC hits all three signals', () => {
        // Engine signature: envRelevancePillar(feed, tpSet, platformSet, detectionSet)
        const allTp = new Set(['1.1.1.1', '1.1.1.2', '1.1.1.3']);
        const allPlat = new Set(['1.1.1.1', '1.1.1.2', '1.1.1.3']);
        const allDet = new Set(['1.1.1.1', '1.1.1.2', '1.1.1.3']);
        const f = feed('a', [liveIoc('1.1.1.1', 'a'), liveIoc('1.1.1.2', 'a'), liveIoc('1.1.1.3', 'a')]);
        const out = envRelevancePillar(f, allTp, allPlat, allDet);
        // Per-IOC: 0.6 + 0.1 + 0.3 = 1.0 (capped). Sum = 3.0, normalized 3/3 = 1.0 → 100
        expect(out.score).toBe(100);
    });
    it('scales linearly with the share of contributions that hit at least one signal', () => {
        // Engine signature: envRelevancePillar(feed, tpSet, platformSet, detectionSet)
        const f = feed('a', [
            liveIoc('1.1.1.1', 'a'), // TP (0.6)
            liveIoc('1.1.1.3', 'a'), // detection (0.3)
            liveIoc('5.5.5.5', 'a'), // none (0)
            liveIoc('6.6.6.6', 'a'), // none (0)
        ]);
        const out = envRelevancePillar(f, tp, plat, det);
        // 1.1.1.1 in tp (0.6), 1.1.1.3 in det (0.3) → 0.6 + 0.3 + 0 + 0 = 0.9 / 4 = 0.225 → 22.5
        expect(out.score).toBe(22.5);
    });
    it('reports per-signal hit counts in details for the UI debug row', () => {
        // Engine signature: envRelevancePillar(feed, tpSet, platformSet, detectionSet)
        const f = feed('a', [liveIoc('1.1.1.1', 'a'), liveIoc('1.1.1.3', 'a')]);
        const out = envRelevancePillar(f, tp, plat, det);
        expect(out.details.tp_hits).toBe(1);
        expect(out.details.detection_hits).toBe(1);
        expect(out.details.platform_hits).toBe(0);
    });
});
describe('signalNoisePillar', () => {
    it('returns 0 for an empty feed', () => {
        const out = signalNoisePillar(feed('a', []), new Set());
        expect(out.score).toBe(0);
    });
    it("returns 0 when none of the feed's IOCs were ever TP-linked", () => {
        const f = feed('a', [liveIoc('1.1.1.1', 'a'), liveIoc('2.2.2.2', 'a')]);
        const out = signalNoisePillar(f, new Set(['9.9.9.9']));
        expect(out.score).toBe(0);
        expect(out.rationale).toMatch(/None of this feed/);
    });
    it('dampens the score when there are few TP hits to avoid single-IOC flukes', () => {
        // 1 IOC, 1 TP hit — ratio = 1.0 but confidence is low.
        const tp = new Set(['1.1.1.1']);
        const f = feed('a', [liveIoc('1.1.1.1', 'a')]);
        const out = signalNoisePillar(f, tp);
        // log10(1*4+1) = log10(5) ≈ 0.699, log10(101) ≈ 2.004, confidence ≈ 0.349
        // dampened = 1.0 * (0.5 + 0.5 * 0.349) = 0.6745 → 67
        expect(out.score).toBeGreaterThan(60);
        expect(out.score).toBeLessThan(75);
    });
    it('lets a 50/50 feed of 100+ IOCs reach the high-90s', () => {
        const items = [];
        const tp = new Set();
        for (let i = 0; i < 100; i++) {
            const v = `1.1.1.${i}`;
            items.push(liveIoc(v, 'a'));
            if (i < 50)
                tp.add(v);
        }
        const out = signalNoisePillar(feed('a', items), tp);
        // ratio = 0.5, confidence ≈ 1.0 (log10(201) ≈ 2.3, log10(101) ≈ 2.0)
        // dampened ≈ 0.5 * 1.0 = 50
        expect(out.score).toBe(50);
    });
});
describe('freshnessPillar', () => {
    it('returns 0 for an empty feed (nothing to measure)', () => {
        const out = freshnessPillar(feed('a', []), undefined, NOW);
        expect(out.score).toBe(0);
        expect(out.rationale).toMatch(/no recency or velocity/);
    });
    it('returns 100 when newest observation is <24h old', () => {
        const f = feed('a', [liveIoc('1.1.1.1', 'a')], '2026-06-04T00:00:00.000Z');
        const out = freshnessPillar(f, undefined, NOW);
        expect(out.score).toBeGreaterThanOrEqual(50);
        // recency = 100, velocity = 50 (no history), blended = 75
        expect(out.score).toBe(75);
    });
    it('decays smoothly: 5d old newest → 70 recency → blended with 50 velocity = 60', () => {
        const f = feed('a', [liveIoc('1.1.1.1', 'a')], '2026-05-30T12:00:00.000Z');
        const out = freshnessPillar(f, undefined, NOW);
        expect(out.score).toBe(60);
    });
    it('decays to <20 for feeds whose newest observation is months old', () => {
        const f = feed('a', [liveIoc('1.1.1.1', 'a')], '2026-01-01T00:00:00.000Z');
        const out = freshnessPillar(f, undefined, NOW);
        // recency = 5 (>>30d), velocity = 50, blended = 27.5
        expect(out.score).toBeLessThan(30);
    });
    it('uses neutral 50 for bulk-snapshot feeds with no per-entry timestamp', () => {
        const f = feed('a', [liveIoc('1.1.1.1', 'a')], undefined);
        const out = freshnessPillar(f, undefined, NOW);
        // recency = 50, velocity = 50, blended = 50
        expect(out.score).toBe(50);
        expect(out.rationale).toMatch(/bulk-snapshot/);
    });
    it('incorporates velocity: rising history nudges the score above recency alone', () => {
        // 5d-old newest → recency = 70
        const f = feed('a', [liveIoc('1.1.1.1', 'a')], '2026-05-30T12:00:00.000Z');
        const history = [
            { generated_at: '2026-05-29T12:00:00.000Z', contributions: 10 },
            { generated_at: '2026-05-30T12:00:00.000Z', contributions: 30 },
            { generated_at: '2026-05-31T12:00:00.000Z', contributions: 60 },
            { generated_at: '2026-06-01T12:00:00.000Z', contributions: 100 },
            { generated_at: '2026-06-02T12:00:00.000Z', contributions: 150 },
        ];
        const out = freshnessPillar(f, history, NOW);
        // recency 70 + velocity should push it above the no-history 60
        expect(out.score).toBeGreaterThan(60);
    });
    it('incorporates velocity: decaying history nudges the score below recency alone', () => {
        const f = feed('a', [liveIoc('1.1.1.1', 'a')], '2026-05-30T12:00:00.000Z');
        const history = [
            { generated_at: '2026-05-29T12:00:00.000Z', contributions: 200 },
            { generated_at: '2026-05-30T12:00:00.000Z', contributions: 150 },
            { generated_at: '2026-05-31T12:00:00.000Z', contributions: 100 },
            { generated_at: '2026-06-01T12:00:00.000Z', contributions: 60 },
            { generated_at: '2026-06-02T12:00:00.000Z', contributions: 30 },
        ];
        const out = freshnessPillar(f, history, NOW);
        // recency 70 + decaying velocity should push it below the no-history 60
        expect(out.score).toBeLessThan(60);
    });
    it('velocity_per_day is the correct reverse mapping of velocity_component (regression: was *50 instead of -50)', () => {
        // velocityComponent() returns a score in [0, 100] where 50 = 0 IOCs/day
        // (neutral) and 100 = the 50 IOCs/day soft cap. The reverse mapping is
        // `velocityScore - 50` — the previous formula `velocityScore * 50`
        // produced values ~50× too high, which would poison any downstream code
        // that reads the persisted tifce_scores.velocity_per_day column.
        const rising = feed('a', [liveIoc('1.1.1.1', 'a')], '2026-06-03T12:00:00.000Z');
        const risingHistory = [
            { generated_at: '2026-05-29T12:00:00.000Z', contributions: 0 },
            { generated_at: '2026-05-30T12:00:00.000Z', contributions: 25 },
            { generated_at: '2026-05-31T12:00:00.000Z', contributions: 50 },
            { generated_at: '2026-06-01T12:00:00.000Z', contributions: 75 },
            { generated_at: '2026-06-02T12:00:00.000Z', contributions: 100 },
        ];
        const out = freshnessPillar(rising, risingHistory, NOW);
        const vpd = out.details.velocity_per_day;
        // Sanity: a clearly-rising feed must store a SMALL positive per-day value,
        // not a 4-digit number from the *50 bug.
        expect(typeof vpd).toBe('number');
        expect(Math.abs(vpd)).toBeLessThan(50);
    });
});
describe('letterGrade', () => {
    it.each([
        [100, 'A'],
        [80, 'A'],
        [79.9, 'B'],
        [65, 'B'],
        [64.9, 'C'],
        [50, 'C'],
        [49.9, 'D'],
        [35, 'D'],
        [34.9, 'F'],
        [0, 'F'],
    ])('composite %f → grade %s', (score, expected) => {
        expect(letterGrade(score)).toBe(expected);
    });
});
describe('buildCrossFeedIndex', () => {
    it('indexes correlated IOCs by value with their source_count and sources list', () => {
        const correlated = [
            { value: '1.1.1.1', kind: 'ip', source_count: 3, sources: ['a', 'b', 'c'] },
            { value: '2.2.2.2', kind: 'ip', source_count: 2, sources: ['a', 'b'] },
        ];
        const idx = buildCrossFeedIndex(correlated);
        expect(idx.counts.get('1.1.1.1')).toBe(3);
        expect(idx.sources.get('2.2.2.2')).toEqual(['a', 'b']);
    });
});
describe('scoreAllFeeds', () => {
    it('sorts feeds by composite desc and computes the summary block', () => {
        const feedA = feed('a', [liveIoc('1.1.1.1', 'a'), liveIoc('1.1.1.2', 'a')], '2026-06-04T00:00:00.000Z');
        const feedB = feed('b', [liveIoc('9.9.9.9', 'b')], '2025-01-01T00:00:00.000Z');
        const result = scoreAllFeeds({
            feeds: [feedB, feedA], // intentionally out of order
            tpIndicatorSet: new Set(['1.1.1.1']),
            platformReportedSet: new Set(),
            detectionFiredSet: new Set(),
            history: {},
            nowMs: NOW,
        });
        expect(result.feeds[0].feedId).toBe('a');
        expect(result.feeds[0].composite).toBeGreaterThan(result.feeds[1].composite);
        expect(result.summary.total_feeds).toBe(2);
        expect(result.summary.feeds_evaluated).toBe(2);
        expect(result.summary.median_composite).toBeGreaterThan(0);
    });
    it('handles an empty feeds array without throwing', () => {
        const result = scoreAllFeeds({
            feeds: [],
            tpIndicatorSet: new Set(),
            platformReportedSet: new Set(),
            detectionFiredSet: new Set(),
            history: {},
            nowMs: NOW,
        });
        expect(result.feeds).toEqual([]);
        expect(result.summary.feeds_evaluated).toBe(0);
        expect(result.summary.median_composite).toBe(0);
    });
    it('feeds that contributed 0 IOCs get composite=0 and an F grade', () => {
        const empty = feed('z', []);
        const live = feed('a', [liveIoc('1.1.1.1', 'a')], '2026-06-04T00:00:00.000Z');
        const result = scoreAllFeeds({
            feeds: [empty, live],
            tpIndicatorSet: new Set(),
            platformReportedSet: new Set(),
            detectionFiredSet: new Set(),
            history: {},
            nowMs: NOW,
        });
        const emptyRow = result.feeds.find((f) => f.feedId === 'z');
        expect(emptyRow.composite).toBe(0);
        expect(emptyRow.grade).toBe('F');
    });
    it('produces a deterministic composite from the four pillar scores + weights', () => {
        const live = feed('a', [liveIoc('1.1.1.1', 'a')], '2026-06-04T00:00:00.000Z');
        const result = scoreAllFeeds({
            feeds: [live],
            tpIndicatorSet: new Set(['1.1.1.1']),
            platformReportedSet: new Set(['1.1.1.1']),
            detectionFiredSet: new Set(['1.1.1.1']),
            history: {},
            nowMs: NOW,
        });
        const row = result.feeds[0];
        // Composite = 0.3*orig + 0.2*env + 0.25*sig + 0.25*fresh, all in 0-100
        const expected = 0.3 * row.originality.score +
            0.2 * row.envRelevance.score +
            0.25 * row.signalNoise.score +
            0.25 * row.freshness.score;
        expect(row.composite).toBeCloseTo(Math.round(expected * 10) / 10, 1);
    });
});
