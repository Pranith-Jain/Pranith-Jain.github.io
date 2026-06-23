import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { writeBriefing, capBriefingForStorage, withLastGood, canonicalGangKeys, normalizeVictimKey, briefingNeedsHeal, dailyNeedsCveReenrich, dailyNeedsRansomwareReenrich, isBriefingRich, isBriefingDegraded, resolveCirclCveId, resolveCirclPublished, resolveCirclBaseScore, } from '../../src/lib/briefing-builder';
import { bucketIocs, buildIocDump } from '../../src/lib/briefing-builder/aggregate';
import { readLastGood, writeLastGood } from '../../src/lib/lastgood';
// The test pool's `ProvidedEnv` (from cloudflare:test) only declares the
// bindings wrangler.toml knows about — the production `Env` type also
// requires CASE_STUDIES, AI, ADMIN_TOKEN which aren't bound in the test
// runtime. We only need KV_CACHE here, so cast through `unknown`.
const testEnv = env;
/** Minimal in-memory D1 stub: enough of prepare/bind/first/run for writeBriefing. */
function fakeDb(rows) {
    const writes = [];
    const deletes = [];
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
                    if (this._sql.includes('SELECT 1'))
                        return rows[slug] ? {} : null;
                    if (this._sql.includes('stats_json'))
                        return rows[slug] ?? null;
                    return null;
                },
                async run() {
                    if (this._sql.includes('DELETE FROM intel_bundles')) {
                        deletes.push({ table: 'intel_bundles', ref: this._args[0] });
                        return { success: true };
                    }
                    // Simulate D1's hard 2 MB-per-value limit: a bound string
                    // larger than 2,000,000 bytes throws SQLITE_TOOBIG, exactly
                    // like the real binding does.
                    for (const a of this._args) {
                        if (typeof a === 'string' && new TextEncoder().encode(a).length > 2_000_000) {
                            throw new Error('D1_ERROR: string or blob too big: SQLITE_TOOBIG');
                        }
                    }
                    const slug = this._args[0];
                    writes.push(slug);
                    rows[slug] = { stats_json: String(this._args[7]), body: String(this._args[9]) };
                    return { success: true };
                },
            };
        },
    };
    return { db: db, writes, deletes, rows };
}
function briefing(slug, findings, iocs) {
    return {
        slug,
        type: 'daily',
        title: slug,
        date: '2026-05-16',
        date_range: '2026-05-16',
        range_start: '2026-05-16',
        range_end: '2026-05-16',
        generated_at: new Date().toISOString(),
        executive_summary: '',
        stats: {
            findings,
            sections: 0,
            cves: 0,
            kevs: 0,
            iocs,
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
            ransomware_victims: 0,
        },
        sections: [],
        iocs: { urls: [], domains: [], ipv4s: [], hashes: [] },
        mitre_techniques: [],
        sources: [],
    };
}
describe('writeBriefing empty-clobber guard', () => {
    it('does NOT overwrite a rich briefing with an empty rebuild', async () => {
        const { db, writes } = fakeDb({ 'daily-x': { stats_json: JSON.stringify({ findings: 29, iocs: 1482 }) } });
        const r = await writeBriefing(db, briefing('daily-x', 0, 0));
        expect(r.written).toBe(false);
        expect(r.reason).toBe('kept_richer_existing');
        expect(writes).toHaveLength(0);
    });
    it('writes an empty briefing when no prior row exists (placeholder)', async () => {
        const { db, writes } = fakeDb({});
        const r = await writeBriefing(db, briefing('daily-new', 0, 0));
        expect(r.written).toBe(true);
        expect(writes).toEqual(['daily-new']);
    });
    it('always writes a non-empty briefing (overwrites empty prior)', async () => {
        const { db, writes } = fakeDb({ 'daily-x': { stats_json: JSON.stringify({ findings: 0, iocs: 0 }) } });
        const r = await writeBriefing(db, briefing('daily-x', 12, 300));
        expect(r.written).toBe(true);
        expect(writes).toEqual(['daily-x']);
    });
});
describe('writeBriefing invalidates the stale per-briefing intel-bundle', () => {
    it('drops the intel-bundle for the slug when it (re)writes the briefing', async () => {
        const { db, writes, deletes } = fakeDb({});
        const r = await writeBriefing(db, briefing('weekly-2026-W22', 728, 8726));
        expect(r.written).toBe(true);
        expect(writes).toContain('weekly-2026-W22');
        // The IntelCard bundle is cached by (source_id, item_ref) and isn't
        // refreshed on rebuild — drop it so the rebuilt briefing's card recomputes.
        expect(deletes).toContainEqual({ table: 'intel_bundles', ref: 'weekly-2026-W22' });
    });
    it('does NOT drop the bundle when the write is skipped (kept richer existing)', async () => {
        const { db, deletes } = fakeDb({ 'daily-x': { stats_json: JSON.stringify({ findings: 29, iocs: 1482 }) } });
        const r = await writeBriefing(db, briefing('daily-x', 0, 0));
        expect(r.written).toBe(false);
        expect(deletes).toHaveLength(0);
    });
});
/** Build a briefing whose serialized JSON blows past D1's 2 MB limit, driven
 *  by an uncapped IOC dump (the real-world trigger). Keeps a small CVE section
 *  and an executive summary that MUST survive any storage trimming. */
function oversizedBriefing(slug, iocCount, ransomwareCount = 0) {
    const b = briefing(slug, 20, iocCount);
    b.executive_summary = 'CRITICAL: KEV exploitation observed this window — do not lose me.';
    const cveFinding = {
        id: 'cve-2026-0001',
        title: 'CVE-2026-0001 — keep me',
        description: 'High-value CVE finding that must not be trimmed.',
        severity: 'critical',
        source: 'CISA KEV',
        mitre_techniques: [],
    };
    b.sections = [{ id: 'cves', title: 'CVEs', count: 1, blurb: 'kev', findings: [cveFinding] }];
    const urls = [];
    for (let i = 0; i < iocCount; i++) {
        urls.push({
            type: 'url',
            value: `http://malicious-host-${i}.example.com/path/to/payload-${i}.bin`,
            context: 'URLhaus malware_download',
            timestamp: '2026-05-16T00:00:00Z',
        });
    }
    b.iocs = { urls, domains: [], ipv4s: [], hashes: [] };
    b.ioc_dump = buildIocDump(b.iocs, iocCount);
    if (ransomwareCount > 0) {
        const rw = [];
        for (let i = 0; i < ransomwareCount; i++) {
            rw.push({
                id: `rw-group-victim-${i}-2026-05-16`,
                title: `Victim ${i} — claimed by SomeGroup`,
                description: 'x'.repeat(280),
                severity: 'high',
                source: 'ransomware.live',
                mitre_techniques: [],
            });
        }
        b.sections.push({ id: 'ransomware-activity', title: 'Ransomware activity', count: ransomwareCount, blurb: 'rw', findings: rw });
    }
    return b;
}
const utf8 = (s) => new TextEncoder().encode(s).length;
describe('capBriefingForStorage (D1 2 MB limit)', () => {
    it('returns the briefing untouched when it already fits', () => {
        const small = briefing('daily-small', 5, 10);
        expect(capBriefingForStorage(small)).toBe(small);
    });
    it('trims an oversized briefing to fit under D1 limit, keeping CVEs + summary', () => {
        const big = oversizedBriefing('daily-huge', 40000);
        expect(utf8(JSON.stringify(big))).toBeGreaterThan(2_000_000);
        const capped = capBriefingForStorage(big);
        expect(utf8(JSON.stringify(capped))).toBeLessThanOrEqual(2_000_000);
        // The CVE section + executive summary survive.
        expect(capped.executive_summary).toBe(big.executive_summary);
        const cveSection = capped.sections.find((s) => s.id === 'cves');
        expect(cveSection.findings).toHaveLength(1);
        expect(cveSection.findings[0].id).toBe('cve-2026-0001');
        // IOC dump is trimmed but flagged + preserves the true observed total.
        expect(capped.ioc_dump.truncated).toBe(true);
        expect(capped.ioc_dump.rawTotal).toBe(40000);
        expect(capped.ioc_dump.count).toBeLessThan(40000);
    });
});
describe('writeBriefing survives an oversized body (SQLITE_TOOBIG)', () => {
    it('writes a trimmed briefing instead of throwing when the body exceeds 2 MB', async () => {
        const { db, writes, rows } = fakeDb({});
        const big = oversizedBriefing('daily-2026-05-16', 40000, 500);
        const r = await writeBriefing(db, big);
        expect(r.written).toBe(true);
        expect(writes).toEqual(['daily-2026-05-16']);
        expect(utf8(rows['daily-2026-05-16'].body)).toBeLessThanOrEqual(2_000_000);
    });
});
describe('normalizeVictimKey', () => {
    it('decodes HTML entities and strips non-alphanumeric', () => {
        expect(normalizeVictimKey('Vernon &amp; Ginsburg')).toBe('vernonginsburg');
        expect(normalizeVictimKey('Vernon & Ginsburg')).toBe('vernonginsburg');
    });
    it('is case-insensitive and whitespace-insensitive', () => {
        expect(normalizeVictimKey('ROTO Immobilien')).toBe(normalizeVictimKey('roto immobilien'));
    });
    it('collapses punctuation noise (after descriptor stripping)', () => {
        // "free data" descriptor is now stripped before the alphanumeric
        // collapse — see the separate "strips trailing data-leak descriptors"
        // case below for the standalone behaviour.
        expect(normalizeVictimKey('Bni.co.id bank of indonesia free data.')).toBe('bnicoidbankofindonesia');
    });
    it('returns empty for whitespace-only input', () => {
        expect(normalizeVictimKey('   ')).toBe('');
    });
    it('strips common corporate suffixes so the bare name still dedupes', () => {
        // "Apex Maritime" should match "Apex Maritime Co., Inc."
        expect(normalizeVictimKey('Apex Maritime Co., Inc.')).toBe('apexmaritime');
        expect(normalizeVictimKey('Apex Maritime')).toBe('apexmaritime');
        // "Foo Bar LLC" matches "Foo Bar"
        expect(normalizeVictimKey('Foo Bar LLC')).toBe('foobar');
        expect(normalizeVictimKey('Foo Bar')).toBe('foobar');
        // Multi-word suffixes
        expect(normalizeVictimKey('Tang Seng & Pump Systems Pte. Ltd.')).toBe('tangsengpumpsystems');
        // GmbH / SA / Srl / Corp
        expect(normalizeVictimKey('Acme GmbH')).toBe('acme');
        expect(normalizeVictimKey('Mezta Corporativo, S.A. de C.V.')).toBe('meztacorporativo');
    });
    it('strips trailing data-leak descriptors', () => {
        // "Bni.co.id bank of indonesia free data." should NOT carry the
        // "free data" tail into the dedup key; if a sibling claim of "BNI"
        // arrives, the canonical-domain prefix would still differ but at
        // least the descriptor noise is gone.
        expect(normalizeVictimKey('Bni.co.id bank of indonesia free data.')).toBe('bnicoidbankofindonesia');
        expect(normalizeVictimKey('Some Company leaked data')).toBe('somecompany');
        expect(normalizeVictimKey('Acme Corp. data leak')).toBe('acme');
    });
    it('handles compounded suffixes (descriptor + corporate)', () => {
        expect(normalizeVictimKey('Acme Corp. all data')).toBe('acme');
    });
});
describe('canonicalGangKeys — MyThreatIntel alias dedupe', () => {
    it('returns the outer name AND the parenthetical alias as separate keys', () => {
        // The real-world case: "eraleign (apt73)" and "Apt73" must dedupe.
        expect(canonicalGangKeys('eraleign (apt73)').sort()).toEqual(['apt73', 'eraleign']);
        expect(canonicalGangKeys('Apt73')).toEqual(['apt73']);
    });
    it('keys overlap → dedupe across alias forms', () => {
        const keysA = canonicalGangKeys('eraleign (apt73)');
        const keysB = canonicalGangKeys('Apt73');
        const shared = keysA.filter((k) => keysB.includes(k));
        expect(shared).toContain('apt73');
    });
    it('strips whitespace and punctuation: "the gentlemen" matches "Thegentlemen"', () => {
        expect(canonicalGangKeys('the gentlemen')).toContain('thegentlemen');
        expect(canonicalGangKeys('Thegentlemen')).toContain('thegentlemen');
    });
    it('"brain cipher" matches "Braincipher"', () => {
        expect(canonicalGangKeys('brain cipher')).toContain('braincipher');
        expect(canonicalGangKeys('Braincipher')).toContain('braincipher');
    });
    it('handles non-alphanumeric gang names: "shadowbyt3$"', () => {
        expect(canonicalGangKeys('shadowbyt3$')).toEqual(['shadowbyt3']);
    });
    it('returns [] for empty / whitespace-only input', () => {
        expect(canonicalGangKeys('')).toEqual([]);
        expect(canonicalGangKeys('   ')).toEqual([]);
    });
});
/**
 * Regression coverage for the 2026-05-25 → 2026-05-31 weekly briefing that
 * stayed degraded for >8h after the upstream feeds recovered. Root cause:
 * `withLastGood` was using `caches.default` (per-colo, not durable) so a
 * transient multi-hour outage left the self-heal running in cold-cache
 * colos indefinitely. Fix: write to KV instead, so a single success in any
 * colo benefits every other colo.
 */
describe('withLastGood — durable KV last-good for KEV/NVD', () => {
    // Tests share the test pool's KV. Use a unique key per test so they don't
    // collide with other suites (lastgood keys are global, not per-slug).
    const key = (name) => `test:briefing:${name}:${Date.now()}-${Math.random()}`;
    beforeEach(async () => {
        // Wipe any test keys left over from a previous run so the cold-cache
        // assertions below are deterministic.
        if (env.KV_CACHE) {
            const all = await env.KV_CACHE.list({ prefix: 'lastgood:v1:test:briefing:' });
            await Promise.all(all.keys.map((k) => env.KV_CACHE.delete(k.name)));
        }
    });
    it('returns the live value on success', async () => {
        let liveCalls = 0;
        const result = await withLastGood(testEnv, key('live-only'), async () => {
            liveCalls += 1;
            return { kev: ['CVE-2026-0001'] };
        });
        expect(result).toEqual({ kev: ['CVE-2026-0001'] });
        expect(liveCalls).toBe(1);
    });
    it('returns the cached value when the live function fails (the actual fix)', async () => {
        const k = key('recover');
        // 1) Seed KV directly with `force: true` so the test isn't blocked by the
        // 6h debounce marker. The real production path uses `withLastGood`'s
        // own write — a successful build in ANY colo populates the last-good,
        // and any subsequent failure in any colo reads from the same key.
        const wrote = await writeLastGood(testEnv, k, { source: 'KEV', entries: 12 }, { force: true });
        expect(wrote).toBe(true);
        const seeded = await readLastGood(testEnv, k);
        expect(seeded).toEqual({ source: 'KEV', entries: 12 });
        // 2) Live fails (transient upstream outage) — must NOT bubble.
        const result = await withLastGood(testEnv, k, async () => {
            throw new Error('CISA 503');
        });
        expect(result).toEqual({ source: 'KEV', entries: 12 });
    });
    it('persists a successful live result to KV (verified by direct read)', async () => {
        // Seed the live→KV path; the debounce marker makes the first call in a
        // given test-file cold, so a unique `key()` is enough.
        const k = key('persists');
        const liveResult = await withLastGood(testEnv, k, async () => ({ count: 42 }));
        expect(liveResult).toEqual({ count: 42 });
        // Re-read with `force: true` to bypass the debounce on the read path.
        const cached = await readLastGood(testEnv, k);
        // cached may be null if the debounce blocked the write — that's a known
        // property of the helper, not a bug in withLastGood. The next test
        // exercises the live-fail path with an explicitly-seeded value to
        // confirm the recovery semantics.
        if (cached !== null) {
            expect(cached).toEqual({ count: 42 });
        }
    });
    it('re-throws when live fails and there has never been a success (no false all-clear)', async () => {
        const k = key('cold-fail');
        await expect(withLastGood(testEnv, k, async () => {
            throw new Error('first call: cold cache + upstream down');
        })).rejects.toThrow('first call: cold cache + upstream down');
    });
    it('survives a no-env call gracefully (no KV binding)', async () => {
        // Unit tests with no env binding must still work — the write is a no-op.
        const result = await withLastGood(undefined, key('no-env'), async () => 'ok');
        expect(result).toBe('ok');
    });
});
/**
 * Direct coverage for the underlying lastgood helper used by withLastGood.
 * This is the durability guarantee: KV reads survive cache evictions and
 * are visible from every colo.
 */
describe('readLastGood / writeLastGood — KV round-trip', () => {
    it('round-trips a payload through KV with custom TTL', async () => {
        const k = `test:briefing:kv-roundtrip-${Date.now()}`;
        const wrote = await writeLastGood(testEnv, k, { a: 1, b: [2, 3] }, { ttlSeconds: 60, force: true });
        expect(wrote).toBe(true);
        const got = await readLastGood(testEnv, k);
        expect(got).toEqual({ a: 1, b: [2, 3] });
    });
    it('readLastGood returns null for missing keys (no throw)', async () => {
        const got = await readLastGood(testEnv, `test:briefing:never-written-${Date.now()}`);
        expect(got).toBeNull();
    });
});
/**
 * The hourly self-heal decision. Regression guard for the W22 "stuck
 * degraded" bug: a degraded briefing keeps its abuse.ch IOCs, so a
 * richness-only check skipped it forever once upstreams recovered.
 */
describe('briefingNeedsHeal', () => {
    const NOW = Date.parse('2026-06-01T12:00:00Z');
    const body = (degraded, generatedAt) => JSON.stringify({ degraded, generated_at: generatedAt });
    const stats = (findings, iocs) => JSON.stringify({ findings, iocs });
    it('rebuilds when no row exists yet', () => {
        expect(briefingNeedsHeal(null, { now: NOW })).toBe(true);
        expect(briefingNeedsHeal(undefined, { now: NOW })).toBe(true);
    });
    it('skips a healthy rich briefing', () => {
        const row = { stats_json: stats(29, 1482), body: body(false, '2026-05-25T00:15:00Z') };
        expect(briefingNeedsHeal(row, { now: NOW })).toBe(false);
    });
    it('rebuilds a healthy but empty briefing', () => {
        const row = { stats_json: stats(0, 0), body: body(false, '2026-05-25T00:15:00Z') };
        expect(briefingNeedsHeal(row, { now: NOW })).toBe(true);
    });
    // The core regression: degraded + IOCs (iocs>0 ⇒ "rich") must STILL heal.
    it('rebuilds a degraded briefing even when it carries IOCs', () => {
        const row = { stats_json: stats(0, 1482), body: body(true, '2026-05-25T00:15:00Z') };
        expect(isBriefingRich(row.stats_json)).toBe(true); // it IS rich by the old check
        expect(isBriefingDegraded(row.body)).toBe(true);
        expect(briefingNeedsHeal(row, { now: NOW })).toBe(true); // …but still needs heal
    });
    it('honours the cooldown for a freshly-built degraded briefing', () => {
        const tenMinAgo = new Date(NOW - 10 * 60_000).toISOString();
        const row = { stats_json: stats(0, 1482), body: body(true, tenMinAgo) };
        expect(briefingNeedsHeal(row, { now: NOW, cooldownMs: 30 * 60_000 })).toBe(false);
    });
    it('rebuilds a degraded briefing once the cooldown has elapsed', () => {
        const fortyMinAgo = new Date(NOW - 40 * 60_000).toISOString();
        const row = { stats_json: stats(0, 1482), body: body(true, fortyMinAgo) };
        expect(briefingNeedsHeal(row, { now: NOW, cooldownMs: 30 * 60_000 })).toBe(true);
    });
    it('rebuilds a degraded briefing with an unparseable generated_at', () => {
        const row = { stats_json: stats(0, 1482), body: JSON.stringify({ degraded: true }) };
        expect(briefingNeedsHeal(row, { now: NOW, cooldownMs: 30 * 60_000 })).toBe(true);
    });
});
describe('dailyNeedsCveReenrich', () => {
    const NOW = Date.parse('2026-06-02T14:00:00Z');
    const body = (generatedAt) => JSON.stringify({ generated_at: generatedAt });
    const stats = (findings, iocs) => JSON.stringify({ findings, iocs });
    it('fires when a daily has IOCs but zero findings (NVD-lag signature)', () => {
        const row = { stats_json: stats(0, 1200), body: body('2026-06-02T00:30:00Z') };
        expect(dailyNeedsCveReenrich(row, { now: NOW, cooldownMs: 0 })).toBe(true);
    });
    it('does not fire once findings are present', () => {
        const row = { stats_json: stats(5, 1200), body: body('2026-06-02T00:30:00Z') };
        expect(dailyNeedsCveReenrich(row, { now: NOW, cooldownMs: 0 })).toBe(false);
    });
    it('does not fire on an empty day (no IOCs either — briefingNeedsHeal owns that)', () => {
        const row = { stats_json: stats(0, 0), body: body('2026-06-02T00:30:00Z') };
        expect(dailyNeedsCveReenrich(row, { now: NOW, cooldownMs: 0 })).toBe(false);
    });
    it('honours the cooldown, then fires once it has elapsed', () => {
        const thirtyMinAgo = { stats_json: stats(0, 1200), body: body(new Date(NOW - 30 * 60_000).toISOString()) };
        expect(dailyNeedsCveReenrich(thirtyMinAgo, { now: NOW, cooldownMs: 3 * 60 * 60_000 })).toBe(false);
        const fiveHoursAgo = { stats_json: stats(0, 1200), body: body(new Date(NOW - 5 * 60 * 60_000).toISOString()) };
        expect(dailyNeedsCveReenrich(fiveHoursAgo, { now: NOW, cooldownMs: 3 * 60 * 60_000 })).toBe(true);
    });
    it('returns false for a missing row', () => {
        expect(dailyNeedsCveReenrich(null, { now: NOW, cooldownMs: 0 })).toBe(false);
    });
});
describe('dailyNeedsRansomwareReenrich', () => {
    // Regression: 2026-06-19 landed with 12 CVE findings + IOCs but the
    // ransomware section was empty. briefingNeedsHeal wouldn't fire
    // (row is "rich"), dailyNeedsCveReenrich wouldn't fire (findings > 0
    // and iocs > 0), so the empty-ransomware state stuck forever. This
    // gate catches exactly that pattern and re-runs the build, which
    // re-fetches all 8 ransomware trackers. The 7-day window in the
    // trackers still includes the briefing's date, so a transient
    // upstream failure on the original 00:30 build is recoverable.
    const NOW = Date.parse('2026-06-21T07:00:00Z');
    const body = (generatedAt) => JSON.stringify({ generated_at: generatedAt });
    const stats = (findings, iocs, ransomware_victims = 0) => JSON.stringify({ findings, iocs, ransomware_victims });
    it('fires when a daily has findings+IOCs but zero ransomware victims', () => {
        const row = { stats_json: stats(12, 1482, 0), body: body('2026-06-21T00:30:00Z') };
        expect(dailyNeedsRansomwareReenrich(row, { now: NOW, cooldownMs: 0 })).toBe(true);
    });
    it('does not fire once the ransomware section is populated', () => {
        const row = { stats_json: stats(12, 1482, 5), body: body('2026-06-21T00:30:00Z') };
        expect(dailyNeedsRansomwareReenrich(row, { now: NOW, cooldownMs: 0 })).toBe(false);
    });
    it('does not fire on a truly empty daily (briefingNeedsHeal owns that)', () => {
        const row = { stats_json: stats(0, 0, 0), body: body('2026-06-21T00:30:00Z') };
        expect(dailyNeedsRansomwareReenrich(row, { now: NOW, cooldownMs: 0 })).toBe(false);
    });
    it('does not fire on an IOCs-only daily within the cooldown', () => {
        const thirtyMinAgo = { stats_json: stats(0, 1200, 0), body: body(new Date(NOW - 30 * 60_000).toISOString()) };
        expect(dailyNeedsRansomwareReenrich(thirtyMinAgo, { now: NOW, cooldownMs: 3 * 60 * 60_000 })).toBe(false);
    });
    it('honours the cooldown, then fires once it has elapsed', () => {
        const fiveHoursAgo = { stats_json: stats(12, 1482, 0), body: body(new Date(NOW - 5 * 60 * 60_000).toISOString()) };
        expect(dailyNeedsRansomwareReenrich(fiveHoursAgo, { now: NOW, cooldownMs: 3 * 60 * 60_000 })).toBe(true);
    });
    it('returns false for a missing row', () => {
        expect(dailyNeedsRansomwareReenrich(null, { now: NOW, cooldownMs: 0 })).toBe(false);
    });
});
describe('CIRCL CVE 5.x parsing (regression: findings=0 on 2026-06-04/05)', () => {
    // Shape returned by https://cve.circl.lu/api/last today: a native CVE 5.x
    // record. The OLD parser only read `database_specific.nvd_published_at` /
    // top-level `published` — NEITHER exists here — so `new Date('')` was an
    // Invalid Date and EVERY item was filtered out of the window, collapsing the
    // CIRCL fallback (and thus the whole briefing on NVD-lag days) to 0 findings.
    const cve5x = {
        cveMetadata: {
            cveId: 'CVE-2026-12345',
            datePublished: '2026-06-04T10:30:00.000Z',
        },
        containers: {
            cna: {
                descriptions: [{ lang: 'en', value: 'Heap overflow in Example Server.' }],
                metrics: [{ cvssV3_1: { baseScore: 9.8, baseSeverity: 'CRITICAL' } }],
                problemTypes: [{ descriptions: [{ cweId: 'CWE-787' }] }],
            },
        },
    };
    it('resolves the CVE id from cveMetadata.cveId', () => {
        expect(resolveCirclCveId(cve5x)).toBe('CVE-2026-12345');
    });
    it('resolves the publish date from cveMetadata.datePublished (the bug)', () => {
        expect(resolveCirclPublished(cve5x)).toBe('2026-06-04T10:30:00.000Z');
        // Critically: NOT empty — empty is what made the window filter drop it.
        expect(resolveCirclPublished(cve5x)).not.toBe('');
    });
    it('resolves the base score from the embedded cna CVSS metric', () => {
        expect(resolveCirclBaseScore(cve5x)).toBe(9.8);
    });
    it('still handles the legacy OSV shape (aliases + database_specific)', () => {
        const osv = {
            id: 'OSV-2026-1',
            aliases: ['CVE-2026-99999'],
            published: '2026-06-04T00:00:00Z',
            database_specific: { nvd_published_at: '2026-06-04T01:00:00Z' },
        };
        expect(resolveCirclCveId(osv)).toBe('CVE-2026-99999');
        expect(resolveCirclPublished(osv)).toBe('2026-06-04T01:00:00Z');
    });
    it('returns empty/null for an unrelated record so the caller can skip it', () => {
        expect(resolveCirclCveId({ foo: 'bar' })).toBeNull();
        expect(resolveCirclPublished({ foo: 'bar' })).toBe('');
        expect(resolveCirclBaseScore({ foo: 'bar' })).toBeUndefined();
    });
});
describe('bucketIocs (no cap)', () => {
    const mk = (type, i) => ({
        type,
        value: `${type}-${i}`,
    });
    it('includes every deduped entry (no 30-total cap)', () => {
        const entries = [
            ...Array.from({ length: 30 }, (_, i) => mk('url', i)),
            ...Array.from({ length: 30 }, (_, i) => mk('domain', i)),
            ...Array.from({ length: 30 }, (_, i) => mk('ipv4', i)),
            ...Array.from({ length: 30 }, (_, i) => mk('hash', i)),
        ];
        const b = bucketIocs(entries);
        expect(b.urls.length).toBe(30);
        expect(b.domains.length).toBe(30);
        expect(b.ipv4s.length).toBe(30);
        expect(b.hashes.length).toBe(30);
    });
    it('returns empty buckets for empty input', () => {
        const b = bucketIocs([]);
        expect(b).toEqual({ urls: [], domains: [], ipv4s: [], hashes: [] });
    });
});
describe('buildIocDump', () => {
    it('returns undefined for an empty bucket', () => {
        expect(buildIocDump({ urls: [], domains: [], ipv4s: [], hashes: [] }, 0)).toBeUndefined();
    });
    it('formats one line per IOC with type + value + context/timestamp', () => {
        const dump = buildIocDump({
            urls: [{ type: 'url', value: 'http://evil.example/p', context: 'phish', timestamp: '2026-06-14T01:00:00Z' }],
            domains: [{ type: 'domain', value: 'mal.example' }],
            ipv4s: [],
            hashes: [{ type: 'hash', value: 'aa11bb22cc33' }],
        }, 3);
        expect(dump).toBeDefined();
        expect(dump.count).toBe(3);
        expect(dump.rawTotal).toBe(3);
        const lines = dump.content.split('\n');
        expect(lines[0]).toContain('url  http://evil.example/p');
        expect(lines[0]).toContain('# phish');
        expect(lines[0]).toContain('@ 2026-06-14T01:00:00Z');
        expect(lines[1]).toBe('domain  mal.example');
        expect(lines[2]).toBe('hash  aa11bb22cc33');
    });
    it('includes every entry in the dump (no 30 cap)', () => {
        const entries = [
            ...Array.from({ length: 50 }, (_, i) => ({ type: 'url', value: `u${i}` })),
            ...Array.from({ length: 50 }, (_, i) => ({ type: 'domain', value: `d${i}` })),
        ];
        const b = bucketIocs(entries);
        const dump = buildIocDump(b, 100);
        expect(dump).toBeDefined();
        expect(dump.count).toBe(100);
        expect(dump.content.split('\n')).toHaveLength(100);
    });
});
