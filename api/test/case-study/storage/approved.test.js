import { describe, it, expect } from 'vitest';
import { approve, unapprove, listApproved, getApproved } from '../../../src/case-study/storage/approved';
function mockKV() {
    const store = new Map();
    return {
        store,
        async get(key, type) {
            const e = store.get(key);
            if (!e)
                return null;
            return type === 'json' ? JSON.parse(e.value) : e.value;
        },
        async put(key, value) {
            store.set(key, { value });
        },
        async delete(key) {
            store.delete(key);
        },
        async list(opts) {
            const keys = Array.from(store.keys())
                .filter((k) => k.startsWith(opts.prefix))
                .map((name) => ({ name }));
            return { keys, list_complete: true, cursor: '' };
        },
    };
}
const c = {
    key: 'cve-2026-1234',
    type: 'cve',
    title: 'X',
    rationale: 'r',
    score: 0.9,
    evidence: {},
    discoveredAt: '2026-05-14T06:00:00Z',
    status: 'pending',
};
describe('approved storage', () => {
    it('approve writes with status=approved', async () => {
        const ns = mockKV();
        await approve(ns, c);
        const fetched = await getApproved(ns, 'cve-2026-1234');
        expect(fetched?.status).toBe('approved');
    });
    it('listApproved returns all approved candidates', async () => {
        const ns = mockKV();
        await approve(ns, c);
        await approve(ns, { ...c, key: 'actor-fin7', type: 'actor' });
        const list = await listApproved(ns);
        expect(list).toHaveLength(2);
    });
    it('unapprove removes from queue', async () => {
        const ns = mockKV();
        await approve(ns, c);
        await unapprove(ns, 'cve-2026-1234');
        expect(await getApproved(ns, 'cve-2026-1234')).toBeNull();
    });
});
