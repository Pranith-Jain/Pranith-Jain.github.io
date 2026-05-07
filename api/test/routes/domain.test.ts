import { SELF } from 'cloudflare:test';
import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(() => vi.restoreAllMocks());

describe('GET /api/v1/domain/lookup', () => {
  it('rejects missing domain', async () => {
    const r = await SELF.fetch('https://x/api/v1/domain/lookup');
    expect(r.status).toBe(400);
  });

  it('rejects invalid domain', async () => {
    const r = await SELF.fetch('https://x/api/v1/domain/lookup?domain=not--a--domain');
    expect(r.status).toBe(400);
  });

  it('aggregates DNS, RDAP, email-auth, CT for valid domain', async () => {
    // Mock all outgoing fetches to return generic 200 JSON.
    // The real route makes many parallel fetches: DoH × 8 standard types, DoH for DMARC/BIMI/TLS-RPT, DoH for ~8 DKIM selectors, RDAP, crt.sh, MTA-STS HTTPS GET.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          Status: 0,
          Answer: [{ name: 'example.com.', type: 16, TTL: 60, data: '"v=spf1 -all"' }],
          events: [],
          entities: [],
          nameservers: [],
          status: [],
        }),
        { status: 200 }
      )
    );

    const r = await SELF.fetch('https://x/api/v1/domain/lookup?domain=example.com');
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body.domain).toBe('example.com');
    expect(body.dns).toBeDefined();
    expect(body.rdap).toBeDefined();
    expect(body.email_auth).toBeDefined();
    expect(body.score).toBeDefined();
    expect(body.certificates).toBeDefined();
  });
});
