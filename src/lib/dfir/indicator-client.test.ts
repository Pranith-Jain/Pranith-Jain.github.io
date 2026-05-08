import { describe, it, expect } from 'vitest';
import { detectType, detectHashSubtype } from './indicator-client';

describe('detectHashSubtype', () => {
  it('detects MD5', () => {
    expect(detectHashSubtype('d41d8cd98f00b204e9800998ecf8427e')).toBe('md5');
  });
  it('detects SHA-1', () => {
    expect(detectHashSubtype('da39a3ee5e6b4b0d3255bfef95601890afd80709')).toBe('sha1');
  });
  it('detects SHA-256', () => {
    expect(detectHashSubtype('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')).toBe('sha256');
  });
  it('returns null for non-hash', () => {
    expect(detectHashSubtype('not a hash')).toBeNull();
    expect(detectHashSubtype('abc123')).toBeNull();
  });
  it('case insensitive', () => {
    expect(detectHashSubtype('D41D8CD98F00B204E9800998ECF8427E')).toBe('md5');
  });
});

describe('detectType', () => {
  it('still returns hash (not a subtype) for hash inputs', () => {
    expect(detectType('d41d8cd98f00b204e9800998ecf8427e')).toBe('hash');
    expect(detectType('da39a3ee5e6b4b0d3255bfef95601890afd80709')).toBe('hash');
    expect(detectType('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')).toBe('hash');
  });
});
