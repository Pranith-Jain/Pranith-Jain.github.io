import { describe, it, expect, beforeEach } from 'vitest';

// In-memory D1 shim — minimal subset needed by si-shiftlog / si-promptvault.
class MemDb {
  tables: Record<string, Map<string, Record<string, unknown>>> = {};
  prepare(sql: string) {
    return new Stmt(this, sql);
  }
  async exec(sql: string) { /* no-op */ }
}
class Stmt {
  constructor(public db: MemDb, public sql: string) {}
  bind(...args: unknown[]) { this.params = args; return this; }
  params: unknown[] = [];
  private mapRow() { return this.params[0] as Record<string, unknown> | undefined; }
  async first() {
    const m = (this.sql.match(/FROM\s+(\w+)/i) ?? [])[1];
    const tbl = this.db.tables[m!];
    if (!tbl) return null;
    const id = this.params[0] as string;
    return tbl.get(id) ?? null;
  }
  async all() {
    const m = (this.sql.match(/FROM\s+(\w+)/i) ?? [])[1];
    const tbl = this.db.tables[m!];
    if (!tbl) return { results: [] };
    let rows = Array.from(tbl.values());
    // WHERE filter
    if (this.sql.includes('WHERE') && this.params.length) {
      const conds = (this.sql.match(/WHERE\s+(.+?)(?:\s+ORDER|\s+LIMIT|$)/i)?.[1] ?? '').split(/\s+AND\s+/i);
      for (let i = 0; i < conds.length; i++) {
        const c = conds[i];
        if (/(\w+)\s*=\s*\?/.test(c)) {
          const col = c.match(/(\w+)\s*=\s*\?/i)![1];
          const val = this.params[i];
          rows = rows.filter((r) => String(r[col]) === String(val));
        }
      }
    }
    // ORDER BY
    if (this.sql.match(/ORDER BY (\w+) DESC/i)) {
      const col = this.sql.match(/ORDER BY (\w+) DESC/i)![1];
      rows.sort((a, b) => String(b[col]).localeCompare(String(a[col])));
    }
    // LIMIT
    const lim = Number(this.sql.match(/LIMIT (\d+)/i)?.[1] ?? '1000');
    rows = rows.slice(0, lim);
    return { results: rows };
  }
  async run() {
    const m = (this.sql.match(/(?:INSERT INTO|UPDATE|DELETE FROM)\s+(\w+)/i) ?? [])[1];
    if (!m) return { success: true };
    const tbl = this.db.tables[m] ?? (this.db.tables[m] = new Map());
    if (this.sql.startsWith('INSERT')) {
      // id col
      const cols = (this.sql.match(/\(([^)]+)\)\s*VALUES/i)?.[1] ?? '').split(',').map((s) => s.trim().replace(/^\d+:\s*/, '').replace(/^\d+\s+/, ''));
      const row: Record<string, unknown> = {};
      cols.forEach((c, i) => { row[c] = this.params[i]; });
      const idKey = cols[0];
      if (idKey) tbl.set(String(row[idKey]), row);
    } else if (this.sql.startsWith('UPDATE')) {
      const set = this.sql.match(/SET\s+([\s\S]+?)\s+WHERE\s+(\w+)\s*=\s*\?/i);
      if (set) {
        const setCols = set[1].split(',').map((s) => s.trim().split(/\s*=\s*/)[0].trim());
        const whereCol = set[2];
        const whereVal = this.params[this.params.length - 1];
        for (const row of tbl.values()) {
          if (String(row[whereCol]) === String(whereVal)) {
            setCols.forEach((c, i) => { row[c] = this.params[i]; });
          }
        }
      }
    } else if (this.sql.startsWith('DELETE')) {
      const whereCol = this.sql.match(/WHERE\s+(\w+)\s*=\s*\?/i)?.[1];
      const val = this.params[0];
      if (whereCol) for (const [k, v] of tbl) if (String(v[whereCol]) === String(val)) tbl.delete(k);
    } else if (this.sql.startsWith('CREATE')) {
      // no-op for in-memory
    }
    return { success: true, meta: { changes: 1 } };
  }
}

function env() {
  return { BRIEFINGS_DB: new MemDb() as unknown as D1Database };
}

describe('si-shiftlog', () => {
  beforeEach(() => {
    // reset module-level cache — we cannot easily do that across tests,
    // but the in-memory DB is fresh per `env()` call, so each test gets
    // a clean slate. The schema is bootstrapped on first call.
  });

  it('creates and reads an entry', async () => {
    const { shiftlogCreate, shiftlogGet } = await import('./si-shiftlog');
    const e = env();
    const created = await shiftlogCreate(e, {
      shift: 'morning',
      author: 'alice',
      openCases: ['INC-001'],
      iocs: ['evil.com'],
      escalations: [],
      notes: 'Cleared backlog.',
    });
    expect(created.id).toMatch(/^sl_/);
    expect(created.author).toBe('alice');
    const fetched = await shiftlogGet(e, created.id);
    expect(fetched?.id).toBe(created.id);
    expect(fetched?.openCases).toEqual(['INC-001']);
  });

  it('rejects invalid shift', async () => {
    const { shiftlogCreate } = await import('./si-shiftlog');
    const e = env();
    await expect(shiftlogCreate(e, { shift: 'invalid' as never, author: 'a' })).rejects.toThrow(/Invalid shift/);
  });

  it('lists entries newest first', async () => {
    const { shiftlogCreate, shiftlogList } = await import('./si-shiftlog');
    const e = env();
    const a = await shiftlogCreate(e, { shift: 'morning', author: 'a' });
    await new Promise((r) => setTimeout(r, 5));
    const b = await shiftlogCreate(e, { shift: 'night', author: 'b' });
    const all = await shiftlogList(e);
    expect(all[0].id).toBe(b.id);
    expect(all[1].id).toBe(a.id);
  });

  it('filters by author and shift', async () => {
    const { shiftlogCreate, shiftlogList } = await import('./si-shiftlog');
    const e = env();
    await shiftlogCreate(e, { shift: 'morning', author: 'a' });
    await shiftlogCreate(e, { shift: 'night', author: 'b' });
    const aOnly = await shiftlogList(e, { author: 'a' });
    expect(aOnly.length).toBe(1);
    expect(aOnly[0].shift).toBe('morning');
  });

  it('updates an entry and closes it', async () => {
    const { shiftlogCreate, shiftlogUpdate, shiftlogClose, shiftlogGet } = await import('./si-shiftlog');
    const e = env();
    const c = await shiftlogCreate(e, { shift: 'afternoon', author: 'a', notes: 'start' });
    const u = await shiftlogUpdate(e, c.id, { notes: 'mid', iocs: ['1.2.3.4'] });
    expect(u?.notes).toBe('mid');
    expect(u?.iocs).toEqual(['1.2.3.4']);
    const closed = await shiftlogClose(e, c.id, '2024-08-12T18:00:00Z');
    expect(closed?.endedAt).toBe('2024-08-12T18:00:00Z');
  });

  it('returns null for unknown id', async () => {
    const { shiftlogGet, shiftlogUpdate } = await import('./si-shiftlog');
    const e = env();
    expect(await shiftlogGet(e, 'sl_doesnotexist')).toBeNull();
    expect(await shiftlogUpdate(e, 'sl_doesnotexist', { notes: 'x' })).toBeNull();
  });
});
