import { SELF } from 'cloudflare:test';
import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(() => {
  vi.restoreAllMocks();
});

const mockAsnData = {
  status: 'ok',
  data: {
    asn: 15169,
    name: 'GOOGLE',
    description_short: 'Google LLC',
    country_code: 'US',
    website: 'https://about.google/',
    email_contacts: ['arin-contact@google.com'],
    abuse_contacts: ['network-abuse@google.com'],
    rir_allocation: {
      rir_name: 'ARIN',
      country_code: 'US',
      date_allocated: '2000-03-30',
    },
    date_updated: '2024-01-01',
  },
};

const mockPrefixData = {
  status: 'ok',
  data: {
    ipv4_prefixes: [{ prefix: '8.8.8.0/24' }, { prefix: '8.8.4.0/24' }, { prefix: '34.64.0.0/10' }],
    ipv6_prefixes: [{ prefix: '2001:4860::/32' }],
  },
};

function mockBgpView() {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes('/asn/15169/prefixes')) {
      return new Response(JSON.stringify(mockPrefixData), { status: 200 });
    }
    if (url.includes('/asn/15169')) {
      return new Response(JSON.stringify(mockAsnData), { status: 200 });
    }
    return new Response(JSON.stringify({ status: 'error' }), { status: 404 });
  });
}

describe('GET /api/v1/asn/lookup', () => {
  it('returns 400 on missing asn param', async () => {
    const r = await SELF.fetch('https://x/api/v1/asn/lookup');
    expect(r.status).toBe(400);
    const body = (await r.json()) as { error: string };
    expect(body.error).toBe('missing_param');
  });

  it('returns 400 on invalid asn format', async () => {
    const r = await SELF.fetch('https://x/api/v1/asn/lookup?asn=NOT_AN_ASN');
    expect(r.status).toBe(400);
    const body = (await r.json()) as { error: string };
    expect(body.error).toBe('invalid_asn');
  });

  it('returns 200 with valid asn (numeric)', async () => {
    mockBgpView();
    const r = await SELF.fetch('https://x/api/v1/asn/lookup?asn=15169');
    expect(r.status).toBe(200);
    const body = (await r.json()) as { asn: number; name: string; prefixes_v4: number };
    expect(body.asn).toBe(15169);
    expect(body.name).toBe('GOOGLE');
    expect(body.prefixes_v4).toBe(3);
    expect(body.prefixes_v6).toBe(1);
  });

  it('returns 200 with valid asn (AS prefix)', async () => {
    mockBgpView();
    const r = await SELF.fetch('https://x/api/v1/asn/lookup?asn=AS15169');
    expect(r.status).toBe(200);
    const body = (await r.json()) as { asn: number };
    expect(body.asn).toBe(15169);
  });

  it('returns 200 with case-insensitive AS prefix', async () => {
    mockBgpView();
    const r = await SELF.fetch('https://x/api/v1/asn/lookup?asn=as15169');
    expect(r.status).toBe(200);
    const body = (await r.json()) as { asn: number };
    expect(body.asn).toBe(15169);
  });

  it('returns 502 on upstream error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network error'));
    const r = await SELF.fetch('https://x/api/v1/asn/lookup?asn=15169');
    expect(r.status).toBe(502);
    const body = (await r.json()) as { error: string };
    expect(body.error).toBe('upstream_error');
  });

  it('returns cache-control header', async () => {
    mockBgpView();
    const r = await SELF.fetch('https://x/api/v1/asn/lookup?asn=15169');
    expect(r.headers.get('Cache-Control')).toBe('public, max-age=86400');
  });
});
