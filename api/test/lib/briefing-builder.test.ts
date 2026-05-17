import { describe, it, expect } from 'vitest';
import { writeBriefing, type Briefing } from '../../src/lib/briefing-builder';

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
