import { describe, it, expect } from 'vitest';
import { extractTextOrHtml } from '../../../src/lib/file2txt/text-html';

const enc = new TextEncoder();

describe('extractTextOrHtml', () => {
  it('passes plain text through', () => {
    const r = extractTextOrHtml(enc.encode('1.2.3.4 is bad'), 'text');
    expect(r.text).toBe('1.2.3.4 is bad');
    expect(r.meta).toEqual({ kind: 'text', method: 'inline', truncated: false });
  });

  it('strips HTML tags and decodes entities', () => {
    const html =
      '<html><head><style>x{}</style></head><body><p>Evil &amp; 1.2.3.4</p><script>alert(1)</script></body></html>';
    const r = extractTextOrHtml(enc.encode(html), 'html');
    expect(r.text).toContain('Evil & 1.2.3.4');
    expect(r.text).not.toContain('alert(1)');
    expect(r.text).not.toContain('<p>');
    expect(r.meta.kind).toBe('html');
  });

  it('truncates over-long text and flags it', () => {
    const big = 'a'.repeat(150_000);
    const r = extractTextOrHtml(enc.encode(big), 'text');
    expect(r.text.length).toBe(100_000);
    expect(r.meta.truncated).toBe(true);
  });
});
