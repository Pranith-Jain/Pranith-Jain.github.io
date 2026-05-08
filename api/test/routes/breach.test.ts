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

// ─── Email handler ────────────────────────────────────────────────────────────

describe('GET /api/v1/breach/email', () => {
  it('400 on missing email', async () => {
    const r = await SELF.fetch('https://x/api/v1/breach/email');
    expect(r.status).toBe(400);
    const body = (await r.json()) as { error: string };
    expect(body.error).toBe('missing_param');
  });

  it('400 on invalid email (no @)', async () => {
    const r = await SELF.fetch('https://x/api/v1/breach/email?email=notanemail');
    expect(r.status).toBe(400);
    const body = (await r.json()) as { error: string };
    expect(body.error).toBe('invalid_email');
  });

  it('400 on invalid email (just @)', async () => {
    const r = await SELF.fetch('https://x/api/v1/breach/email?email=%40domain.com');
    expect(r.status).toBe(400);
  });

  it('returns found=false when XposedOrNot reports no breaches (null ExposedBreaches)', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(JSON.stringify({ ExposedBreaches: null, BreachesSummary: { site: '' } }), { status: 200 })
    );
    const r = await SELF.fetch('https://x/api/v1/breach/email?email=clean@example.com');
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body.found).toBe(false);
    expect(body.breach_count).toBe(0);
    expect(body.source).toBe('xposedornot');
  });

  it('returns found=false when XposedOrNot returns Error: Not found style response', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response(JSON.stringify({ Error: 'Not found' }), { status: 200 })
    );
    const r = await SELF.fetch('https://x/api/v1/breach/email?email=clean@example.com');
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body.found).toBe(false);
    expect(body.breach_count).toBe(0);
  });

  it('parses XposedOrNot breach-analytics response', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            ExposedBreaches: {
              breaches_details: [
                {
                  breach: 'LinkedIn',
                  details: 'desc',
                  domain: 'linkedin.com',
                  logo: 'https://xposedornot.com/static/logos/Linkedin.png',
                  industry: 'IT',
                  password_risk: 'easytocrack',
                  references: '',
                  searchable: 'Yes',
                  verified: 'Yes',
                  xposed_date: '2012',
                  xposed_records: 164000000,
                  xposed_data: 'emails;passwords',
                },
              ],
            },
          }),
          { status: 200 }
        )
    );
    const r = await SELF.fetch('https://x/api/v1/breach/email?email=test@linkedin.com');
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body.found).toBe(true);
    expect(body.source).toBe('xposedornot');
    expect(body.breach_count).toBe(1);
    const breaches = body.breaches as Array<Record<string, unknown>>;
    expect(breaches[0].name).toBe('LinkedIn');
    expect(breaches[0].domain).toBe('linkedin.com');
    expect(breaches[0].breach_date).toBe('2012');
    expect(breaches[0].pwn_count).toBe(164000000);
    expect(breaches[0].data_classes).toEqual(['emails', 'passwords']);
  });

  it('returns cache-control on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response(JSON.stringify({ ExposedBreaches: null }), { status: 200 })
    );
    const r = await SELF.fetch('https://x/api/v1/breach/email?email=test@example.com');
    expect(r.headers.get('Cache-Control')).toBe('public, max-age=3600');
  });

  it('falls back to LeakCheck on XposedOrNot 5xx', async () => {
    let calls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      calls++;
      if (url.includes('xposedornot.com')) return new Response('boom', { status: 503 });
      if (url.includes('leakcheck.io')) {
        return new Response(
          JSON.stringify({
            success: true,
            found: 2,
            sources: [
              { name: 'A', date: '2019' },
              { name: 'B', date: '2020' },
            ],
            fields: ['email', 'password'],
          }),
          { status: 200 }
        );
      }
      return new Response('{}', { status: 200 });
    });
    const r = await SELF.fetch('https://x/api/v1/breach/email?email=test@example.com');
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body.source).toBe('leakcheck');
    expect(body.breach_count).toBe(2);
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it('returns 502 when both upstreams fail', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network error'));
    const r = await SELF.fetch('https://x/api/v1/breach/email?email=test@example.com');
    expect(r.status).toBe(502);
  });
});

// ─── Domain handler ───────────────────────────────────────────────────────────

describe('GET /api/v1/breach/domain', () => {
  it('400 on missing domain', async () => {
    const r = await SELF.fetch('https://x/api/v1/breach/domain');
    expect(r.status).toBe(400);
    const body = (await r.json()) as { error: string };
    expect(body.error).toBe('missing_param');
  });

  it('400 on invalid domain', async () => {
    const r = await SELF.fetch('https://x/api/v1/breach/domain?domain=not_a_domain');
    expect(r.status).toBe(400);
    const body = (await r.json()) as { error: string };
    expect(body.error).toBe('invalid_domain');
  });

  it('400 on domain with spaces', async () => {
    const r = await SELF.fetch('https://x/api/v1/breach/domain?domain=bad%20domain.com');
    expect(r.status).toBe(400);
  });

  it('returns breaches for a known domain', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            status: 'success',
            message: null,
            exposedBreaches: [
              {
                breachID: 'LinkedIn',
                breachedDate: '2012-05-01T00:00:00+00:00',
                domain: 'linkedin.com',
                industry: 'Information Technology',
                logo: 'https://xposedornot.com/static/logos/Linkedin.png',
                exposedData: ['Email addresses', 'Passwords'],
                exposedRecords: 160042644,
                exposureDescription: 'LinkedIn 2012 breach',
              },
            ],
          }),
          { status: 200 }
        )
    );
    const r = await SELF.fetch('https://x/api/v1/breach/domain?domain=linkedin.com');
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body.found).toBe(true);
    expect(body.source).toBe('xposedornot');
    const breaches = body.breaches as Array<Record<string, unknown>>;
    expect(breaches.length).toBeGreaterThan(0);
    expect(breaches[0].name).toBe('LinkedIn');
    expect(breaches[0].breach_date).toBe('2012-05-01');
    expect(breaches[0].pwn_count).toBe(160042644);
  });

  it('returns found=false when no breaches for domain', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(JSON.stringify({ status: 'success', message: null, exposedBreaches: [] }), { status: 200 })
    );
    const r = await SELF.fetch('https://x/api/v1/breach/domain?domain=clean-domain.com');
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body.found).toBe(false);
    expect(body.breach_count).toBe(0);
  });

  it('returns cache-control on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(JSON.stringify({ status: 'success', message: null, exposedBreaches: [] }), { status: 200 })
    );
    const r = await SELF.fetch('https://x/api/v1/breach/domain?domain=example.com');
    expect(r.headers.get('Cache-Control')).toBe('public, max-age=3600');
  });

  it('falls back to LeakCheck on XposedOrNot 5xx', async () => {
    let calls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      calls++;
      if (url.includes('xposedornot.com')) return new Response('boom', { status: 503 });
      if (url.includes('leakcheck.io')) {
        return new Response(
          JSON.stringify({
            success: true,
            found: 1,
            sources: [{ name: 'SomeBreach', date: '2020' }],
            fields: ['email'],
          }),
          { status: 200 }
        );
      }
      return new Response('{}', { status: 200 });
    });
    const r = await SELF.fetch('https://x/api/v1/breach/domain?domain=example.com');
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body.source).toBe('leakcheck');
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it('returns 502 when both upstreams fail', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network error'));
    const r = await SELF.fetch('https://x/api/v1/breach/domain?domain=example.com');
    expect(r.status).toBe(502);
  });
});
