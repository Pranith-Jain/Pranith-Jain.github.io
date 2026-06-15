import { describe, it, expect } from 'vitest';

// Reuse the MemDb shim from si-shiftlog.test.ts
class MemDb {
  tables: Record<string, Map<string, Record<string, unknown>>> = {};
  prepare(sql: string) { return new Stmt(this, sql); }
}
class Stmt {
  constructor(public db: MemDb, public sql: string) {}
  bind(...args: unknown[]) { this.params = args; return this; }
  params: unknown[] = [];
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
    if (this.sql.includes('WHERE') && this.params.length) {
      // very basic: column = ?
      const col = (this.sql.match(/(\w+)\s*=\s*\?/)?.[1]) ?? '';
      const val = this.params[0];
      rows = rows.filter((r) => String(r[col]) === String(val));
    }
    if (this.sql.match(/ORDER BY (\w+) DESC/i)) {
      const col = this.sql.match(/ORDER BY (\w+) DESC/i)![1];
      rows.sort((a, b) => String(b[col]).localeCompare(String(a[col])));
    }
    const lim = Number(this.sql.match(/LIMIT (\d+)/i)?.[1] ?? '1000');
    return { results: rows.slice(0, lim) };
  }
  async run() {
    const m = (this.sql.match(/(?:INSERT INTO|UPDATE|DELETE FROM)\s+(\w+)/i) ?? [])[1];
    if (!m) return { success: true };
    const tbl = this.db.tables[m] ?? (this.db.tables[m] = new Map());
    if (this.sql.startsWith('INSERT')) {
      const cols = (this.sql.match(/\(([^)]+)\)\s*VALUES/i)?.[1] ?? '').split(',').map((s) => s.trim());
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
    }
    return { success: true, meta: { changes: 1 } };
  }
}

function env() {
  return { BRIEFINGS_DB: new MemDb() as unknown as D1Database };
}

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
    const { promptVaultList, promptVaultRate, promptVaultGet } = await import('./si-promptvault');
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

  it('list query filter finds prompts by tag or text', async () => {
    const { promptVaultList } = await import('./si-promptvault');
    const e = env();
    const kql = await promptVaultList(e, { tag: 'kql' });
    expect(kql.length).toBeGreaterThan(0);
    const all = await promptVaultList(e, { q: 'sigma' });
    expect(all.length).toBeGreaterThan(0);
  });

  it('returns null when getting unknown slug', async () => {
    const { promptVaultGet } = await import('./si-promptvault');
    const e = env();
    const r = await promptVaultGet(e, 'no-such-prompt');
    expect(r).toBeNull();
  });
});
