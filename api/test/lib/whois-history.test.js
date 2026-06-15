import { describe, it, expect } from 'vitest';
import { getWhoisHistory, getWhoisStats } from '../../src/lib/whois-history';
// Mock D1Database
function createMockDb() {
    const store = new Map();
    let autoId = 1;
    return {
        prepare: (sql) => ({
            bind: (...params) => ({
                first: async () => {
                    if (sql.includes('SELECT') && sql.includes('whois_snapshots')) {
                        return store.get(`snapshot:${params[0]}`) ?? null;
                    }
                    return null;
                },
                all: async () => {
                    const results = [];
                    for (const [key, value] of store.entries()) {
                        if (key.startsWith('snapshot:') || key.startsWith('change:')) {
                            results.push(value);
                        }
                    }
                    return { results };
                },
                run: async () => {
                    const id = autoId++;
                    if (sql.includes('INSERT')) {
                        store.set(`snapshot:${params[0]}:${id}`, { id, ...params });
                    }
                    return { meta: { last_row_id: id, changes: 1 } };
                },
            }),
        }),
    };
}
describe('WHOIS History Service', () => {
    describe('getWhoisHistory', () => {
        it('returns empty history for unknown domain', async () => {
            const db = createMockDb();
            const result = await getWhoisHistory(db, 'unknown-domain.com');
            expect(result.domain).toBe('unknown-domain.com');
            expect(result.snapshots).toEqual([]);
            expect(result.changes).toEqual([]);
        });
    });
    describe('getWhoisStats', () => {
        it('returns zero stats for unknown domain', async () => {
            const db = createMockDb();
            const stats = await getWhoisStats(db, 'unknown-domain.com');
            expect(stats.total_snapshots).toBe(0);
            expect(stats.total_changes).toBe(0);
            expect(stats.unique_registrars).toBe(0);
        });
    });
});
