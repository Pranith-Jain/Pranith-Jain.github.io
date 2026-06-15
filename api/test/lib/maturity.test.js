import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { maturityHandler } from '../../src/lib/maturity';
function makeD1(rows = { daily: 30, weekly: 4, landscape: 1 }) {
    return {
        prepare: vi.fn().mockReturnValue({
            bind: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue(rows),
            }),
        }),
    };
}
function makeApp() {
    const app = new Hono();
    app.get('/api/v1/maturity', maturityHandler);
    return app;
}
async function getMaturity(app, db) {
    return app.request('/api/v1/maturity', undefined, { BRIEFINGS_DB: db });
}
describe('maturity handler — happy path', () => {
    it('returns a 5-domain report with the right framework label', async () => {
        const app = makeApp();
        const res = await getMaturity(app, makeD1());
        expect(res.status).toBe(200);
        const body = (await res.json());
        expect(body.framework).toBe('CTI-CMM (zsazsa-inspired)');
        expect(body.domains.map((d) => d.id)).toEqual(['program', 'situation', 'analytical', 'operational', 'feedback']);
    });
    it('sets Cache-Control: public, max-age=3600 (1h snapshot)', async () => {
        const app = makeApp();
        const res = await getMaturity(app, makeD1());
        expect(res.headers.get('cache-control')).toBe('public, max-age=3600');
    });
    it('every domain has score in [0, 5] and a band from the 6-level vocabulary', async () => {
        const app = makeApp();
        const res = await getMaturity(app, makeD1());
        const body = (await res.json());
        const BANDS = new Set(['absent', 'initial', 'repeatable', 'defined', 'managed', 'optimizing']);
        for (const d of body.domains) {
            expect(d.score).toBeGreaterThanOrEqual(0);
            expect(d.score).toBeLessThanOrEqual(5);
            expect(d.max_score).toBe(5);
            expect(BANDS).toContain(d.band);
            expect(d.signals.length).toBeGreaterThan(0);
        }
    });
    it('overall is the ceil of the domain average (rounds up)', async () => {
        const app = makeApp();
        const res = await getMaturity(app, makeD1());
        const body = (await res.json());
        const avg = body.domains.reduce((a, d) => a + d.score, 0) / body.domains.length;
        const expectedOverall = Math.ceil(avg * 10) / 10;
        expect(Math.abs(body.overall - expectedOverall)).toBeLessThanOrEqual(0.1);
    });
});
describe('maturity handler — situation domain dynamics', () => {
    it('situation score is 0 when the briefings table is empty', async () => {
        const app = makeApp();
        const res = await getMaturity(app, makeD1({ daily: 0, weekly: 0, landscape: 0 }));
        const body = (await res.json());
        expect(body.domains.find((d) => d.id === 'situation')?.score).toBe(0);
    });
    it('situation score is 1 when only daily briefings exist', async () => {
        const app = makeApp();
        const res = await getMaturity(app, makeD1({ daily: 5, weekly: 0, landscape: 0 }));
        const body = (await res.json());
        expect(body.domains.find((d) => d.id === 'situation')?.score).toBe(1);
    });
    it('situation score is 2 when daily + weekly both exist', async () => {
        const app = makeApp();
        const res = await getMaturity(app, makeD1({ daily: 5, weekly: 2, landscape: 0 }));
        const body = (await res.json());
        expect(body.domains.find((d) => d.id === 'situation')?.score).toBe(2);
    });
    it('situation score is 3 when all three cadences exist', async () => {
        const app = makeApp();
        const res = await getMaturity(app, makeD1({ daily: 5, weekly: 2, landscape: 1 }));
        const body = (await res.json());
        expect(body.domains.find((d) => d.id === 'situation')?.score).toBe(3);
    });
    it('situation score caps at 3 even when row counts explode (the +2 tiers are reserved)', async () => {
        const app = makeApp();
        const res = await getMaturity(app, makeD1({ daily: 999, weekly: 999, landscape: 999 }));
        const body = (await res.json());
        expect(body.domains.find((d) => d.id === 'situation')?.score).toBeLessThanOrEqual(3);
    });
    it('situation handles null aggregate row (first() returned undefined)', async () => {
        const db = {
            prepare: vi.fn().mockReturnValue({
                bind: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue(null) }),
            }),
        };
        const app = makeApp();
        const res = await getMaturity(app, db);
        const body = (await res.json());
        const situation = body.domains.find((d) => d.id === 'situation');
        expect(situation?.score).toBe(0);
        expect(situation?.rationale).toContain('0 daily, 0 weekly, 0 landscape');
    });
});
describe('maturity handler — band vocabulary', () => {
    it('a 5-domain report in the live system has at least 2 domains at "defined" or higher', async () => {
        // Sanity: with the wired-up source registry and an active briefing
        // schedule, the live system should be past the initial tiers. The
        // exact score depends on data, but the program/analytical/operational
        // domains are static-capability signals that don't move at runtime.
        const app = makeApp();
        const res = await getMaturity(app, makeD1());
        const body = (await res.json());
        const definedOrBetter = body.domains.filter((d) => ['defined', 'managed', 'optimizing'].includes(d.band));
        expect(definedOrBetter.length).toBeGreaterThanOrEqual(2);
    });
});
