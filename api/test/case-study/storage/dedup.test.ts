import { describe, it, expect } from 'vitest';
import { touchDedup, getDedup, touchDedupMany, loadDedupMap } from '../../../src/case-study/storage/dedup';

function mockKV() {
  const store = new Map<string, string>();
  let lists = 0;
  let gets = 0;
  return {
    store,
    stats: () => ({ lists, gets }),
    async get(key: string, type?: 'json') {
      gets += 1;
      const v = store.get(key);
      if (v === undefined) return null;
      return type === 'json' ? JSON.parse(v) : v;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async list({ prefix }: { prefix: string; cursor?: string }) {
      lists += 1;
      const keys = [...store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name }));
      return { keys, list_complete: true, cursor: '' };
    },
  };
}

describe('dedup blob storage', () => {
  it('round-trips via the single index blob (no per-key entries)', async () => {
    const ns = mockKV() as any;
    await touchDedup(ns, 'cve-2026-1234', new Date('2026-05-14T00:00:00Z'));
    const rec = await getDedup(ns, 'cve-2026-1234');
    expect(rec?.lastSeenAt).toBe('2026-05-14T00:00:00.000Z');
    expect(ns.store.has('meta:dedup-index')).toBe(true);
    expect(ns.store.has('meta:dedup:cve-2026-1234')).toBe(false);
  });

  it('retains publishedSlug across touches', async () => {
    const ns = mockKV() as any;
    await touchDedup(ns, 'k1', new Date(), 'k1-slug');
    await touchDedup(ns, 'k1', new Date()); // later touch without slug
    expect((await getDedup(ns, 'k1'))?.publishedSlug).toBe('k1-slug');
  });

  it('touchDedupMany marks every key in ONE read + ONE write', async () => {
    const ns = mockKV() as any;
    await ns.put('meta:dedup-index', '{}'); // seed blob so no legacy scan
    const before = ns.stats();
    await touchDedupMany(ns, ['a', 'b', 'c'], new Date('2026-05-14T00:00:00Z'));
    const after = ns.stats();
    expect(after.gets - before.gets).toBe(1); // one load for the whole batch
    const map = await loadDedupMap(ns);
    expect(Object.keys(map).sort()).toEqual(['a', 'b', 'c']);
  });

  it('seeds the blob once from legacy meta:dedup:* keys', async () => {
    const ns = mockKV() as any;
    ns.store.set('meta:dedup:legacy-1', JSON.stringify({ lastSeenAt: '2026-05-10T00:00:00.000Z' }));
    const map = await loadDedupMap(ns); // blob absent -> legacy scan + persist
    expect(map['legacy-1']?.lastSeenAt).toBe('2026-05-10T00:00:00.000Z');
    expect(ns.store.has('meta:dedup-index')).toBe(true);
    const listsAfterSeed = ns.stats().lists;
    await loadDedupMap(ns); // blob present now -> no further list scans
    expect(ns.stats().lists).toBe(listsAfterSeed);
  });

  it('getDedup returns null for unknown key', async () => {
    const ns = mockKV() as any;
    await ns.put('meta:dedup-index', '{}');
    expect(await getDedup(ns, 'nope')).toBeNull();
  });

  it('prunes entries older than 90 days on save', async () => {
    const ns = mockKV() as any;
    await ns.put('meta:dedup-index', '{}');
    const now = new Date('2026-05-14T00:00:00Z');
    await touchDedup(ns, 'old', new Date('2026-01-01T00:00:00Z')); // >90d before `now`
    await touchDedupMany(ns, ['fresh'], now);
    const map = await loadDedupMap(ns);
    expect(map['fresh']).toBeDefined();
    expect(map['old']).toBeUndefined();
  });
});
