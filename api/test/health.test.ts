import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('GET /api/v1/health', () => {
  it('returns 200 with { ok: true }', async () => {
    const response = await SELF.fetch('https://example.com/api/v1/health');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ ok: true });
  });

  it('returns 404 for unknown routes', async () => {
    const response = await SELF.fetch('https://example.com/api/v1/nope');

    expect(response.status).toBe(404);
  });
});
