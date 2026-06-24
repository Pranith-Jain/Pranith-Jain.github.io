import { describe, it, expect } from 'vitest';
import { createBatchedCachedVerify } from '../../src/lib/verify-url-cache';
import type { LinkStatus } from '../../src/lib/verify-url';

/** In-memory KV stub matching the single-blob get/put surface used by the cache. */
function fakeKv(initial: Record<string, unknown> = {}) {
  const store = new Map<string, string>(Object.entries(initial).map(([k, v]) => [k, JSON.stringify(v)]));
  let gets = 0;
  let puts = 0;
  return {
    gets: () => gets,
    puts: () => puts,
    raw: store,
    kv: {
      get: async (key: string, _type: 'json') => {
        gets++;
        const v = store.get(key);
        return v ? JSON.parse(v) : null;
      },
      put: async (key: string, value: string) => {
        puts++;
        store.set(key, value);
      },
    },
  };
}

/** A prober that records which urls it was asked to check and returns a fixed verdict. */
function recordingVerify(verdict: (url: string) => LinkStatus) {
  const seen: string[][] = [];
  const fn = async (urls: string[]) => {
    seen.push(urls);
    return new Map(urls.map((u) => [u, verdict(u)] as const));
  };
  return { fn, seen };
}

const KEY = 'urlcache:v1';

describe('createBatchedCachedVerify', () => {
  it('reads the cache once and writes once regardless of URL count', async () => {
    const { kv, gets, puts } = fakeKv();
    const prober = recordingVerify(() => 'ok');
    const verify = createBatchedCachedVerify({ kv, nowMs: 1_000_000, verify: prober.fn });
    await verify(['https://a.example/1', 'https://b.example/2', 'https://c.example/3']);
    expect(gets()).toBe(1);
    expect(puts()).toBe(1);
  });

  it('returns a fresh cached verdict without re-probing', async () => {
    const now = 1_000_000_000;
    const { kv } = fakeKv({
      [KEY]: { 'https://a.example/1': { s: 'ok', exp: now + 60_000 } },
    });
    const prober = recordingVerify(() => 'broken');
    const verify = createBatchedCachedVerify({ kv, nowMs: now, verify: prober.fn });
    const out = await verify(['https://a.example/1']);
    expect(out.get('https://a.example/1')).toBe('ok'); // from cache, not the prober
    expect(prober.seen.flat()).toEqual([]); // prober never called
  });

  it('probes only the cache-misses', async () => {
    const now = 1_000_000_000;
    const { kv } = fakeKv({
      [KEY]: { 'https://cached.example/x': { s: 'ok', exp: now + 60_000 } },
    });
    const prober = recordingVerify(() => 'ok');
    const verify = createBatchedCachedVerify({ kv, nowMs: now, verify: prober.fn });
    await verify(['https://cached.example/x', 'https://fresh.example/y']);
    expect(prober.seen.flat()).toEqual(['https://fresh.example/y']);
  });

  it('re-probes an expired cache entry', async () => {
    const now = 1_000_000_000;
    const { kv } = fakeKv({
      [KEY]: { 'https://stale.example/x': { s: 'ok', exp: now - 1 } }, // expired
    });
    const prober = recordingVerify(() => 'broken');
    const verify = createBatchedCachedVerify({ kv, nowMs: now, verify: prober.fn });
    const out = await verify(['https://stale.example/x']);
    expect(prober.seen.flat()).toEqual(['https://stale.example/x']);
    expect(out.get('https://stale.example/x')).toBe('broken');
  });

  it('caches ok longer than unchecked (asymmetric TTL)', async () => {
    const now = 1_000_000_000;
    const { kv, raw } = fakeKv();
    const prober = recordingVerify((u) => (u.includes('good') ? 'ok' : 'unchecked'));
    const verify = createBatchedCachedVerify({
      kv,
      nowMs: now,
      verify: prober.fn,
      ttl: { ok: 1000, broken: 500, unchecked: 60 },
    });
    await verify(['https://good.example/x', 'https://flaky.example/y']);
    const blob = JSON.parse(raw.get(KEY)!) as Record<string, { s: LinkStatus; exp: number }>;
    const okExp = blob['https://good.example/x']!.exp;
    const uncheckedExp = blob['https://flaky.example/y']!.exp;
    expect(okExp).toBe(now + 1000 * 1000);
    expect(uncheckedExp).toBe(now + 60 * 1000);
    expect(okExp).toBeGreaterThan(uncheckedExp);
  });

  it('degrades to a direct probe when KV is missing/throws (no cache, still verifies)', async () => {
    const throwingKv = {
      get: async () => {
        throw new Error('kv down');
      },
      put: async () => {
        throw new Error('kv down');
      },
    };
    const prober = recordingVerify(() => 'ok');
    const verify = createBatchedCachedVerify({ kv: throwingKv, nowMs: 1, verify: prober.fn });
    const out = await verify(['https://a.example/1']);
    expect(out.get('https://a.example/1')).toBe('ok'); // still works
  });
});
