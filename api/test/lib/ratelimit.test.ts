import { describe, it, expect, beforeAll } from 'vitest';
import { env, SELF } from 'cloudflare:test';

/**
 * Seed the per-IP rate-limit counter in Cache API so the test doesn't
 * need to make 30 real requests. The bucket key mirrors the formula
 * in lib/ratelimit.ts.
 */
async function seedRateLimit(ip: string, count: number): Promise<void> {
  const bucket = Math.floor(Date.now() / 1000 / 60);
  const key = new Request(`https://rl.internal/u/${bucket}/${encodeURIComponent(ip)}`);
  // Miniflare exposes caches.default in the test environment.
  await caches.default.put(
    key,
    new Response(String(count), { headers: { 'cache-control': 'max-age=60' } })
  );
}

describe('rate limiter', () => {
  it('passes through when count is under limit', async () => {
    const r = await SELF.fetch('https://x/api/v1/health', { headers: { 'cf-connecting-ip': '198.51.100.1' } });
    expect(r.status).toBe(200);
  });

  it('blocks after 30 requests in a window', async () => {
    const ip = '198.51.100.99';
    await seedRateLimit(ip, 30);

    const r = await SELF.fetch('https://x/api/v1/cti/parse', {
      method: 'POST',
      headers: { 'cf-connecting-ip': ip, 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'bundle', id: 'b', objects: [] }),
    });
    expect(r.status).toBe(429);
    const body = (await r.json()) as Record<string, unknown>;
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

    const r = await SELF.fetch('https://x/api/v1/briefings/build?type=daily', {
      method: 'POST',
      headers: { 'cf-connecting-ip': ip },
    });
    // 429 from rate limiter before the handler checks ADMIN_TOKEN.
    // If the test returns 403 instead, the rate-limit seed is not
    // being picked up (check Cache API compatibility in this env).
    expect(r.status).toBe(429);
  });
});
