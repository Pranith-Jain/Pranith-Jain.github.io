import { SELF } from 'cloudflare:test';
import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(() => {
  vi.restoreAllMocks();
});

const mockOverviewData = {
  data: {
    holder: 'GOOGLE',
    type: 'LIR',
    is_announced: true,
    block: {
      resource: '15169',
      desc: 'ARIN',
      name: 'ARIN',
    },
  },
};

const mockPrefixData = {
  data: {
    prefixes: [
      { prefix: '8.8.8.0/24' },
      { prefix: '8.8.4.0/24' },
      { prefix: '34.64.0.0/10' },
      { prefix: '2001:4860::/32' },
    ],
  },
};

const mockWhoisData = {
  data: {
    records: [
      [
        { key: 'abuse-mailbox', value: 'network-abuse@google.com' },
        { key: 'aut-num', value: 'AS15169' },
      ],
    ],
  },
};

function mockRipeStat() {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes('announced-prefixes')) {
      return new Response(JSON.stringify(mockPrefixData), { status: 200 });
    }
    if (url.includes('as-overview')) {
      return new Response(JSON.stringify(mockOverviewData), { status: 200 });
    }
    if (url.includes('whois')) {
      return new Response(JSON.stringify(mockWhoisData), { status: 200 });
    }
    return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
  });
}

describe('GET /api/v1/asn/lookup', () => {
  it('returns 400 on missing asn param', async () => {
    const r = await SELF.fetch('https://x/api/v1/asn/lookup');
    expect(r.status).toBe(400);
    const body = (await r.json()) as { error: string };
    expect(body.error).toMatch(/missing/i);
  });

  it('returns 400 on invalid asn format', async () => {
    const r = await SELF.fetch('https://x/api/v1/asn/lookup?asn=NOT_AN_ASN');
    expect(r.status).toBe(400);
    const body = (await r.json()) as { error: string };
    expect(body.error).toMatch(/invalid/i);
  });

  it('returns 200 with valid asn (numeric)', async () => {
    mockRipeStat();
    const r = await SELF.fetch('https://x/api/v1/asn/lookup?asn=15169');
    expect(r.status).toBe(200);
    const body = (await r.json()) as { asn: number; name: string; prefixes_v4: number; prefixes_v6: number };
    expect(body.asn).toBe(15169);
    expect(body.name).toBe('GOOGLE');
    expect(body.prefixes_v4).toBe(3);
    expect(body.prefixes_v6).toBe(1);
  });

  it('returns 200 with valid asn (AS prefix)', async () => {
    mockRipeStat();
    const r = await SELF.fetch('https://x/api/v1/asn/lookup?asn=AS15169');
    expect(r.status).toBe(200);
    const body = (await r.json()) as { asn: number };
    expect(body.asn).toBe(15169);
  });

  it('returns 200 with case-insensitive AS prefix', async () => {
    mockRipeStat();
    const r = await SELF.fetch('https://x/api/v1/asn/lookup?asn=as15169');
    expect(r.status).toBe(200);
    const body = (await r.json()) as { asn: number };
    expect(body.asn).toBe(15169);
  });

  it('returns abuse contacts from whois data', async () => {
    mockRipeStat();
    const r = await SELF.fetch('https://x/api/v1/asn/lookup?asn=15169');
    expect(r.status).toBe(200);
    const body = (await r.json()) as { abuse_contacts: string[] };
    expect(body.abuse_contacts).toContain('network-abuse@google.com');
  });

  it('returns rir info from overview block', async () => {
    mockRipeStat();
    const r = await SELF.fetch('https://x/api/v1/asn/lookup?asn=15169');
    expect(r.status).toBe(200);
    const body = (await r.json()) as { rir: { name: string } };
    expect(body.rir.name).toBe('ARIN');
  });

  it('returns 502 on upstream error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network error'));
    const r = await SELF.fetch('https://x/api/v1/asn/lookup?asn=15169');
    expect(r.status).toBe(502);
  });

  it('returns cache-control header', async () => {
    mockRipeStat();
    const r = await SELF.fetch('https://x/api/v1/asn/lookup?asn=15169');
    expect(r.headers.get('Cache-Control')).toBe('public, max-age=86400');
  });
});
