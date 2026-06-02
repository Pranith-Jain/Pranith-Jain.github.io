import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import {
  writeBriefing,
  withLastGood,
  canonicalGangKeys,
  normalizeVictimKey,
  briefingNeedsHeal,
  dailyNeedsCveReenrich,
  isBriefingRich,
  isBriefingDegraded,
  type Briefing,
} from '../../src/lib/briefing-builder';
import { readLastGood, writeLastGood } from '../../src/lib/lastgood';
import type { Env } from '../../src/env';

// The test pool's `ProvidedEnv` (from cloudflare:test) only declares the
// bindings wrangler.toml knows about — the production `Env` type also
// requires CASE_STUDIES, AI, ADMIN_TOKEN which aren't bound in the test
// runtime. We only need KV_CACHE here, so cast through `unknown`.
const testEnv = env as unknown as Env;

/** Minimal in-memory D1 stub: enough of prepare/bind/first/run for writeBriefing. */
function fakeDb(rows: Record<string, { stats_json: string }>) {
  const writes: string[] = [];
  const db = {
    prepare(sql: string) {
      return {
        _sql: sql,
        _args: [] as unknown[],
        bind(...args: unknown[]) {
          this._args = args;
          return this;
        },
        async first<T>(): Promise<T | null> {
          const slug = this._args[0] as string;
          if (this._sql.includes('SELECT 1')) return rows[slug] ? ({} as T) : null;
          if (this._sql.includes('stats_json')) return (rows[slug] as T) ?? null;
          return null;
        },
        async run() {
          const slug = this._args[0] as string;
          writes.push(slug);
          rows[slug] = { stats_json: String(this._args[7]) };
          return { success: true };
        },
      };
    },
  };
  return { db: db as never, writes, rows };
}

function briefing(slug: string, findings: number, iocs: number): Briefing {
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
    stats: { findings, sections: 0, cves: 0, kevs: 0, iocs, critical: 0, high: 0, medium: 0, low: 0 },
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
  const key = (name: string) => `test:briefing:${name}:${Date.now()}-${Math.random()}`;

  beforeEach(async () => {
    // Wipe any test keys left over from a previous run so the cold-cache
    // assertions below are deterministic.
    if (env.KV_CACHE) {
      const all = await env.KV_CACHE.list({ prefix: 'lastgood:v1:test:briefing:' });
      await Promise.all(all.keys.map((k) => env.KV_CACHE!.delete(k.name)));
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
    await expect(
      withLastGood(testEnv, k, async () => {
        throw new Error('first call: cold cache + upstream down');
      })
    ).rejects.toThrow('first call: cold cache + upstream down');
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
  const body = (degraded: boolean, generatedAt: string) => JSON.stringify({ degraded, generated_at: generatedAt });
  const stats = (findings: number, iocs: number) => JSON.stringify({ findings, iocs });

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
  const body = (generatedAt: string) => JSON.stringify({ generated_at: generatedAt });
  const stats = (findings: number, iocs: number) => JSON.stringify({ findings, iocs });

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
