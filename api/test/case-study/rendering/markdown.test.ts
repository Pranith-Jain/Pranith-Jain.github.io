import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../../../src/case-study/rendering/markdown';

describe('renderMarkdown', () => {
  it('converts markdown to HTML', () => {
    const html = renderMarkdown('## Summary\n\nHello.');
    expect(html).toContain('<h2');
    expect(html).toContain('Summary');
    expect(html).toContain('Hello.');
  });

  it('auto-links IPv4 addresses to the IOC checker', () => {
    const html = renderMarkdown('Found at 1.2.3.4 in logs.');
    expect(html).toContain('/dfir/ioc-check?q=1.2.3.4');
  });

  it('auto-links sha256 hashes', () => {
    const sha = 'a'.repeat(64);
    const html = renderMarkdown(`Hash: ${sha}`);
    expect(html).toContain(`/dfir/ioc-check?q=${sha}`);
  });

  it('does not modify text inside code spans', () => {
    const html = renderMarkdown('`1.2.3.4` should stay as code.');
    expect(html).not.toContain('/dfir/ioc-check?q=1.2.3.4');
  });

  it('sanitizes inline scripts', () => {
    const html = renderMarkdown('<script>alert(1)</script> and **bold**');
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain('<strong>');
  });

  describe('URL scheme sanitization', () => {
    // The sanitizer has to reduce the attribute to the form the BROWSER will
    // resolve: entities are decoded, and tab/newline/C0 are stripped, before
    // the scheme is tested. Matching the raw string missed these.
    //
    // Note: `marked` drops the space between a tag name and its first
    // attribute (`<a href=x>` -> `<ahref=x>`), so assertions target the
    // attribute VALUE rather than doing a naive substring scan.
    const payloads: Array<[string, string]> = [
      ['plain', '<a href="javascript:alert(1)">x</a>'],
      ['entity hex', '<a href="jav&#x61;script:alert(1)">x</a>'],
      ['entity decimal', '<a href="&#106;avascript:alert(1)">x</a>'],
      ['entity named', '<a href="java&Tab;script:alert(1)">x</a>'],
      ['mixed case', '<a href="JaVaScRiPt:alert(1)">x</a>'],
      ['vbscript', '<a href="vbscript:msgbox(1)">x</a>'],
      ['data text/html', '<a href="data:text/html;base64,PHNjcmlwdD4=">x</a>'],
      ['img src', '<img src="javascript:alert(1)">'],
    ];

    // Entity-decode + strip the characters URL parsing ignores, so the
    // comparison sees the same string the browser would resolve.
    function resolve(raw: string): string {
      return raw
        .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(parseInt(d, 10)))
        .replace(/[\u0000-\u0020\u007f]/g, '')
        .toLowerCase();
    }

    for (const [name, payload] of payloads) {
      it(`neutralizes a ${name} URL`, () => {
        const html = renderMarkdown(payload);
        const hrefs = [...html.matchAll(/(?:href|src)\s*=\s*"([^"]*)"/gi)].map((m) => resolve(m[1]!));
        expect(hrefs.length, `expected at least one href/src in: ${html}`).toBeGreaterThan(0);
        for (const h of hrefs) {
          expect(h).not.toContain('javascript:');
          expect(h).not.toContain('vbscript:');
          expect(h).not.toContain('data:text/html');
        }
      });
    }

    it('neutralizes a newline-split scheme', () => {
      const html = renderMarkdown('<a href="java\nscript:alert(1)">x</a>');
      const hrefs = [...html.matchAll(/href\s*=\s*"([^"]*)"/gi)].map((m) => resolve(m[1]!));
      expect(hrefs.length, `expected an href in: ${html}`).toBeGreaterThan(0);
      for (const h of hrefs) expect(h).not.toContain('javascript:');
    });

    it('leaves safe URLs untouched', () => {
      const html = renderMarkdown('[report](https://example.com/report)');
      expect(html).toContain('https://example.com/report');
    });
  });

  it('does not corrupt realistic URLs', () => {
    const urls = [
      'https://example.com/a/b?x=1&y=2#frag',
      'https://sub.domain.example.co.uk/path%20with%20spaces?q=a+b',
      'https://example.com/path_(parens)/file.txt',
      '/relative/path',
      'mailto:someone@example.com',
      'https://example.com/~user/file',
    ];
    for (const u of urls) {
      const html = renderMarkdown(`[link](${u})`);
      // The href must survive intact (marked may percent-encode some chars).
      expect(html, `url ${u} -> ${html}`).toContain('href=');
      // And the scheme must not be mangled into something else.
      const m = /href="([^"]*)"/i.exec(html);
      expect(m, `no href for ${u}`).toBeTruthy();
      const resolved = m![1]!;
      expect(
        resolved.startsWith('https://') || resolved.startsWith('/') || resolved.startsWith('mailto:'),
        resolved
      ).toBe(true);
    }
  });

  it('handles lone surrogate and huge codepoint entities without throwing', () => {
    expect(() => renderMarkdown('<a href="&#xD800;javascript:alert(1)">x</a>')).not.toThrow();
    expect(() => renderMarkdown('<a href="&#x10FFFF;javascript:alert(1)">x</a>')).not.toThrow();
    expect(() => renderMarkdown('<a href="&#0;javascript:alert(1)">x</a>')).not.toThrow();
  });
});
