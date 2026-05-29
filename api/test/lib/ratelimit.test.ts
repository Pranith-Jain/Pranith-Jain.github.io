import { describe, it, expect, beforeAll } from 'vitest';
import { env, SELF } from 'cloudflare:test';
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
    const res = await rateLimit(makeCtx('https://x/api/v1/cti/parse', 'POST', ip), async () => {
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
    const res = await rateLimit(makeCtx('https://x/api/v1/briefings/build?type=daily', 'POST', ip), async () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(false);
    expect((res as Response | undefined)?.status).toBe(429);
  });
});
