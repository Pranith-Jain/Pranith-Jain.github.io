import { describe, it, expect } from 'vitest';
import { encode, encodeChain } from './encode';

describe('encode', () => {
  it('base64 encodes', () => {
    expect(encode('hello', 'base64')).toBe('aGVsbG8=');
  });

  it('url-safe base64 omits padding', () => {
    const r = encode('hello', 'urlsafe-base64');
    expect(r).toBe('aGVsbG8');
    expect(r).not.toContain('=');
  });

  it('url encodes', () => {
    expect(encode('a b', 'url')).toBe('a%20b');
  });

  it('hex encodes', () => {
    expect(encode('hello', 'hex')).toBe('68656c6c6f');
  });

  it('binary encodes', () => {
    expect(encode('A', 'binary')).toBe('01000001');
  });

  it('rot13 encodes', () => {
    expect(encode('hello', 'rot13')).toBe('uryyb');
    expect(encode('abcXYZ', 'rot13')).toBe('nopKLM');
  });

  it('round-trips via decoding', () => {
    const original = 'test string 123!@#';

    const hex = encode(original, 'hex');
    const hexDecoded =
      hex
        .match(/.{1,2}/g)
        ?.map((b) => String.fromCharCode(parseInt(b, 16)))
        .join('') ?? '';
    expect(hexDecoded).toBe(original);

    const url = encode(original, 'url');
    expect(decodeURIComponent(url)).toBe(original);

    const rot13 = encode(original, 'rot13');
    expect(encode(rot13, 'rot13')).toBe(original);
  });

  it('returns empty for empty input', () => {
    expect(encode('', 'base64')).toBe('');
  });

  it('default case returns input unchanged', () => {
    expect(encode('test', 'base64' as any)).not.toBe('test');
  });
});

describe('encodeChain', () => {
  it('applies passes left-to-right', () => {
    const steps = encodeChain('hello', ['base64', 'url']);
    expect(steps).toHaveLength(2);
    expect(steps[0].encoding).toBe('base64');
    expect(steps[0].after).toBe('aGVsbG8=');
    expect(steps[1].encoding).toBe('url');
    expect(steps[1].before).toBe('aGVsbG8=');
  });

  it('returns empty array for empty encodings', () => {
    const steps = encodeChain('test', []);
    expect(steps).toHaveLength(0);
  });

  it('each step has before/after', () => {
    const steps = encodeChain('ab', ['hex', 'base64']);
    for (const s of steps) {
      expect(s.before).toBeDefined();
      expect(s.after).toBeDefined();
      expect(s.before).not.toBe(s.after);
    }
  });
});
