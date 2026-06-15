import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Minimal D1-shaped in-memory shim. Supports:
 *   - CREATE TABLE / CREATE INDEX (no-op; column type strings)
 *   - INSERT INTO (id, ...columns) VALUES (?,...)
 *   - SELECT * FROM tbl WHERE col = ? [AND col = ?] ORDER BY col DESC LIMIT n
 *   - UPDATE tbl SET col = ?, ... WHERE id = ?
 *   - SELECT * FROM tbl WHERE col = ?  (first())
 */
class MemDb {
  tables: Record<string, Map<string, Record<string, unknown>>> = {};
  prepare(sql: string) { return new Stmt(this, sql); }
}
class Stmt {
  constructor(public db: MemDb, public sql: string) {}
  params: unknown[] = [];
  bind(...args: unknown[]) { this.params = args; return this; }
  then<TResult1 = unknown, TResult2 = never>(onFulfilled?: ((v: unknown) => TResult1 | PromiseLike<TResult1>) | null, onRejected?: ((e: unknown) => TResult2 | PromiseLike<TResult2>) | null): Promise<unknown> {
    // The schema code does `db.prepare(sql).then(() => ...)` to chain
    // migrations, so `prepare(...)` must be a thenable that resolves to
    // a successful run() result. D1 in production returns Promise<any>
    // from prepare().run() / .all() / .first(), so we forward those.
    return this.run().then(onFulfilled as any, onRejected as any);
  }
  async first() {
    const tbl = this.tblName();
    if (!tbl) return null;
    const t = this.db.tables[tbl];
    if (!t) return null;
    const conds = this.whereClauses();
    for (const [k, v] of t) {
      if (this.matches(conds, k, v)) return v;
    }
    return null;
  }
  async all() {
    const tbl = this.tblName();
    if (!tbl) return { results: [] };
    const t = this.db.tables[tbl];
    if (!t) return { results: [] };
    const conds = this.whereClauses();
    let rows = Array.from(t.values()).filter((v) => this.matches(conds, '', v));
    const orderMatch = this.sql.match(/ORDER BY (\w+)(?:\s+(ASC|DESC))?/i);
    if (orderMatch) {
      const col = orderMatch[1];
      const dir = (orderMatch[2] ?? 'ASC').toUpperCase();
      rows.sort((a, b) => {
        const av = String(a[col] ?? ''), bv = String(b[col] ?? '');
        return dir === 'DESC' ? bv.localeCompare(av) : av.localeCompare(bv);
      });
    }
    const limMatch = this.sql.match(/LIMIT (\d+)/i);
    if (limMatch) rows = rows.slice(0, Number(limMatch[1]));
    return { results: rows };
  }
  async run() {
    if (/^CREATE\b/i.test(this.sql.trim())) return { success: true, meta: { changes: 0 } };
    const tbl = this.tblName();
    if (!tbl) return { success: true, meta: { changes: 0 } };
    const t = (this.db.tables[tbl] ??= new Map());
    if (/^INSERT\b/i.test(this.sql.trim())) {
      const cols = (this.sql.match(/INSERT INTO \w+\s*\(([^)]+)\)\s*VALUES/i)?.[1] ?? '').split(',').map((s) => s.trim().replace(/^\d+:?\s*/, ''));
      const vals = (this.sql.match(/VALUES\s*\(([^)]+)\)/i)?.[1] ?? '').split(',').map((s) => s.trim());
      const row: Record<string, unknown> = {};
      let pIdx = 0;
      for (let i = 0; i < cols.length; i++) {
        const v = vals[i] ?? '';
        if (/^NULL$/i.test(v)) {
          row[cols[i]] = null;
        } else {
          row[cols[i]] = this.params[pIdx++];
        }
      }
      const idKey = cols[0];
      if (idKey) t.set(String(row[idKey]), row);
      return { success: true, meta: { changes: 1 } };
    }
    if (/^UPDATE/i.test(this.sql.trim())) {
      const m = this.sql.match(/SET\s+([\s\S]+?)\s+WHERE\s+(.+)$/i);
      if (!m) return { success: true, meta: { changes: 0 } };
      const setClause = m[1];
      const whereClause = m[2];
      // Parse SET assignments — split on ',' not inside expressions
      const setParts = setClause.split(',').map((s) => s.trim().split(/\s*=\s*/));
      // Parse WHERE — only handle 'col = ?' (single) for now
      const whereMatch = whereClause.match(/(\w+)\s*=\s*\?/);
      if (!whereMatch) return { success: true, meta: { changes: 0 } };
      const whereCol = whereMatch[1];
      // Find which param is the WHERE value — it is always the last param.
      const whereVal = this.params[this.params.length - 1];
      let changes = 0;
      for (const row of t.values()) {
        if (String(row[whereCol]) !== String(whereVal)) continue;
        for (const [c, _v] of setParts) {
          const i = setParts.findIndex((p) => p[0] === c);
          if (i >= 0) {
            // The '= ?' position in the bound params: the SET col=? binds
            // appear in order, then the WHERE col=? is last.
            row[c] = this.params[i];
          }
        }
        changes++;
      }
      return { success: true, meta: { changes } };
    }
    return { success: true, meta: { changes: 0 } };
  }
  private tblName(): string | null {
    return (this.sql.match(/\b(?:FROM|INTO|UPDATE|TABLE|INDEX IF NOT EXISTS \w+ ON)\s+(\w+)/i)?.[1]) ?? null;
  }
  private whereClauses(): Array<{ col: string; op: string; val: unknown }> {
    const m = this.sql.match(/WHERE\s+([\s\S]+?)(?:\s+ORDER\s+BY|\s+LIMIT|$)/i);
    if (!m) return [];
    return m[1].split(/\s+AND\s+/i).map((c) => {
      const eq = c.match(/(\w+)\s*(=|LIKE)\s*\?/i);
      if (eq) return { col: eq[1], op: eq[2].toUpperCase(), val: undefined };
      const isNull = c.match(/(\w+)\s+IS\s+NULL/i);
      if (isNull) return { col: isNull[1], op: 'IS NULL', val: undefined };
      return { col: '', op: '', val: undefined };
    });
  }
  private matches(conds: Array<{ col: string; op: string; val: unknown }>, _k: string, row: Record<string, unknown>): boolean {
    if (conds.length === 0) return true;
    for (let i = 0; i < conds.length; i++) {
      const c = conds[i];
      if (c.op === 'IS NULL') {
        if (row[c.col] != null) return false;
      } else {
        if (String(row[c.col]) !== String(this.params[i])) return false;
      }
    }
    return true;
  }
}

function env() { return { BRIEFINGS_DB: new MemDb() as unknown as D1Database }; }

describe('si-shiftlog', () => {
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

  it('openOnly filter excludes closed entries', async () => {
    const { shiftlogCreate, shiftlogClose, shiftlogList } = await import('./si-shiftlog');
    const e = env();
    const a = await shiftlogCreate(e, { shift: 'morning', author: 'a' });
    await shiftlogCreate(e, { shift: 'morning', author: 'a' });
    await shiftlogClose(e, a.id);
    const open = await shiftlogList(e, { openOnly: true });
    expect(open.length).toBe(1);
  });
});
