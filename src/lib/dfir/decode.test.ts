import { describe, it, expect } from 'vitest';
import { detectEncoding, decodeBase64, decodeUrl, decodeChain } from './decode';

describe('detectEncoding', () => {
  it('detects base64', () => {
    expect(detectEncoding('SGVsbG8gV29ybGQ=')).toBe('base64');
  });
  it('detects url', () => {
    expect(detectEncoding('hello%20world')).toBe('url');
  });
  it('returns unknown for plain text', () => {
    expect(detectEncoding('hello world')).toBe('unknown');
  });
});

describe('decodeBase64', () => {
  it('decodes ASCII', () => {
    expect(decodeBase64('SGVsbG8gV29ybGQ=')).toEqual({ ok: true, result: 'Hello World' });
  });
  it('decodes url-safe base64', () => {
    expect(decodeBase64('SGVsbG8tV29ybGRf')).toEqual({ ok: true, result: 'Hello-World_' });
  });
  it('returns error on invalid', () => {
    const r = decodeBase64('!!!!');
    expect(r.ok).toBe(false);
  });
});

describe('decodeUrl', () => {
  it('decodes percent-encoded', () => {
    expect(decodeUrl('hello%20world')).toEqual({ ok: true, result: 'hello world' });
  });
});

describe('decodeChain', () => {
  it('multi-pass decode (base64 of url-encoded)', () => {
    // 'hello world' → URL encode → 'hello%20world' → base64: 'aGVsbG8lMjB3b3JsZA=='
    const steps = decodeChain('aGVsbG8lMjB3b3JsZA==');
    expect(steps.length).toBe(2);
    expect(steps[0].format).toBe('base64');
    expect(steps[1].format).toBe('url');
    expect(steps[1].output).toBe('hello world');
  });

  it('returns empty array for plain text', () => {
    expect(decodeChain('plain text')).toEqual([]);
  });
});
