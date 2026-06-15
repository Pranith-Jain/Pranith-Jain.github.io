import { describe, it, expect } from 'vitest';

// Richer D1 shim (same as si-shiftlog tests).
class MemDb {
  tables: Record<string, Map<string, Record<string, unknown>>> = {};
  prepare(sql: string) { return new Stmt(this, sql); }
}
class Stmt {
  constructor(public db: MemDb, public sql: string) {}
  params: unknown[] = [];
  bind(...args: unknown[]) { this.params = args; return this; }
  then<TResult1 = unknown, TResult2 = never>(onFulfilled?: ((v: unknown) => TResult1 | PromiseLike<TResult1>) | null, onRejected?: ((e: unknown) => TResult2 | PromiseLike<TResult2>) | null): Promise<unknown> {
    return this.run().then(onFulfilled as any, onRejected as any);
  }
  async first() {
    const tbl = (this.sql.match(/FROM\s+(\w+)/i) ?? [])[1];
    const t = this.db.tables[tbl!];
    if (!t) return null;
    const conds = (this.sql.match(/WHERE\s+([\s\S]+?)(?:\s+ORDER|\s+LIMIT|$)/i)?.[1] ?? '').split(/\s+AND\s+/i);
    for (const [, v] of t) {
      let ok = true;
      for (let i = 0; i < conds.length; i++) {
        const col = conds[i].match(/(\w+)\s*=\s*\?/)?.[1];
        if (col && String(v[col]) !== String(this.params[i])) { ok = false; break; }
      }
      if (ok) return v;
    }
    return null;
  }
  async all() {
    const tbl = (this.sql.match(/FROM\s+(\w+)/i) ?? [])[1];
    console.log('SHIM ALL:', this.sql.slice(0, 200), '→', tbl);
    const t = this.db.tables[tbl!];
    if (!t) return { results: [] };
    let rows = Array.from(t.values());
    if (this.sql.match(/WHERE/i)) {
      const where = (this.sql.match(/WHERE\s+([\s\S]+?)(?:\s+ORDER|\s+LIMIT|$)/i)?.[1] ?? '');
      const conds = where.split(/\s+AND\s+/i);
      rows = rows.filter((v) => {
        for (let i = 0; i < conds.length; i++) {
          const c = conds[i];
          const eq = c.match(/(\w+)\s*=\s*\?/);
          if (eq) {
            if (String(v[eq[1]]) !== String(this.params[i])) return false;
            continue;
          }
          const like = c.match(/\((\w+)\s+LIKE\s+\?|\s+(\w+)\s+LIKE\s+\?\)/i);
          if (like) {
            // skip — too complex for shim
            continue;
          }
        }
        return true;
      });
    }
    const om = this.sql.match(/ORDER BY (\w+)(?:\s+(ASC|DESC))?/i);
    if (om) {
      const col = om[1];
      const dir = (om[2] ?? 'ASC').toUpperCase();
      rows.sort((a, b) => {
        const av = String(a[col] ?? ''), bv = String(b[col] ?? '');
        return dir === 'DESC' ? bv.localeCompare(av) : av.localeCompare(bv);
      });
    }
    const lim = Number(this.sql.match(/LIMIT (\d+)/i)?.[1] ?? '1000');
    return { results: rows.slice(0, lim) };
  }
  async run() {
    if (/^CREATE\b/i.test(this.sql.trim())) return { success: true, meta: { changes: 0 } };
    const tbl = (this.sql.match(/(?:INSERT INTO|UPDATE)\s+(\w+)/i) ?? [])[1];
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
      const m = this.sql.match(/SET\s+([\s\S]+?)\s+WHERE\s+(\w+)\s*=\s*\?/i);
      if (!m) return { success: true, meta: { changes: 0 } };
      const setCols = m[1].split(',').map((s) => s.trim().split(/\s*=\s*/)[0].trim());
      const whereCol = m[2];
      const whereVal = this.params[this.params.length - 1];
      let changes = 0;
      for (const row of t.values()) {
        if (String(row[whereCol]) === String(whereVal)) {
          setCols.forEach((c, i) => { row[c] = this.params[i]; });
          changes++;
        }
      }
      return { success: true, meta: { changes } };
    }
    return { success: true, meta: { changes: 0 } };
  }
}

function env() { return { BRIEFINGS_DB: new MemDb() as unknown as D1Database }; }

describe('si-promptvault', () => {
  it('seeds default prompts on first list', async () => {
    const { promptVaultList } = await import('./si-promptvault');
    const e = env();
    const all = await promptVaultList(e);
    expect(all.length).toBeGreaterThanOrEqual(10);
    const slugs = all.map((p) => p.slug);
    expect(slugs).toContain('sigma-rule-from-narrative');
    expect(slugs).toContain('kql-hunt-from-ioc');
  });

  it('filters by category', async () => {
    const { promptVaultList } = await import('./si-promptvault');
    const e = env();
    const det = await promptVaultList(e, { category: 'detection-engineering' });
    expect(det.every((p) => p.category === 'detection-engineering')).toBe(true);
  });

  it('creates a new prompt and rejects invalid category', async () => {
    const { promptVaultCreate } = await import('./si-promptvault');
    const e = env();
    const created = await promptVaultCreate(e, {
      slug: 'my-custom-prompt',
      title: 'My Custom Prompt',
      category: 'detection-engineering',
      tags: ['test'],
      author: 'alice',
      body: 'You are a test prompt.',
    });
    expect(created.id).toMatch(/^pv_/);
    expect(created.version).toBe(1);

    await expect(promptVaultCreate(e, {
      slug: 'invalid',
      title: 'X',
      category: 'fake-cat',
      author: 'a',
      body: 'b',
    })).rejects.toThrow(/Invalid category/);
  });

  it('rejects invalid slug format', async () => {
    const { promptVaultCreate } = await import('./si-promptvault');
    const e = env();
    await expect(promptVaultCreate(e, {
      slug: 'Has Spaces',
      title: 'X',
      category: 'general',
      author: 'a',
      body: 'b',
    })).rejects.toThrow(/slug/);
  });

  it('rates a prompt and updates the average', async () => {
    const { promptVaultRate, promptVaultGet } = await import('./si-promptvault');
    const e = env();
    const r1 = await promptVaultRate(e, { slug: 'sigma-rule-from-narrative', rating: 5 });
    const r2 = await promptVaultRate(e, { slug: 'sigma-rule-from-narrative', rating: 3 });
    expect(r1?.ratingCount).toBe(1);
    expect(r2?.ratingCount).toBe(2);
    expect(r2?.ratingAvg).toBe(4);
    const got = await promptVaultGet(e, 'sigma-rule-from-narrative');
    expect(got?.ratingCount).toBe(2);
  });

  it('rejects out-of-range rating', async () => {
    const { promptVaultRate } = await import('./si-promptvault');
    const e = env();
    await expect(promptVaultRate(e, { slug: 'sigma-rule-from-narrative', rating: 7 })).rejects.toThrow(/integer 1\.\.5/);
    await expect(promptVaultRate(e, { slug: 'sigma-rule-from-narrative', rating: 0 })).rejects.toThrow();
  });

  it('returns null when getting unknown slug', async () => {
    const { promptVaultGet } = await import('./si-promptvault');
    const e = env();
    const r = await promptVaultGet(e, 'no-such-prompt');
    expect(r).toBeNull();
  });

  it('list returns all categories by default', async () => {
    const { promptVaultCategories } = await import('./si-promptvault');
    const cats = promptVaultCategories();
    expect(cats).toContain('detection-engineering');
    expect(cats).toContain('threat-hunting');
    expect(cats.length).toBeGreaterThan(10);
  });
});
