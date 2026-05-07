import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('GET /api/v1/privacy/inspect', () => {
  it('returns IP from CF-Connecting-IP', async () => {
    const r = await SELF.fetch('https://x/api/v1/privacy/inspect', {
      headers: { 'cf-connecting-ip': '203.0.113.5' },
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body.ip).toBe('203.0.113.5');
  });

  it('falls back to x-forwarded-for', async () => {
    const r = await SELF.fetch('https://x/api/v1/privacy/inspect', {
      headers: { 'x-forwarded-for': '203.0.113.10, 203.0.113.11' },
    });
    const body = (await r.json()) as Record<string, unknown>;
    expect(body.ip).toBe('203.0.113.10');
  });

  it('returns "unknown" when no IP header is present', async () => {
    const r = await SELF.fetch('https://x/api/v1/privacy/inspect');
    const body = (await r.json()) as Record<string, unknown>;
    expect(body.ip).toBe('unknown');
  });
});
