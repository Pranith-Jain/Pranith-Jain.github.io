import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';
import { rateLimit } from '../../src/lib/ratelimit';

/**
 * Seed the per-IP rate-limit counter in Cache API so the test doesn't
 * need to make 30 real requests. The bucket key mirrors the formula
 * in lib/ratelimit.ts.
 */
async function seedRateLimit(ip: string, count: number): Promise<void> {
  const bucket = Math.floor(Date.now() / 1000 / 60);
  const key = new Request(`https://rl.internal/u/${bucket}/${encodeURIComponent(ip)}`);
  // Miniflare exposes caches.default in the test environment.
  await caches.default.put(key, new Response(String(count), { headers: { 'cache-control': 'max-age=60' } }));
}

/**
 * Minimal Hono-Context stub for exercising rateLimit directly in the test
 * isolate. We can't drive the over-limit path through SELF.fetch:
 * vitest-pool-workers gives the SELF worker a SEPARATE caches.default from the
 * test scope, so a seeded counter is invisible across that boundary. Calling
 * rateLimit() here runs it in the same isolate that seeded the cache.
 */
function makeCtx(url: string, method: string, ip: string) {
  return {
    req: {
      url,
      method,
      header: (name: string) => (name.toLowerCase() === 'cf-connecting-ip' ? ip : undefined),
    },
    env: {},
    executionCtx: { waitUntil: () => {} },
    json: (body: unknown, status?: number, headers?: Record<string, string>) =>
      new Response(JSON.stringify(body), {
        status: status ?? 200,
        headers: { 'content-type': 'application/json', ...(headers ?? {}) },
      }),
  } as unknown as Parameters<typeof rateLimit>[0];
}

describe('rate limiter', () => {
  it('passes through when count is under limit', async () => {
    const r = await SELF.fetch('https://x/api/v1/health', { headers: { 'cf-connecting-ip': '198.51.100.1' } });
    expect(r.status).toBe(200);
  });

  it('blocks after 30 requests in a window', async () => {
    const ip = '198.51.100.99';
    await seedRateLimit(ip, 30);

    let nextCalled = false;
    const res = await rateLimit(makeCtx('https://api.example.com/api/v1/cti/parse', 'POST', ip), async () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(false);
    expect((res as Response | undefined)?.status).toBe(429);
    const body = (await (res as Response).json()) as Record<string, unknown>;
    expect(body.error).toBe('rate_limited');
  });

  it('bypasses edge-cached read endpoints even when over the limit', async () => {
    const ip = '198.51.100.77';
    await seedRateLimit(ip, 999);

    for (const path of ['/api/v1/blog/posts', '/api/v1/briefings/list?limit=5', '/api/v1/briefings/daily-2026-05-16']) {
      const r = await SELF.fetch(`https://x${path}`, { headers: { 'cf-connecting-ip': ip } });
      expect(r.status).not.toBe(429); // bypassed: read-only endpoint
    }
  });

  it('still rate-limits the admin briefing mutations (token brute-force guard)', async () => {
    const ip = '198.51.100.66';
    await seedRateLimit(ip, 30);

    // 429 from the global limiter before the admin token check — the
    // brute-force guard on BRIEFINGS_ADMIN_TOKEN.
    let nextCalled = false;
    const res = await rateLimit(
      makeCtx('https://api.example.com/api/v1/briefings/build?type=daily', 'POST', ip),
      async () => {
        nextCalled = true;
      }
    );
    expect(nextCalled).toBe(false);
    expect((res as Response | undefined)?.status).toBe(429);
  });
});

describe('rate limiter — keyed callers get 4x headroom', () => {
  // Run rateLimit with a ctx whose executionCtx.waitUntil work is AWAITED inside
  // the test — otherwise the under-limit path's background cache.put runs after
  // the test and trips vitest-pool-workers' isolated-storage guard. `keyed` adds
  // the `user` that authenticate() sets for a valid API key.
  async function run(url: string, method: string, ip: string, keyed: boolean) {
    const ctx = makeCtx(url, method, ip) as unknown as {
      user?: unknown;
      executionCtx: { waitUntil: (p: Promise<unknown>) => void };
    };
    if (keyed) ctx.user = { id: 'k1', role: 'readonly' };
    const pending: Promise<unknown>[] = [];
    ctx.executionCtx = { waitUntil: (p) => pending.push(p) };
    let nextCalled = false;
    const res = await rateLimit(ctx as unknown as Parameters<typeof rateLimit>[0], async () => {
      nextCalled = true;
    });
    await Promise.allSettled(pending);
    return { res: res as Response | undefined, nextCalled };
  }

  it('keyed caller passes the keyless limit (30)', async () => {
    await seedRateLimit('198.51.100.50', 30);
    const { res, nextCalled } = await run('https://api.example.com/api/v1/ioc/check', 'GET', '198.51.100.50', true);
    expect(nextCalled).toBe(true);
    expect(res).toBeUndefined();
  });

  it('keyless caller IS blocked at 30 on the same endpoint', async () => {
    await seedRateLimit('198.51.100.52', 30);
    const { res } = await run('https://api.example.com/api/v1/ioc/check', 'GET', '198.51.100.52', false);
    expect(res?.status).toBe(429);
  });

  it('keyed caller is blocked at the keyed limit (120)', async () => {
    await seedRateLimit('198.51.100.51', 120);
    const { res } = await run('https://api.example.com/api/v1/ioc/check', 'GET', '198.51.100.51', true);
    expect(res?.status).toBe(429);
    const body = (await res!.json()) as Record<string, unknown>;
    expect(body.limit).toBe(120);
  });
});

describe('rate limiter — AI-costly strict bucket (10/min)', () => {
  async function seedAi(ip: string, count: number): Promise<void> {
    const bucket = Math.floor(Date.now() / 1000 / 60);
    const key = new Request(`https://rl.internal/c/${bucket}/${encodeURIComponent(ip)}`);
    await caches.default.put(key, new Response(String(count), { headers: { 'cache-control': 'max-age=60' } }));
  }

  async function run(url: string, method: string, ip: string) {
    const ctx = makeCtx(url, method, ip) as unknown as {
      executionCtx: { waitUntil: (p: Promise<unknown>) => void };
    };
    const pending: Promise<unknown>[] = [];
    ctx.executionCtx = { waitUntil: (p) => pending.push(p) };
    let nextCalled = false;
    const res = await rateLimit(ctx as unknown as Parameters<typeof rateLimit>[0], async () => {
      nextCalled = true;
    });
    await Promise.allSettled(pending);
    return { res: res as Response | undefined, nextCalled };
  }

  it('429s an AI POST at the AI limit with scope ai-costly', async () => {
    const ip = '198.51.100.201';
    await seedAi(ip, 10);
    const { res, nextCalled } = await run('https://api.example.com/api/v1/dossier', 'POST', ip);
    expect(nextCalled).toBe(false);
    expect(res?.status).toBe(429);
    const body = (await res!.json()) as Record<string, unknown>;
    expect(body.limit).toBe(10);
    expect(body.scope).toBe('ai-costly');
  });

  it('covers AI prefixes (copilot) and bypassed-prefix POSTs (briefings feedback)', async () => {
    const ip = '198.51.100.202';
    await seedAi(ip, 10);
    for (const [url, method] of [
      ['https://api.example.com/api/v1/copilot/chat', 'POST'],
      ['https://api.example.com/api/v1/briefings/some-slug/feedback', 'POST'],
      ['https://api.example.com/api/v1/saved-reports', 'POST'],
      ['https://api.example.com/api/v1/auth/register', 'POST'],
    ] as const) {
      const { res } = await run(url, method, ip);
      expect(res?.status).toBe(429);
    }
  });

  it('does not touch GETs on AI paths or unrelated endpoints', async () => {
    const ip = '198.51.100.203';
    await seedAi(ip, 999);
    // GET excluded by method check (parallel SPA loads must not trip it).
    const get = await run('https://api.example.com/api/v1/dossier', 'GET', ip);
    expect(get.nextCalled).toBe(true);
    // Separate namespace: global + admin buckets unaffected by AI burn.
    const other = await run('https://api.example.com/api/v1/cti/parse', 'POST', ip);
    expect(other.nextCalled).toBe(true);
    const admin = await run('https://api.example.com/api/v1/admin/purge', 'POST', ip);
    expect(admin.nextCalled).toBe(true);
  });
});
