/**
 * Tests for the Security Investigator per-provider rate limiter.
 * Run via: npx vitest run worker/lib/si-rate-limit.test.ts
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createSiRateLimiter, PROVIDER_QUOTAS } from './si-rate-limit';

function makeFakeKv(): KVNamespace & { _store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    _store: store,
    get: async (k: string) => store.get(k) ?? null,
    getWithMetadata: async (k: string) => ({ value: store.get(k) ?? null, metadata: null }),
    put: async (k: string, v: string) => { store.set(k, v); },
    delete: async (k: string) => { store.delete(k); },
    list: async () => ({ keys: [], list_complete: true, cursor: '' }),
  } as unknown as KVNamespace & { _store: Map<string, string> };
}

describe('createSiRateLimiter', () => {
  let kv: ReturnType<typeof makeFakeKv>;
  let fixedNow: number;
  beforeEach(() => { kv = makeFakeKv(); fixedNow = 1_700_000_000_000; });

  it('allows the first N calls under the limit', async () => {
    const limiter = createSiRateLimiter(kv, () => fixedNow);
    // shodan free tier is 5/day in the conservative config.
    for (let i = 0; i < PROVIDER_QUOTAS.shodan.maxPerWindow; i++) {
      const d = await limiter.consume('shodan');
      expect(d.allowed).toBe(true);
      expect(d.count).toBe(i + 1);
      expect(d.remaining).toBe(PROVIDER_QUOTAS.shodan.maxPerWindow - (i + 1));
    }
  });

  it('blocks the (N+1)th call within the window', async () => {
    const limiter = createSiRateLimiter(kv, () => fixedNow);
    for (let i = 0; i < PROVIDER_QUOTAS.shodan.maxPerWindow; i++) {
      await limiter.consume('shodan');
    }
    const blocked = await limiter.consume('shodan');
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('rolls over the window at fixedNow + windowMs', async () => {
    const limiter = createSiRateLimiter(kv, () => fixedNow);
    // Burn the shodan quota.
    for (let i = 0; i < PROVIDER_QUOTAS.shodan.maxPerWindow; i++) {
      await limiter.consume('shodan');
    }
    expect((await limiter.consume('shodan')).allowed).toBe(false);
    // Advance past the window.
    const advanced = fixedNow + PROVIDER_QUOTAS.shodan.windowMs + 1;
    const limiter2 = createSiRateLimiter(kv, () => advanced);
    expect((await limiter2.consume('shodan')).allowed).toBe(true);
  });

  it('keys providers independently', async () => {
    const limiter = createSiRateLimiter(kv, () => fixedNow);
    // Burn abuseipdb (limit 1000/day).
    for (let i = 0; i < 3; i++) await limiter.consume('abuseipdb');
    // shodan should be unaffected.
    expect((await limiter.consume('shodan')).allowed).toBe(true);
    expect((await limiter.peek('shodan')).count).toBe(1);
  });

  it('skips rate-limited disabled providers (shodan-internetdb)', async () => {
    const limiter = createSiRateLimiter(kv, () => fixedNow);
    for (let i = 0; i < 50; i++) {
      const d = await limiter.consume('shodan-internetdb');
      expect(d.allowed).toBe(true);
    }
    // The fake KV should have nothing for shodan-internetdb.
    const keys = Array.from(kv._store.keys()).filter((k) => k.startsWith('rl:shodan-internetdb'));
    expect(keys).toHaveLength(0);
  });

  it('peek reports remaining without consuming', async () => {
    const limiter = createSiRateLimiter(kv, () => fixedNow);
    await limiter.consume('ipinfo');
    await limiter.consume('ipinfo');
    const peeked = await limiter.peek('ipinfo');
    expect(peeked.count).toBe(2);
    expect(peeked.remaining).toBe(PROVIDER_QUOTAS.ipinfo.maxPerWindow - 2);
  });

  it('allows everything when KV is undefined (degraded mode)', async () => {
    const limiter = createSiRateLimiter(undefined, () => fixedNow);
    for (let i = 0; i < 2000; i++) {
      expect((await limiter.consume('abuseipdb')).allowed).toBe(true);
    }
  });

  it('reset clears the current and previous window', async () => {
    const limiter = createSiRateLimiter(kv, () => fixedNow);
    await limiter.consume('vpnapi');
    await limiter.consume('vpnapi');
    expect((await limiter.peek('vpnapi')).count).toBe(2);
    await limiter.reset('vpnapi');
    expect((await limiter.peek('vpnapi')).count).toBe(0);
  });
});
