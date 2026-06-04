import { describe, it, expect } from 'vitest';
import { suppressDedupMany, isKeySuppressed, loadDedupMap, saveDedupMap } from '../../src/case-study/storage/dedup';
import type { DedupRecord } from '../../src/case-study/types';

function mockKv() {
  const store = new Map<string, string>();
  return {
    async get(k: string, t?: 'json') {
      const v = store.get(k);
      if (v === undefined) return null;
      return t === 'json' ? JSON.parse(v) : v;
    },
    async put(k: string, v: string) {
      store.set(k, v);
    },
    async delete(k: string) {
      store.delete(k);
    },
    async list() {
      return { keys: [], list_complete: true, cursor: '' };
    },
  } as any;
}

const REPUBLISH_MS = 60 * 24 * 3600 * 1000;

describe('suppression', () => {
  it('isKeySuppressed: future suppressedUntil hard-suppresses', () => {
    const now = new Date('2026-06-04T00:00:00Z');
    const rec: DedupRecord = { lastSeenAt: now.toISOString(), suppressedUntil: '2026-07-01T00:00:00Z' };
    expect(isKeySuppressed(rec, now, REPUBLISH_MS)).toBe(true);
  });

  it('isKeySuppressed: expired suppressedUntil does not suppress (unpublished)', () => {
    const now = new Date('2026-06-04T00:00:00Z');
    const rec: DedupRecord = { lastSeenAt: '2026-06-01T00:00:00Z', suppressedUntil: '2026-06-02T00:00:00Z' };
    expect(isKeySuppressed(rec, now, REPUBLISH_MS)).toBe(false);
  });

  it('isKeySuppressed: published key still hard-suppressed within republish window', () => {
    const now = new Date('2026-06-04T00:00:00Z');
    const rec: DedupRecord = { lastSeenAt: '2026-06-03T00:00:00Z', publishedSlug: 'x' };
    expect(isKeySuppressed(rec, now, REPUBLISH_MS)).toBe(true);
  });

  it('isKeySuppressed: null record is never suppressed', () => {
    expect(isKeySuppressed(null, new Date(), REPUBLISH_MS)).toBe(false);
  });

  it('suppressDedupMany persists suppressedUntil and survives prune', async () => {
    const ns = mockKv();
    const now = new Date('2026-06-04T00:00:00Z');
    const until = new Date('2026-07-04T00:00:00Z');
    await suppressDedupMany(ns, ['cve-2026-1', 'cve-2026-2'], until, now);
    const map = await loadDedupMap(ns);
    expect(map['cve-2026-1']!.suppressedUntil).toBe(until.toISOString());
    expect(map['cve-2026-2']!.suppressedUntil).toBe(until.toISOString());
  });

  it('prune keeps a stale-lastSeenAt record while its suppression is active, drops one without', async () => {
    const ns = mockKv();
    const now = new Date('2026-06-04T00:00:00Z');
    // saveDedupMap applies prune against `now`. Both records were last seen
    // 6 years ago (well past the 90-day window); only the suppressed one
    // should survive.
    await saveDedupMap(
      ns,
      {
        'old-but-suppressed': { lastSeenAt: '2020-01-01T00:00:00Z', suppressedUntil: '2026-07-04T00:00:00Z' },
        'old-and-stale': { lastSeenAt: '2020-01-01T00:00:00Z' },
      },
      now
    );
    const map = await loadDedupMap(ns);
    expect(map['old-but-suppressed']).toBeDefined();
    expect(map['old-and-stale']).toBeUndefined();
  });
});
