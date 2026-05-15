import { SELF } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';

describe('GET /api/v1/rl/:resource', () => {
  afterEach(() => vi.restoreAllMocks());

  it('404s an unknown resource without calling upstream', async () => {
    const res = await SELF.fetch('https://example.com/api/v1/rl/bogus?cb=' + Date.now());
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string; allowed: string[] };
    expect(body.error).toBe('unknown_resource');
    expect(body.allowed).toContain('stats');
  });

  it('503s when the API key is not configured (test env has no secret)', async () => {
    const res = await SELF.fetch('https://example.com/api/v1/rl/stats?cb=' + Date.now());
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('not_configured');
  });

  it('400s a csirt request with no country arg', async () => {
    const res = await SELF.fetch('https://example.com/api/v1/rl/csirt?cb=' + Date.now());
    // arg check happens before the key check, so this is 400 not 503.
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('arg_required');
  });
});
