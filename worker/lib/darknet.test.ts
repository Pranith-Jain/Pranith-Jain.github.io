import { describe, it, expect, vi, afterEach } from 'vitest';
import { btcAbuseCheck, extractOnionHostname, isValidOnionAddress, parseHtmlBasic, tor2webUrl } from './darknet';

const ADDR = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';

describe('isValidOnionAddress', () => {
  it('accepts v2 onion address', () => {
    expect(isValidOnionAddress('facebookwkhpilnemxj7asaniu7vnjjbiltxjqhye3mhbshg7kx5tfyd.onion')).toBe(true);
  });

  it('accepts v3 onion address', () => {
    expect(isValidOnionAddress('2gzyxa5ihm7nsggfxnu52rck2vv4rvmdlkiu3zzui5du4xyclen53wid.onion')).toBe(true);
  });

  it('rejects non-onion strings', () => {
    expect(isValidOnionAddress('example.com')).toBe(false);
    expect(isValidOnionAddress('not-an-onion')).toBe(false);
    expect(isValidOnionAddress('')).toBe(false);
  });

  it('is case sensitive (lowercase only)', () => {
    expect(isValidOnionAddress('FACEBOOKWKPILNEMXJ7ASANIU7VNJJ.BILT...')).toBe(false);
  });
});

describe('extractOnionHostname', () => {
  it('extracts hostname from full URL', () => {
    expect(extractOnionHostname('http://facebookwkhpilnemxj7asaniu7vnjjbiltxjqhye3mhbshg7kx5tfyd.onion/page')).toBe(
      'facebookwkhpilnemxj7asaniu7vnjjbiltxjqhye3mhbshg7kx5tfyd.onion'
    );
  });

  it('accepts bare hostname', () => {
    expect(extractOnionHostname('2gzyxa5ihm7nsggfxnu52rck2vv4rvmdlkiu3zzui5du4xyclen53wid.onion')).toBe(
      '2gzyxa5ihm7nsggfxnu52rck2vv4rvmdlkiu3zzui5du4xyclen53wid.onion'
    );
  });

  it('returns null for invalid input', () => {
    expect(extractOnionHostname('example.com')).toBe(null);
    expect(extractOnionHostname('')).toBe(null);
  });
});

describe('tor2webUrl', () => {
  it('builds correct tor2web URL', () => {
    const result = tor2webUrl('facebookwkhpilnemxj7asaniu7vnjjbiltxjqhye3mhbshg7kx5tfyd.onion', 'tor2web.io');
    expect(result).toBe('https://facebookwkhpilnemxj7asaniu7vnjjbiltxjqhye3mhbshg7kx5tfyd.onion/tor2web.io');
  });

  it('strips protocol prefix from input', () => {
    const result = tor2webUrl('http://example.onion', 'onion.ws');
    expect(result).toBe('https://example.onion/onion.ws');
  });
});

describe('btcAbuseCheck', () => {
  afterEach(() => vi.restoreAllMocks());

  it('degrades gracefully (no throw) when no API key is configured', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const r = await btcAbuseCheck(ADDR);
    expect(r.unavailable).toBe(true);
    expect(r.count).toBe(0);
    expect(r.reports).toHaveLength(0);
    expect(r.note).toMatch(/API key/i);
    // No upstream call should happen without credentials.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('degrades gracefully when ChainAbuse returns 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"message":"Invalid credentials"}', { status: 401 }));
    const r = await btcAbuseCheck(ADDR, 'fake-key');
    expect(r.unavailable).toBe(true);
    expect(r.note).toMatch(/HTTP 401/);
  });

  it('sends HTTP Basic auth with the key as both user and pass', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"reports":[],"count":0}', { status: 200 }));
    await btcAbuseCheck(ADDR, 'k3y');
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const auth = (init.headers as Record<string, string>)['Authorization'];
    expect(auth).toBe(`Basic ${btoa('k3y:k3y')}`);
  });

  it('parses reports on a successful response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ reports: [{ id: '1', address: ADDR, category: 'SCAM' }], count: 1 }), {
        status: 200,
      })
    );
    const r = await btcAbuseCheck(ADDR, 'k3y');
    expect(r.unavailable).toBeUndefined();
    expect(r.count).toBe(1);
    expect(r.reports).toHaveLength(1);
  });

  it('treats 404 as a clean empty result (address not in DB)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 404 }));
    const r = await btcAbuseCheck(ADDR, 'k3y');
    expect(r.unavailable).toBeUndefined();
    expect(r.count).toBe(0);
    expect(r.reports).toHaveLength(0);
  });
});

describe('parseHtmlBasic', () => {
  it('extracts title from HTML', () => {
    const { title } = parseHtmlBasic('<html><head><title>Test Page</title></head></html>');
    expect(title).toBe('Test Page');
  });

  it('extracts links from HTML', () => {
    const { links } = parseHtmlBasic('<a href="http://example.onion/page">click here</a>');
    expect(links).toHaveLength(1);
    expect(links[0]!.href).toBe('http://example.onion/page');
    expect(links[0]!.text).toBe('click here');
  });

  it('extracts body text from HTML', () => {
    const { bodyText } = parseHtmlBasic('<html><body><p>Hello world</p><script>alert(1)</script></body></html>');
    expect(bodyText).toContain('Hello world');
    expect(bodyText).not.toContain('alert');
  });

  it('returns empty strings for empty input', () => {
    const { title, links, bodyText } = parseHtmlBasic('');
    expect(title).toBe('');
    expect(links).toHaveLength(0);
    expect(bodyText).toBe('');
  });
});
