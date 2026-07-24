/**
 * Tests for the Security Investigator per-provider rate limiter.
 * Run via: npx vitest run worker/lib/si-rate-limit.test.ts
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSiRateLimiter, PROVIDER_QUOTAS } from './si-rate-limit';

function makeFakeCache(): Cache & { _store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    _store: store,
    match: async (req: Request | string) => {
      const key = typeof req === 'string' ? req : req.url;
      const val = store.get(key);
      if (val === undefined) return undefined;
      return new Response(val);
    },
    put: async (req: Request | string, res: Response) => {
      const key = typeof req === 'string' ? req : req.url;
      const body = await res.text();
      store.set(key, body);
    },
    delete: async (req: Request | string) => {
      const key = typeof req === 'string' ? req : req.url;
      store.delete(key);
    },
    add: async () => {},
    addAll: async () => {},
  } as unknown as Cache & { _store: Map<string, string> };
}

describe('createSiRateLimiter', () => {
  let fakeCache: ReturnType<typeof makeFakeCache>;
  let fixedNow: number;

  beforeEach(() => {
    fakeCache = makeFakeCache();
    fixedNow = 1_700_000_000_000;
    // Mock caches.default
    vi.stubGlobal('caches', { default: fakeCache });
  });

  it('allows the first N calls under the limit', async () => {
    const limiter = createSiRateLimiter(undefined, () => fixedNow);
    for (let i = 0; i < PROVIDER_QUOTAS.shodan.maxPerWindow; i++) {
      const d = await limiter.consume('shodan');
      expect(d.allowed).toBe(true);
      expect(d.count).toBe(i + 1);
      expect(d.remaining).toBe(PROVIDER_QUOTAS.shodan.maxPerWindow - (i + 1));
    }
  });

  it('blocks the (N+1)th call within the window', async () => {
    const limiter = createSiRateLimiter(undefined, () => fixedNow);
    for (let i = 0; i < PROVIDER_QUOTAS.shodan.maxPerWindow; i++) {
      await limiter.consume('shodan');
    }
    const blocked = await limiter.consume('shodan');
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('rolls over the window at fixedNow + windowMs', async () => {
    const limiter = createSiRateLimiter(undefined, () => fixedNow);
    for (let i = 0; i < PROVIDER_QUOTAS.shodan.maxPerWindow; i++) {
      await limiter.consume('shodan');
    }
    expect((await limiter.consume('shodan')).allowed).toBe(false);
    const advanced = fixedNow + PROVIDER_QUOTAS.shodan.windowMs + 1;
    const limiter2 = createSiRateLimiter(undefined, () => advanced);
    expect((await limiter2.consume('shodan')).allowed).toBe(true);
  });

  it('keys providers independently', async () => {
    const limiter = createSiRateLimiter(undefined, () => fixedNow);
    for (let i = 0; i < 3; i++) await limiter.consume('abuseipdb');
    expect((await limiter.consume('shodan')).allowed).toBe(true);
    expect((await limiter.peek('shodan')).count).toBe(1);
  });

  it('skips rate-limited disabled providers (shodan-internetdb)', async () => {
    const limiter = createSiRateLimiter(undefined, () => fixedNow);
    for (let i = 0; i < 50; i++) {
      const d = await limiter.consume('shodan-internetdb');
      expect(d.allowed).toBe(true);
    }
    const keys = Array.from(fakeCache._store.keys()).filter((k) => k.includes('shodan-internetdb'));
    expect(keys).toHaveLength(0);
  });

  it('peek reports remaining without consuming', async () => {
    const limiter = createSiRateLimiter(undefined, () => fixedNow);
    await limiter.consume('ipinfo');
    await limiter.consume('ipinfo');
    const peeked = await limiter.peek('ipinfo');
    expect(peeked.count).toBe(2);
    expect(peeked.remaining).toBe(PROVIDER_QUOTAS.ipinfo.maxPerWindow - 2);
  });

  it('allows everything when cache is unavailable (degraded mode)', async () => {
    vi.stubGlobal('caches', undefined);
    const limiter = createSiRateLimiter(undefined, () => fixedNow);
    for (let i = 0; i < 2000; i++) {
      expect((await limiter.consume('abuseipdb')).allowed).toBe(true);
    }
  });

  it('reset clears the current and previous window', async () => {
    const limiter = createSiRateLimiter(undefined, () => fixedNow);
    await limiter.consume('vpnapi');
    await limiter.consume('vpnapi');
    expect((await limiter.peek('vpnapi')).count).toBe(2);
    await limiter.reset('vpnapi');
    expect((await limiter.peek('vpnapi')).count).toBe(0);
  });
});
