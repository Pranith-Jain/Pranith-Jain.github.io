import { describe, it, expect } from 'vitest';
import { touchDedup, getDedup } from '../../../src/case-study/storage/dedup';

function mockKV() {
  const store = new Map<string, { value: string; ttl?: number }>();
  return {
    store,
    async get(key: string, type?: 'json') {
      const e = store.get(key);
      if (!e) return null;
      return type === 'json' ? JSON.parse(e.value) : e.value;
    },
    async put(key: string, value: string, opts?: { expirationTtl?: number }) {
      store.set(key, { value, ttl: opts?.expirationTtl });
    },
  };
}

describe('dedup storage', () => {
  it('touchDedup writes with 90-day TTL', async () => {
    const ns = mockKV() as any;
    await touchDedup(ns, 'cve-2026-1234', new Date('2026-05-14T00:00:00Z'));
    const rec = await getDedup(ns, 'cve-2026-1234');
    expect(rec?.lastSeenAt).toBe('2026-05-14T00:00:00.000Z');
    expect(ns.store.get('meta:dedup:cve-2026-1234')?.ttl).toBe(90 * 24 * 3600);
  });

  it('touchDedup with publishedSlug retains it', async () => {
    const ns = mockKV() as any;
    await touchDedup(ns, 'cve-2026-1234', new Date(), 'cve-2026-1234-fortinet');
    const rec = await getDedup(ns, 'cve-2026-1234');
    expect(rec?.publishedSlug).toBe('cve-2026-1234-fortinet');
  });

  it('getDedup returns null for unknown key', async () => {
    const ns = mockKV() as any;
    expect(await getDedup(ns, 'nope')).toBeNull();
  });
});
