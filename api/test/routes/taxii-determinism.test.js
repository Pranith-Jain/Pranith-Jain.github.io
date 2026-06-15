import { describe, it, expect } from 'vitest';
import { getIocObjects, getVulnerabilityObjects, getBriefingObjects } from '../../src/routes/taxii';
/**
 * Deterministic STIX object IDs (UUIDv5).
 *
 * The collection builders used to mint object IDs with `crypto.randomUUID()`,
 * so the SAME underlying IOC/CVE got a different `id` on every fetch (no dedup),
 * and the vulnerability builder used `vulnerability--<CVE-id>` which is an
 * INVALID STIX id (the part after `--` must be a UUID). These tests pin the new
 * contract: ids are derived via `stixId()` (UUIDv5) keyed on each object's
 * identifying value, so they are stable across fetches and structurally valid.
 */
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
// Mock D1: builders call `db.prepare(sql).bind(...args).all()` → `{ results }`.
function mockDb(rows) {
    return {
        prepare: () => ({
            bind: () => ({
                all: async () => ({ results: rows }),
            }),
        }),
    };
}
describe('taxii deterministic STIX object ids', () => {
    it('getIocObjects: same rows → identical, valid indicator--<uuid> ids', async () => {
        const rows = [
            {
                indicator: '8.8.8.8',
                indicator_type: 'ipv4',
                first_seen: '2026-01-01T00:00:00Z',
                last_seen: '2026-01-02T00:00:00Z',
                peak_score: 80,
                tags: '["c2","malicious"]',
            },
            {
                indicator: 'evil.example.com',
                indicator_type: 'domain',
                first_seen: '2026-01-01T00:00:00Z',
                last_seen: '2026-01-02T00:00:00Z',
                peak_score: 50,
                tags: '[]',
            },
        ];
        const a = await getIocObjects(mockDb(rows), 100);
        const b = await getIocObjects(mockDb(rows), 100);
        const idRe = new RegExp(`^indicator--${UUID}$`);
        expect(a).toHaveLength(2);
        for (const obj of a) {
            expect(obj.id).toMatch(idRe);
        }
        // Deterministic: identical across two independent fetches.
        expect(a.map((o) => o.id)).toEqual(b.map((o) => o.id));
        // Distinct indicators → distinct ids.
        expect(a[0].id).not.toEqual(a[1].id);
        // Keyed on indicator + type (case-insensitive value): UPPER == lower.
        const upper = await getIocObjects(mockDb([{ ...rows[1], indicator: 'EVIL.EXAMPLE.COM' }]), 100);
        expect(upper[0].id).toEqual(a[1].id);
        // Every other field preserved.
        expect(a[0].type).toBe('indicator');
        expect(a[0].name).toBe('8.8.8.8');
        expect(a[0].pattern).toBe("[ipv4-addr:value = '8.8.8.8']");
    });
    it('getVulnerabilityObjects (db rows): identical, valid vulnerability--<uuid> ids', async () => {
        const rows = [
            {
                id: 'n1',
                value: 'cve-2024-3094',
                properties: '{}',
                confidence: 90,
                sources: '[]',
                last_seen: '2026-01-02T00:00:00Z',
            },
        ];
        const a = await getVulnerabilityObjects(mockDb(rows), 100);
        const b = await getVulnerabilityObjects(mockDb(rows), 100);
        const idRe = new RegExp(`^vulnerability--${UUID}$`);
        expect(a[0].id).toMatch(idRe);
        expect(a[0].id).toEqual(b[0].id);
        // Was previously the INVALID `vulnerability--cve-2024-3094` form.
        expect(a[0].id).not.toBe('vulnerability--cve-2024-3094');
        expect(a[0].name).toBe('CVE-2024-3094');
    });
    it('getVulnerabilityObjects (hardcoded fallback): valid, stable vulnerability--<uuid> id', async () => {
        const a = await getVulnerabilityObjects(mockDb([]), 100);
        const b = await getVulnerabilityObjects(mockDb([]), 100);
        const idRe = new RegExp(`^vulnerability--${UUID}$`);
        expect(a).toHaveLength(1);
        expect(a[0].id).toMatch(idRe);
        expect(a[0].id).toEqual(b[0].id);
        expect(a[0].name).toBe('CVE-2024-3094');
    });
    it('getBriefingObjects: report SDOs carry a non-empty object_refs (STIX 2.1 valid)', async () => {
        const rows = [
            { slug: 'daily-2026-01-01', title: 'Daily Briefing', type: 'daily', published_at: '2026-01-01T00:00:00Z' },
            { slug: 'weekly-2026-w01', title: 'Weekly Briefing', type: 'weekly', published_at: '2026-01-02T00:00:00Z' },
        ];
        const objs = await getBriefingObjects(mockDb(rows), 100);
        const producer = objs.find((o) => o.type === 'identity');
        const reports = objs.filter((o) => o.type === 'report');
        expect(producer).toBeDefined();
        expect(reports).toHaveLength(2);
        for (const r of reports) {
            const refs = r.object_refs;
            // Required by STIX 2.1 AND must be non-empty (STIX lists MUST NOT be empty).
            expect(Array.isArray(refs)).toBe(true);
            expect(refs.length).toBeGreaterThan(0);
            expect(refs[0]).toBe(producer.id);
            expect(r.created_by_ref).toBe(producer.id);
            expect(r.id).toMatch(new RegExp(`^report--${UUID}$`));
        }
        // Deterministic across fetches.
        const objs2 = await getBriefingObjects(mockDb(rows), 100);
        expect(objs.map((o) => o.id)).toEqual(objs2.map((o) => o.id));
        // Empty briefings table → no objects (no orphan producer).
        expect(await getBriefingObjects(mockDb([]), 100)).toEqual([]);
    });
});
