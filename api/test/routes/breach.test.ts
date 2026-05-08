import { SELF } from 'cloudflare:test';
import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(() => {
  vi.restoreAllMocks();
});

const SAMPLE_HIBP_RESPONSE = `0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n001D04836D2BB07D55F0ECA5F1B14CCF:2\r\n0020C62B2B8A1BF54E2ABA2F97D2C2DBE:5`;

describe('GET /api/v1/breach/range', () => {
  it('returns 400 on missing prefix', async () => {
    const r = await SELF.fetch('https://x/api/v1/breach/range');
    expect(r.status).toBe(400);
    const body = (await r.json()) as { error: string };
    expect(body.error).toBe('missing_param');
  });

  it('returns 400 on invalid prefix (too short)', async () => {
    const r = await SELF.fetch('https://x/api/v1/breach/range?prefix=21BD');
    expect(r.status).toBe(400);
    const body = (await r.json()) as { error: string };
    expect(body.error).toBe('invalid_prefix');
  });

  it('returns 400 on invalid prefix (non-hex)', async () => {
    const r = await SELF.fetch('https://x/api/v1/breach/range?prefix=ZZZXX');
    expect(r.status).toBe(400);
    const body = (await r.json()) as { error: string };
    expect(body.error).toBe('invalid_prefix');
  });

  it('returns 200 text/plain on valid prefix', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(SAMPLE_HIBP_RESPONSE, {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        })
    );
    const r = await SELF.fetch('https://x/api/v1/breach/range?prefix=21BD1');
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Type')).toContain('text/plain');
    const body = await r.text();
    expect(body).toContain('0018A45C4D1DEF81644B54AB7F969B88D65:1');
  });

  it('accepts lowercase hex prefix', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      // Verify prefix is uppercased when calling upstream
      expect(url).toContain('21BD1');
      return new Response(SAMPLE_HIBP_RESPONSE, { status: 200 });
    });
    const r = await SELF.fetch('https://x/api/v1/breach/range?prefix=21bd1');
    expect(r.status).toBe(200);
  });

  it('returns 502 on upstream error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network error'));
    const r = await SELF.fetch('https://x/api/v1/breach/range?prefix=21BD1');
    expect(r.status).toBe(502);
    const body = (await r.json()) as { error: string };
    expect(body.error).toBe('upstream_error');
  });

  it('returns cache-control header', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(SAMPLE_HIBP_RESPONSE, { status: 200 }));
    const r = await SELF.fetch('https://x/api/v1/breach/range?prefix=21BD1');
    expect(r.headers.get('Cache-Control')).toBe('public, max-age=3600');
  });
});
