import { describe, it, expect, vi } from 'vitest';
import { asnToAsGraph, cidrToPrefixGraph, ipToAsnGraph, __validators } from '../../src/lib/asn-graph';

const { isValidIpv4, isValidCidr, isValidAsn } = __validators;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * Fetch mock that dispatches by URL substring. Each handler runs in
 * `mock.calls` order — first match wins. Add the longest match first.
 */
function buildFetchMock(handlers: Array<{ match: string; body: unknown; status?: number }>): typeof globalThis.fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    for (const h of handlers) {
      if (url.includes(h.match)) return jsonResponse(h.body, h.status ?? 200);
    }
    return new Response('not found', { status: 404 });
  }) as unknown as typeof globalThis.fetch;
}

describe('asn-graph validators', () => {
  it('accepts canonical IPv4 addresses', () => {
    expect(isValidIpv4('1.2.3.4')).toBe(true);
    expect(isValidIpv4('198.51.100.0')).toBe(true);
    expect(isValidIpv4('0.0.0.0')).toBe(true);
    expect(isValidIpv4('255.255.255.255')).toBe(true);
  });

  it('rejects malformed IPv4 addresses', () => {
    expect(isValidIpv4('1.2.3')).toBe(false);
    expect(isValidIpv4('1.2.3.4.5')).toBe(false);
    expect(isValidIpv4('1.2.3.256')).toBe(false);
    expect(isValidIpv4('a.b.c.d')).toBe(false);
    expect(isValidIpv4('')).toBe(false);
    expect(isValidIpv4(' 1.2.3.4')).toBe(false);
  });

  it('accepts well-formed CIDR blocks', () => {
    expect(isValidCidr('0.0.0.0/0')).toBe(true);
    expect(isValidCidr('198.51.100.0/24')).toBe(true);
    expect(isValidCidr('10.0.0.0/8')).toBe(true);
    expect(isValidCidr('1.2.3.4/32')).toBe(true);
  });

  it('rejects malformed CIDR blocks', () => {
    expect(isValidCidr('198.51.100.0')).toBe(false);
    expect(isValidCidr('198.51.100.0/33')).toBe(false);
    expect(isValidCidr('198.51.100/24')).toBe(false);
    expect(isValidCidr('198.51.100.0/-1')).toBe(false);
  });

  it('parses ASN inputs (with and without AS prefix)', () => {
    expect(isValidAsn('13335')).toBe(13335);
    expect(isValidAsn('AS13335')).toBe(13335);
    expect(isValidAsn('as13335')).toBe(13335);
    expect(isValidAsn(' 13335 ')).toBe(13335);
  });

  it('rejects invalid ASN inputs', () => {
    expect(isValidAsn('abc')).toBeNull();
    expect(isValidAsn('-1')).toBeNull();
    expect(isValidAsn('99999999999999')).toBeNull();
    expect(isValidAsn('')).toBeNull();
  });
});

describe('ipToAsnGraph', () => {
  it('returns invalid_ip for malformed IPs', async () => {
    const out = await ipToAsnGraph('not-an-ip');
    expect(out.ip).toBe('not-an-ip');
    expect(out.sources).toEqual(['invalid_ip']);
    expect(out.asn).toBeUndefined();
  });

  it('fuses bgp.tools + RIPE as-overview for a complete record', async () => {
    const f = buildFetchMock([
      {
        match: 'bgp.tools/api/v1/preview',
        body: { asn: 13335, prefix: '1.1.1.0/24', country: 'US', name: 'CLOUDFLARENET', registry: 'ARIN' },
      },
      { match: 'network-info', body: { data: { rir: 'ARIN', block: { resource: '1.1.1.0/24', country: 'US' } } } },
      { match: 'abuse-contact-finder', body: { data: { abuse_contacts: ['abuse@cloudflare.com'] } } },
      { match: 'as-overview', body: { data: { holder: 'Cloudflare, Inc.', country: 'US', block: '1.1.1.0/24' } } },
      {
        match: 'rdap.org',
        body: {
          handle: 'NET-1-1-1-0-1',
          country: 'US',
          entities: [{ roles: ['abuse'], contact: { email: 'rir-abuse@arin.net' } }],
        },
      },
    ]);
    const out = await ipToAsnGraph('1.1.1.1', { fetch: f });
    expect(out.ip).toBe('1.1.1.1');
    expect(out.asn).toBe(13335);
    expect(out.prefix).toBe('1.1.1.0/24');
    expect(out.asn_name).toBe('Cloudflare, Inc.');
    expect(out.asn_country).toBe('US');
    expect(out.rir).toBe('ARIN');
    expect(out.abuse_contact).toBe('abuse@cloudflare.com'); // RIPE wins (set first)
    expect(out.sources).toContain('bgp.tools');
    expect(out.sources).toContain('ripe-network-info');
    expect(out.sources).toContain('ripe-abuse-contact-finder');
    expect(out.sources).toContain('rdap-ip');
  });

  it('survives a total upstream outage (no sources returned)', async () => {
    const f = buildFetchMock([]); // every URL → 404
    const out = await ipToAsnGraph('8.8.8.8', { fetch: f });
    expect(out.ip).toBe('8.8.8.8');
    expect(out.asn).toBeUndefined();
    expect(out.prefix).toBeUndefined();
    expect(out.abuse_contact).toBeUndefined();
    expect(out.sources).toEqual([]);
  });

  it('fills the prefix from RDAP when bgp.tools is down', async () => {
    const f = buildFetchMock([
      // bgp.tools → 404
      { match: 'rdap.org/ip/8.8.8.8', body: { startAddress: '8.8.8.0', endAddress: '8.8.8.255' } },
    ]);
    const out = await ipToAsnGraph('8.8.8.8', { fetch: f });
    expect(out.prefix).toBe('8.8.8.0/24');
    expect(out.sources).toContain('rdap-ip');
  });

  it('falls back to RDAP abuse contact when RIPE returns nothing', async () => {
    const f = buildFetchMock([
      { match: 'bgp.tools/api/v1/preview', body: { asn: 15169, prefix: '8.8.8.0/24' } },
      { match: 'abuse-contact-finder', body: { data: { abuse_contacts: [] } }, status: 200 },
      { match: 'rdap.org', body: { entities: [{ roles: ['abuse'], contact: { email: 'arin-contact@google.com' } }] } },
      { match: 'as-overview', body: { data: { holder: 'Google LLC', country: 'US' } } },
    ]);
    const out = await ipToAsnGraph('8.8.8.8', { fetch: f });
    expect(out.abuse_contact).toBe('arin-contact@google.com');
    expect(out.sources).toContain('rdap-ip');
  });
});

describe('asnToAsGraph', () => {
  it('fuses bgp.tools + RIPE for a complete AS record', async () => {
    const f = buildFetchMock([
      {
        match: 'bgp.tools/api/v1/as/13335',
        body: {
          asn: 13335,
          name: 'CLOUDFLARENET',
          descr: 'Cloudflare, Inc.',
          country: 'US',
          peers: 412,
          prefixes: 1842,
          registry: 'ARIN',
        },
      },
      { match: 'as-overview', body: { data: { holder: 'Cloudflare, Inc.', country: 'US', block: '1.1.1.0/24' } } },
      { match: 'abuse-contact-finder', body: { data: { abuse_contacts: ['abuse@cloudflare.com'] } } },
    ]);
    const out = await asnToAsGraph('AS13335', { fetch: f });
    expect(out.asn).toBe(13335);
    expect(out.name).toBe('CLOUDFLARENET');
    expect(out.descr).toBe('Cloudflare, Inc.');
    expect(out.country).toBe('US');
    expect(out.peer_count).toBe(412);
    expect(out.prefix_count).toBe(1842);
    expect(out.rir).toBe('ARIN');
    expect(out.abuse_contact).toBe('abuse@cloudflare.com');
  });

  it('accepts a bare numeric ASN', async () => {
    const f = buildFetchMock([
      {
        match: 'bgp.tools/api/v1/as/15169',
        body: { asn: 15169, name: 'GOOGLE', country: 'US', peers: 300, prefixes: 500 },
      },
      { match: 'as-overview', body: { data: { holder: 'Google LLC', country: 'US' } } },
    ]);
    const out = await asnToAsGraph(15169, { fetch: f });
    expect(out.asn).toBe(15169);
    expect(out.name).toBe('GOOGLE');
  });

  it('returns invalid_asn for malformed ASN strings', async () => {
    const out = await asnToAsGraph('ASxyz');
    expect(Number.isNaN(out.asn)).toBe(true);
    expect(out.sources).toEqual(['invalid_asn']);
  });

  it('survives a total upstream outage', async () => {
    const f = buildFetchMock([]);
    const out = await asnToAsGraph(13335, { fetch: f });
    expect(out.asn).toBe(13335);
    expect(out.name).toBeUndefined();
    expect(out.peer_count).toBeUndefined();
    expect(out.sources).toEqual([]);
  });

  it('backfills name from RIPE when bgp.tools omits it', async () => {
    const f = buildFetchMock([
      { match: 'bgp.tools/api/v1/as/13335', body: { asn: 13335, peers: 100, prefixes: 50, country: 'US' } },
      { match: 'as-overview', body: { data: { holder: 'Cloudflare, Inc.', country: 'US' } } },
    ]);
    const out = await asnToAsGraph(13335, { fetch: f });
    expect(out.name).toBe('Cloudflare, Inc.');
  });
});

describe('cidrToPrefixGraph', () => {
  it('fuses RIPE prefix-overview + abuse contact + RDAP', async () => {
    const f = buildFetchMock([
      { match: 'prefix-overview', body: { data: { rir: 'ARIN', asns: [{ asn: 13335, holder: 'Cloudflare' }] } } },
      { match: 'abuse-contact-finder', body: { data: { abuse_contacts: ['abuse@cloudflare.com'] } } },
      {
        match: 'rdap.org',
        body: {
          handle: 'NET-198-51-100-0-1',
          parentHandle: 'NET-198-51-100-0-0',
          links: [{ href: 'https://rdap.arin.net/registry/ip/198.51.100.0/24' }],
        },
      },
    ]);
    const out = await cidrToPrefixGraph('198.51.100.0/24', { fetch: f });
    expect(out.prefix).toBe('198.51.100.0/24');
    expect(out.rir).toBe('ARIN');
    expect(out.asn).toBe(13335);
    expect(out.registry_handle).toBe('NET-198-51-100-0-1');
    expect(out.parent).toBe('NET-198-51-100-0-0');
    expect(out.abuse_contact).toBe('abuse@cloudflare.com');
    expect(out.rdap_links).toEqual(['https://rdap.arin.net/registry/ip/198.51.100.0/24']);
    expect(out.sources).toContain('ripe-prefix-overview');
    expect(out.sources).toContain('rdap-ip');
  });

  it('returns invalid_cidr for malformed input', async () => {
    const out = await cidrToPrefixGraph('198.51.100.0');
    expect(out.sources).toEqual(['invalid_cidr']);
  });

  it('skips bgp.tools sampling for /0 (no sample IP available)', async () => {
    const f = buildFetchMock([{ match: 'prefix-overview', body: { data: { rir: 'IANA' } } }]);
    const out = await cidrToPrefixGraph('0.0.0.0/0', { fetch: f });
    expect(out.sources).not.toContain('bgp.tools');
  });

  it('uses bgp.tools for a sampleable /24', async () => {
    const f = buildFetchMock([
      { match: 'prefix-overview', body: { data: {} } },
      { match: 'rdap.org', body: {} },
      { match: 'bgp.tools/api/v1/preview', body: { asn: 13335, registry: 'ARIN' } },
    ]);
    const out = await cidrToPrefixGraph('1.1.1.0/24', { fetch: f });
    expect(out.sources).toContain('bgp.tools');
    expect(out.asn).toBe(13335);
    expect(out.rir).toBe('ARIN');
  });
});
