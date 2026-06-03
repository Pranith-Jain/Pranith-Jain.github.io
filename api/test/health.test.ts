import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('GET /api/v1/health', () => {
  it('returns 200 with { ok: true }', async () => {
    const response = await SELF.fetch('https://example.com/api/v1/health');

    expect(response.status).toBe(200);
    // The handler returns { ok: true, timestamp } — the timestamp + Cache-Control
    // are intentional (a cacheable liveness probe), so assert ok:true plus a
    // well-formed ISO timestamp rather than exact object equality.
    const body = (await response.json()) as { ok: boolean; timestamp: string };
    expect(body).toMatchObject({ ok: true });
    expect(typeof body.timestamp).toBe('string');
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });

  it('returns 404 for unknown routes', async () => {
    const response = await SELF.fetch('https://example.com/api/v1/nope');

    expect(response.status).toBe(404);
  });
});
