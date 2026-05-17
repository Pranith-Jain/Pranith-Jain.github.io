import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
// import the mounted app via SELF for end-to-end behavior
import { SELF } from 'cloudflare:test';

describe('rate limiter', () => {
  it('passes through when count is under limit', async () => {
    // Use unique IP to avoid collisions with other tests
    const r = await SELF.fetch('https://x/api/v1/health', { headers: { 'cf-connecting-ip': '198.51.100.1' } });
    expect(r.status).toBe(200);
  });

  it('blocks after 30 requests in a window', async () => {
    const ip = '198.51.100.99';
    // Pre-seed the KV bucket
    const bucket = Math.floor(Date.now() / 1000 / 60);
    await env.KV_CACHE.put(`rl:${bucket}:${ip}`, '30', { expirationTtl: 120 });
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
    const bucket = Math.floor(Date.now() / 1000 / 60);
    await env.KV_CACHE.put(`rl:${bucket}:${ip}`, '999', { expirationTtl: 120 });
    for (const path of ['/api/v1/blog/posts', '/api/v1/briefings/list?limit=5', '/api/v1/briefings/daily-2026-05-16']) {
      const r = await SELF.fetch(`https://x${path}`, { headers: { 'cf-connecting-ip': ip } });
      expect(r.status).not.toBe(429); // bypassed: no rate-limit KV read/write
    }
  });

  it('still rate-limits the admin briefing mutations (token brute-force guard)', async () => {
    const ip = '198.51.100.66';
    const bucket = Math.floor(Date.now() / 1000 / 60);
    await env.KV_CACHE.put(`rl:${bucket}:${ip}`, '30', { expirationTtl: 120 });
    const r = await SELF.fetch('https://x/api/v1/briefings/build?type=daily', {
      method: 'POST',
      headers: { 'cf-connecting-ip': ip },
    });
    expect(r.status).toBe(429);
  });
});
