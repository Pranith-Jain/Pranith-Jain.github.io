import { describe, it, expect } from 'vitest';
import { recordFailure, listFailures, countFailures } from '../../../src/case-study/storage/failed';
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
        async put(key, value, opts) {
            store.set(key, { value, ttl: opts?.expirationTtl });
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
describe('failed storage', () => {
    it('records a failure with 30-day TTL', async () => {
        const ns = mockKV();
        await recordFailure(ns, {
            slotId: 'slot-2026-05-19',
            candidateId: 'cve-2026-1234',
            error: 'AI quota exceeded',
            failedAt: '2026-05-19T15:05:00Z',
            retries: 0,
        });
        expect(ns.store.get('failed:all')?.ttl).toBe(30 * 24 * 3600);
    });
    it('lists failures', async () => {
        const ns = mockKV();
        await recordFailure(ns, { slotId: 'a', candidateId: 'x', error: 'e', failedAt: 't', retries: 0 });
        await recordFailure(ns, { slotId: 'b', candidateId: 'y', error: 'e', failedAt: 't', retries: 0 });
        expect(await listFailures(ns)).toHaveLength(2);
    });
    it('countFailures returns count', async () => {
        const ns = mockKV();
        await recordFailure(ns, { slotId: 'a', candidateId: 'x', error: 'e', failedAt: 't', retries: 0 });
        expect(await countFailures(ns)).toBe(1);
    });
});
