import { describe, it, expect } from 'vitest';
import { planSources, packIntoPhases, SOURCE_CATALOG } from '../../../src/lib/report/source-planner';
const d = (id, kind, cost) => ({
    id,
    name: id,
    kind,
    authority: 'C',
    cost,
});
describe('packIntoPhases', () => {
    it('keeps every phase at or under the budget', () => {
        const descs = [d('a', 'live', 20), d('b', 'live', 20), d('c', 'live', 20)];
        const phases = packIntoPhases(descs, 40);
        expect(phases.length).toBe(2);
        for (const phase of phases) {
            expect(phase.reduce((n, s) => n + s.cost, 0)).toBeLessThanOrEqual(40);
        }
        expect(phases
            .flat()
            .map((s) => s.id)
            .sort()).toEqual(['a', 'b', 'c']);
    });
    it('puts all zero-cost (cache) sources in the first phase', () => {
        const descs = [d('c1', 'cache', 0), d('c2', 'cache', 0), d('l1', 'live', 30)];
        const phases = packIntoPhases(descs, 40);
        expect(phases[0].filter((s) => s.kind === 'cache').map((s) => s.id)).toEqual(['c1', 'c2']);
    });
    it('drops a single oversized source into its own phase', () => {
        const phases = packIntoPhases([d('big', 'live', 50)], 40);
        expect(phases.length).toBe(1);
        expect(phases[0][0].id).toBe('big');
    });
});
describe('planSources', () => {
    it('produces a plan whose every phase respects the budget', () => {
        const plan = planSources({ template: 'ransomware-group' }, { maxPhaseSubrequests: 40 });
        expect(plan.template).toBe('ransomware-group');
        expect(plan.phases.length).toBeGreaterThan(0);
        for (const phase of plan.phases) {
            expect(phase.reduce((n, s) => n + s.cost, 0)).toBeLessThanOrEqual(40);
        }
        const planned = plan.phases
            .flat()
            .map((s) => s.id)
            .sort();
        const catalog = SOURCE_CATALOG['ransomware-group'].map((s) => s.id).sort();
        expect(planned).toEqual(catalog);
    });
    it('assigns ascending phase numbers', () => {
        const plan = planSources({ template: 'ioc' }, { maxPhaseSubrequests: 40 });
        plan.phases.forEach((phase, i) => phase.forEach((s) => expect(s.phase).toBe(i)));
    });
});
