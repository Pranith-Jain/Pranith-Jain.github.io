import { describe, it, expect } from 'vitest';
import { aggregateWeeklyFromDailies, mergeWeeklyWithDailies, weeklyUndercountsDailies, } from '../../src/lib/briefing-builder';
// ---- fixtures -----------------------------------------------------------
function cve(id, severity, cvss, source = 'NVD') {
    return {
        id,
        title: `${id}: example`,
        description: 'example',
        severity,
        ...(cvss != null ? { cvss } : {}),
        source,
        mitre_techniques: [],
    };
}
function rw(id) {
    return { id, title: id, description: id, severity: 'high', source: 'ransomware.live', mitre_techniques: [] };
}
function emptyBuckets() {
    return { urls: [], domains: [], ipv4s: [], hashes: [] };
}
/** Build a stored daily Briefing body with the given CVE + ransomware findings and IOC count. */
function dailyBody(date, cves, rwFindings, iocs, sources) {
    const sections = [
        { id: 'critical-other', title: 'CVEs', count: cves.length, blurb: '', findings: cves },
        ...(rwFindings.length
            ? [
                {
                    id: 'ransomware-activity',
                    title: 'Ransomware activity',
                    count: rwFindings.length,
                    blurb: '',
                    findings: rwFindings,
                },
            ]
            : []),
    ];
    return {
        slug: `daily-${date}`,
        type: 'daily',
        title: `Daily ${date}`,
        date,
        date_range: date,
        range_start: date,
        range_end: date,
        generated_at: '2026-05-30T00:00:00.000Z',
        executive_summary: '',
        stats: {
            findings: cves.length + rwFindings.length,
            sections: sections.length,
            cves: cves.length,
            kevs: cves.filter((f) => f.source === 'CISA KEV').length,
            iocs,
            critical: cves.filter((f) => f.severity === 'critical').length,
            high: cves.filter((f) => f.severity === 'high').length,
            medium: cves.filter((f) => f.severity === 'medium').length,
            low: cves.filter((f) => f.severity === 'low').length,
            ransomware_victims: rwFindings.length,
        },
        sections,
        iocs: emptyBuckets(),
        mitre_techniques: [],
        sources,
    };
}
/**
 * In-memory D1 stub supporting the two query shapes the rollup helpers use:
 *  - daily range:  ... WHERE type = ? AND date >= ? AND date <= ?  → .all()
 *  - single slug:  ... WHERE slug = ?                              → .first()
 */
function fakeDb(rows) {
    const db = {
        prepare(sql) {
            return {
                _sql: sql,
                _args: [],
                bind(...args) {
                    this._args = args;
                    return this;
                },
                async first() {
                    const slug = this._args[0];
                    const r = rows.find((x) => x.slug === slug);
                    return r ?? null;
                },
                async all() {
                    const [type, start, end] = this._args;
                    const results = rows
                        .filter((r) => r.type === type && r.date >= start && r.date <= end)
                        .sort((a, b) => a.date.localeCompare(b.date));
                    return { results: results };
                },
            };
        },
    };
    return db;
}
function dailyRow(b) {
    return { slug: b.slug, type: b.type, date: b.date, stats_json: JSON.stringify(b.stats), body: JSON.stringify(b) };
}
// ---- mergeWeeklyWithDailies (pure) --------------------------------------
describe('mergeWeeklyWithDailies', () => {
    const baseLive = {
        findings: [],
        ransomwareFindings: [],
        iocsRawTotal: 0,
        iocBuckets: emptyBuckets(),
        sources: [],
    };
    it('returns live unchanged when the rollup has no dailies', () => {
        const live = { ...baseLive, findings: [cve('CVE-2026-1', 'high', 7.5)], iocsRawTotal: 10 };
        const merged = mergeWeeklyWithDailies(live, {
            findings: [],
            ransomwareFindings: [],
            iocsTotal: 0,
            iocBuckets: emptyBuckets(),
            sources: [],
            dailyCount: 0,
        });
        expect(merged.findings).toEqual(live.findings);
        expect(merged.iocsRawTotal).toBe(10);
    });
    it('unions CVE findings by id, preferring the copy that carries a CVSS', () => {
        const live = { ...baseLive, findings: [cve('CVE-2026-1', 'unknown', undefined, 'CISA KEV')] };
        const merged = mergeWeeklyWithDailies(live, {
            findings: [cve('cve-2026-1', 'critical', 9.8), cve('CVE-2026-2', 'high', 7.2)],
            ransomwareFindings: [],
            iocsTotal: 100,
            iocBuckets: emptyBuckets(),
            sources: [],
            dailyCount: 3,
        });
        expect(merged.findings).toHaveLength(2);
        const one = merged.findings.find((f) => f.id.toUpperCase() === 'CVE-2026-1');
        expect(one.cvss).toBe(9.8); // the daily copy with a real CVSS won
        expect(one.severity).toBe('critical');
    });
    it('takes the larger IOC volume (sum of daily uniques beats a stale live window)', () => {
        const live = { ...baseLive, iocsRawTotal: 0 };
        const merged = mergeWeeklyWithDailies(live, {
            findings: [],
            ransomwareFindings: [],
            iocsTotal: 8726,
            iocBuckets: emptyBuckets(),
            sources: [],
            dailyCount: 7,
        });
        expect(merged.iocsRawTotal).toBe(8726);
    });
    it('dedupes ransomware findings by id and unions sources', () => {
        const live = { ...baseLive, ransomwareFindings: [rw('rw-a')], sources: ['CISA KEV'] };
        const merged = mergeWeeklyWithDailies(live, {
            findings: [],
            ransomwareFindings: [rw('rw-a'), rw('rw-b')],
            iocsTotal: 5,
            iocBuckets: emptyBuckets(),
            sources: ['URLhaus', 'CISA KEV'],
            dailyCount: 2,
        });
        expect(merged.ransomwareFindings.map((f) => f.id).sort()).toEqual(['rw-a', 'rw-b']);
        expect(merged.sources).toContain('URLhaus');
        expect(merged.sources.filter((s) => s === 'CISA KEV')).toHaveLength(1);
    });
});
// ---- aggregateWeeklyFromDailies (db-reading) ----------------------------
describe('aggregateWeeklyFromDailies', () => {
    it('unions CVEs across the week, sums IOC counts, and separates ransomware', async () => {
        const d25 = dailyBody('2026-05-25', [cve('CVE-2026-1', 'high', 7.5), cve('CVE-2026-2', 'critical', 9.1)], [rw('rw-x-2026-05-25')], 1000, ['NVD', 'URLhaus']);
        const d26 = dailyBody('2026-05-26', [cve('CVE-2026-1', 'high', 7.5), cve('CVE-2026-3', 'high', 8.0)], [rw('rw-y-2026-05-26')], 1200, ['NVD', 'ThreatFox']);
        const db = fakeDb([dailyRow(d25), dailyRow(d26)]);
        const rollup = await aggregateWeeklyFromDailies(db, '2026-05-25', '2026-05-31');
        expect(rollup.dailyCount).toBe(2);
        // CVE-2026-1 appears both days → counted once. Total unique CVEs = 3.
        expect(rollup.findings.map((f) => f.id.toUpperCase()).sort()).toEqual(['CVE-2026-1', 'CVE-2026-2', 'CVE-2026-3']);
        expect(rollup.iocsTotal).toBe(2200); // 1000 + 1200
        expect(rollup.ransomwareFindings.map((f) => f.id).sort()).toEqual(['rw-x-2026-05-25', 'rw-y-2026-05-26']);
        expect(rollup.sources.sort()).toEqual(['NVD', 'ThreatFox', 'URLhaus']);
    });
    it('returns an empty rollup (dailyCount 0) when no dailies exist in the window', async () => {
        const db = fakeDb([]);
        const rollup = await aggregateWeeklyFromDailies(db, '2026-05-25', '2026-05-31');
        expect(rollup.dailyCount).toBe(0);
        expect(rollup.findings).toHaveLength(0);
        expect(rollup.iocsTotal).toBe(0);
    });
});
// ---- weeklyUndercountsDailies (predicate) -------------------------------
describe('weeklyUndercountsDailies', () => {
    const dailies = [
        dailyRow(dailyBody('2026-05-25', [cve('CVE-1', 'high', 7), cve('CVE-2', 'high', 7)], [], 1000, [])),
        dailyRow(dailyBody('2026-05-26', [cve('CVE-3', 'high', 7), cve('CVE-4', 'high', 7)], [], 1200, [])),
    ];
    it('fires when the stored weekly is far sparser than its dailies (the W22 bug)', async () => {
        const weekly = {
            slug: 'weekly-2026-W22',
            type: 'weekly',
            date: '2026-05-25',
            stats_json: JSON.stringify({ findings: 1, iocs: 0 }),
            body: '{}',
        };
        const db = fakeDb([weekly, ...dailies]);
        expect(await weeklyUndercountsDailies(db, 'weekly-2026-W22', '2026-05-25', '2026-05-31')).toBe(true);
    });
    it('does not fire once the weekly carries the rolled-up numbers', async () => {
        const weekly = {
            slug: 'weekly-2026-W22',
            type: 'weekly',
            date: '2026-05-25',
            stats_json: JSON.stringify({ findings: 4, iocs: 2200 }),
            body: '{}',
        };
        const db = fakeDb([weekly, ...dailies]);
        expect(await weeklyUndercountsDailies(db, 'weekly-2026-W22', '2026-05-25', '2026-05-31')).toBe(false);
    });
    it('does not fire when there are no dailies to compare against', async () => {
        const weekly = {
            slug: 'weekly-2026-W22',
            type: 'weekly',
            date: '2026-05-25',
            stats_json: JSON.stringify({ findings: 0, iocs: 0 }),
            body: '{}',
        };
        const db = fakeDb([weekly]);
        expect(await weeklyUndercountsDailies(db, 'weekly-2026-W22', '2026-05-25', '2026-05-31')).toBe(false);
    });
});
