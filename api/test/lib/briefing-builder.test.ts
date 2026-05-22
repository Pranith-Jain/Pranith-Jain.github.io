import { describe, it, expect } from 'vitest';
import { writeBriefing, canonicalGangKeys, normalizeVictimKey, type Briefing } from '../../src/lib/briefing-builder';

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

  it('collapses punctuation noise', () => {
    expect(normalizeVictimKey('Bni.co.id bank of indonesia free data.')).toBe('bnicoidbankofindonesiafreedata');
  });

  it('returns empty for whitespace-only input', () => {
    expect(normalizeVictimKey('   ')).toBe('');
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
