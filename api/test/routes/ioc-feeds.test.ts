import { SELF } from 'cloudflare:test';
import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(() => vi.restoreAllMocks());

const CISA_MOCK = JSON.stringify({
  vulnerabilities: [
    {
      cveID: 'CVE-2026-00001',
      vendorProject: 'TestVendor',
      product: 'TestProduct',
      vulnerabilityName: 'Test RCE',
      dateAdded: '2026-05-01',
    },
  ],
});

const URLHAUS_MOCK = [
  '# comment',
  '"1","2026-05-08 12:00:00","http://example.com/evil","online","","malware","","https://urlhaus.abuse.ch/url/1/","reporter1"',
].join('\n');

describe('GET /api/v1/feeds/ioc-summary', () => {
  it('returns 400 when source param is missing', async () => {
    const r = await SELF.fetch('https://x/api/v1/feeds/ioc-summary');
    expect(r.status).toBe(400);
    const body = (await r.json()) as { error: string; valid_sources: string[] };
    expect(body.error).toMatch(/missing source/i);
    expect(Array.isArray(body.valid_sources)).toBe(true);
  });

  it('returns 400 for unknown source', async () => {
    const r = await SELF.fetch('https://x/api/v1/feeds/ioc-summary?source=unknown-source');
    expect(r.status).toBe(400);
    const body = (await r.json()) as { error: string };
    expect(body.error).toMatch(/unknown source/i);
  });

  it('returns 200 with normalized JSON for cisa-kev (mocked upstream)', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, _init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
      if (url.includes('cisa.gov')) {
        return new Response(CISA_MOCK, {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return fetch(input, _init);
    });

    const r = await SELF.fetch('https://x/api/v1/feeds/ioc-summary?source=cisa-kev');
    expect(r.status).toBe(200);
    const body = (await r.json()) as {
      source: string;
      count: number;
      entries: Array<{ type: string; value: string }>;
      cache_control_seconds: number;
    };
    expect(body.source).toBe('cisa-kev');
    expect(body.count).toBe(1);
    expect(body.entries[0].type).toBe('cve');
    expect(body.entries[0].value).toBe('CVE-2026-00001');
    expect(body.cache_control_seconds).toBe(1800);
    // Cache-Control header should be set
    expect(r.headers.get('cache-control')).toContain('1800');
  });

  it('returns 200 with normalized JSON for urlhaus (mocked upstream)', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, _init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
      if (url.includes('urlhaus.abuse.ch')) {
        return new Response(URLHAUS_MOCK, {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        });
      }
      return fetch(input, _init);
    });

    const r = await SELF.fetch('https://x/api/v1/feeds/ioc-summary?source=urlhaus');
    expect(r.status).toBe(200);
    const body = (await r.json()) as { source: string; count: number; entries: Array<{ type: string }> };
    expect(body.source).toBe('urlhaus');
    expect(body.count).toBe(1);
    expect(body.entries[0].type).toBe('url');
  });

  it('returns 502 when upstream fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, _init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
      if (url.includes('openphish.com')) {
        return new Response('Service Unavailable', { status: 503 });
      }
      return fetch(input, _init);
    });

    const r = await SELF.fetch('https://x/api/v1/feeds/ioc-summary?source=openphish');
    expect(r.status).toBe(502);
  });
});
