import { SELF } from 'cloudflare:test';
import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(() => vi.restoreAllMocks());

describe('GET /api/v1/exposure/scan', () => {
  it('rejects missing domain', async () => {
    const r = await SELF.fetch('https://x/api/v1/exposure/scan');
    expect(r.status).toBe(400);
  });

  it('rejects invalid domain', async () => {
    const r = await SELF.fetch('https://x/api/v1/exposure/scan?domain=zzz');
    expect(r.status).toBe(400);
  });

  it('returns aggregated payload', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([])));
    const r = await SELF.fetch('https://x/api/v1/exposure/scan?domain=example.com');
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body.domain).toBe('example.com');
    expect(body.subdomains).toBeDefined();
    expect(body.score).toBeDefined();
    expect(body.shodan_enabled).toBe(false);
  });
});
