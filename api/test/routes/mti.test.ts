import { SELF } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';

describe('GET /api/v1/mti', () => {
  afterEach(() => vi.restoreAllMocks());

  it('400s an unknown source without calling upstream', async () => {
    const res = await SELF.fetch('https://example.com/api/v1/mti?source=bogus&cb=' + Date.now());
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; allowed: string[] };
    expect(body.error).toBe('unknown_source');
    expect(body.allowed).toContain('iocs');
  });

  it('503s when the token is not configured (test env has no secret)', async () => {
    const res = await SELF.fetch('https://example.com/api/v1/mti?source=iocs&cb=' + Date.now());
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('not_configured');
  });

  it('defaults to the iocs source and still 503s without a token', async () => {
    const res = await SELF.fetch('https://example.com/api/v1/mti?cb=' + Date.now());
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('not_configured');
  });
});
