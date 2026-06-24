import { describe, it, expect } from 'vitest';
import { extractOnionHostname, isValidOnionAddress, parseHtmlBasic, tor2webUrl } from './darknet';

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

describe('parseHtmlBasic', () => {
  it('extracts title from HTML', () => {
    const { title } = parseHtmlBasic('<html><head><title>Test Page</title></head></html>');
    expect(title).toBe('Test Page');
  });

  it('extracts links from HTML', () => {
    const { links } = parseHtmlBasic('<a href="http://example.onion/page">click here</a>');
    expect(links).toHaveLength(1);
    expect(links[0].href).toBe('http://example.onion/page');
    expect(links[0].text).toBe('click here');
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
