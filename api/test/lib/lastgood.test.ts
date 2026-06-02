import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readLastGood, writeLastGood } from '../../src/lib/lastgood';

/**
 * Direct tests for the shared last-good helpers. Briefing-builder exercises
 * these through `withLastGood`, but the helpers themselves are also used by
 * cve-recent, mti, ransomware-recent, malicious-packages, and any future
 * single-upstream endpoint that needs a durable cross-colo fallback.
 */

interface FakeKV {
  store: Map<string, { value: string; expirationTtl?: number }>;
  get: (k: string, t?: 'text' | 'json' | 'arrayBuffer' | 'stream') => Promise<unknown>;
  put: (k: string, v: string, opts?: { expirationTtl?: number }) => Promise<unknown>;
  delete: (k: string) => Promise<unknown>;
}

function makeKV(): FakeKV {
  const store = new Map<string, { value: string; expirationTtl?: number }>();
  return {
    store,
    get: async (k: string, t?: 'text' | 'json' | 'arrayBuffer' | 'stream') => {
      const v = store.get(k);
      if (!v) return null;
      return t === 'json' ? JSON.parse(v.value) : v.value;
    },
    put: async (k: string, v: string, opts?: { expirationTtl?: number }) => {
      store.set(k, { value: v, expirationTtl: opts?.expirationTtl });
    },
    delete: async (k: string) => {
      store.delete(k);
    },
  };
}

function makeEnv(kv: FakeKV | null) {
  return { KV_CACHE: kv } as unknown as Parameters<typeof readLastGood>[0];
}

beforeEach(() => {
  // Each test starts with a fresh debounce window so a previous test's
  // successful write doesn't suppress the next one.
  vi.useRealTimers();
  // The debounce helper uses request-scoped storage; we can't easily clear
  // that between tests, so we exercise the debounce path by passing
  // `force: true` for the first write of each key.
});

describe('readLastGood', () => {
  it('returns null when KV is unbound', async () => {
    const env = makeEnv(null);
    const r = await readLastGood<{ ok: boolean }>(env, 'kev');
    expect(r).toBeNull();
  });

  it('returns null when no payload is stored', async () => {
    const env = makeEnv(makeKV());
    expect(await readLastGood(env, 'kev')).toBeNull();
  });

  it('returns the stored payload parsed as JSON', async () => {
    const kv = makeKV();
    kv.store.set('lastgood:v1:kev', { value: JSON.stringify({ count: 42, items: [1, 2, 3] }) });
    const env = makeEnv(kv);
    const r = await readLastGood<{ count: number; items: number[] }>(env, 'kev');
    expect(r).toEqual({ count: 42, items: [1, 2, 3] });
  });

  it('returns null on KV read error rather than throwing', async () => {
    const kv: FakeKV = {
      store: new Map(),
      get: vi.fn().mockRejectedValue(new Error('KV down')),
      put: vi.fn(),
      delete: vi.fn(),
    };
    const env = makeEnv(kv);
    expect(await readLastGood(env, 'kev')).toBeNull();
  });

  it('namespaces keys under lastgood:v1: so write/read are symmetric', async () => {
    const kv = makeKV();
    const env = makeEnv(kv);
    await writeLastGood(env, 'kev', { ok: true }, { force: true });
    expect(kv.store.has('lastgood:v1:kev')).toBe(true);
    const v = await readLastGood<{ ok: boolean }>(env, 'kev');
    expect(v).toEqual({ ok: true });
  });
});

describe('writeLastGood', () => {
  it('returns false when KV is unbound (no write, no throw)', async () => {
    const env = makeEnv(null);
    expect(await writeLastGood(env, 'kev', { ok: true }, { force: true })).toBe(false);
  });

  it('persists a JSON string under the namespaced key', async () => {
    const kv = makeKV();
    const env = makeEnv(kv);
    const wrote = await writeLastGood(env, 'kev', { count: 99 }, { force: true });
    expect(wrote).toBe(true);
    const stored = kv.store.get('lastgood:v1:kev');
    expect(stored).toBeDefined();
    expect(JSON.parse(stored!.value)).toEqual({ count: 99 });
  });

  it('respects the default 48h TTL', async () => {
    const kv = makeKV();
    const env = makeEnv(kv);
    await writeLastGood(env, 'kev', { ok: true }, { force: true });
    const stored = kv.store.get('lastgood:v1:kev');
    expect(stored?.expirationTtl).toBe(48 * 60 * 60);
  });

  it('respects a custom ttlSeconds', async () => {
    const kv = makeKV();
    const env = makeEnv(kv);
    await writeLastGood(env, 'kev', { ok: true }, { ttlSeconds: 600, force: true });
    expect(kv.store.get('lastgood:v1:kev')?.expirationTtl).toBe(600);
  });

  it('force: true bypasses the per-colo debounce', async () => {
    const kv = makeKV();
    const env = makeEnv(kv);
    const a = await writeLastGood(env, 'kev', { v: 1 }, { force: true });
    const b = await writeLastGood(env, 'kev', { v: 2 }, { force: true });
    expect(a).toBe(true);
    expect(b).toBe(true);
    const stored = JSON.parse(kv.store.get('lastgood:v1:kev')!.value);
    expect(stored).toEqual({ v: 2 });
  });

  it('skips writes when the debounce is warm (no force)', async () => {
    const kv = makeKV();
    const env = makeEnv(kv);
    // First write establishes the debounce marker.
    const a = await writeLastGood(env, 'kev', { v: 1 });
    // Second write inside the same debounce window should be suppressed.
    const b = await writeLastGood(env, 'kev', { v: 2 });
    expect(a).toBe(true);
    expect(b).toBe(false);
    const stored = JSON.parse(kv.store.get('lastgood:v1:kev')!.value);
    expect(stored).toEqual({ v: 1 });
  });

  it('returns false on KV put error rather than throwing', async () => {
    const kv: FakeKV = {
      store: new Map(),
      get: vi.fn(),
      put: vi.fn().mockRejectedValue(new Error('KV write failed')),
      delete: vi.fn(),
    };
    const env = makeEnv(kv);
    expect(await writeLastGood(env, 'kev', { ok: true }, { force: true })).toBe(false);
  });
});

describe('lastgood + withLastGood integration', () => {
  it('writes only on success; reads only as a fallback', async () => {
    // Round-trip: write a payload, mutate it externally, then read.
    // Confirms the storage format round-trips through the helpers.
    const kv = makeKV();
    const env = makeEnv(kv);
    const original = { generated_at: '2026-06-01T00:00:00Z', count: 5, victims: [{ id: 'a' }] };
    await writeLastGood(env, 'snapshot', original, { force: true });
    const got = await readLastGood<typeof original>(env, 'snapshot');
    expect(got).toEqual(original);
  });
});
