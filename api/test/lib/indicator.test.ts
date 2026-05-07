import { describe, it, expect } from 'vitest';
import { detectType, defang, refang } from '../../src/lib/indicator';

describe('detectType', () => {
  it('detects IPv4', () => {
    expect(detectType('8.8.8.8')).toBe('ipv4');
  });
  it('detects IPv6', () => {
    expect(detectType('2001:db8::1')).toBe('ipv6');
  });
  it('detects MD5', () => {
    expect(detectType('d41d8cd98f00b204e9800998ecf8427e')).toBe('hash');
  });
  it('detects SHA-1', () => {
    expect(detectType('da39a3ee5e6b4b0d3255bfef95601890afd80709')).toBe('hash');
  });
  it('detects SHA-256', () => {
    expect(detectType('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')).toBe('hash');
  });
  it('detects domain', () => {
    expect(detectType('example.com')).toBe('domain');
  });
  it('detects URL', () => {
    expect(detectType('https://example.com/foo')).toBe('url');
  });
  it('handles defanged input', () => {
    expect(detectType('8[.]8[.]8[.]8')).toBe('ipv4');
    expect(detectType('hxxps://example[.]com')).toBe('url');
  });
  it('rejects garbage', () => {
    expect(detectType('lol')).toBe('unknown');
    expect(detectType('')).toBe('unknown');
  });
});

describe('defang', () => {
  it('replaces dots in IP', () => {
    expect(defang('8.8.8.8')).toBe('8[.]8[.]8[.]8');
  });
  it('replaces protocol in URL', () => {
    expect(defang('https://example.com/path')).toBe('hxxps://example[.]com/path');
  });
  it('idempotent on defanged input', () => {
    expect(defang('8[.]8[.]8[.]8')).toBe('8[.]8[.]8[.]8');
  });
});

describe('refang', () => {
  it('restores defanged IP', () => {
    expect(refang('8[.]8[.]8[.]8')).toBe('8.8.8.8');
  });
  it('restores defanged URL', () => {
    expect(refang('hxxps://example[.]com')).toBe('https://example.com');
  });
});
