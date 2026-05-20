import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../../src/case-study/rendering/markdown';

/**
 * Regression: linkify used to match hash text inside attribute values of
 * existing <a> tags, which broke the outer anchor's quoting and made the
 * URL render as raw text after the link. The user surfaced this on
 * production:  `1fe14…">https://www.ransomlook.io/post/1fe14…`.
 *
 * After the fix, linkify only walks text nodes outside <a>, <code>, <pre>,
 * and any tag's attributes — so the references list survives intact.
 */
describe('renderMarkdown linkify — never touches existing anchors or attributes', () => {
  const HASH = '1fe1499d9f2bccc88b7b865edf87ec51deadbeefcafebabefacefeed00000000'; // 64 hex

  it('preserves the URL inside a markdown link whose path happens to be a SHA256', () => {
    const md = `[${HASH}](https://www.ransomlook.io/post/${HASH})`;
    const html = renderMarkdown(md);
    // Original anchor's href stays intact (no <a class="ioc-link"> spliced
    // into the attribute value).
    expect(html).toContain(`href="https://www.ransomlook.io/post/${HASH}"`);
    // No malformed quote-and-bracket fragments that would show as text.
    expect(html).not.toMatch(/">https:\/\/www\.ransomlook\.io/);
  });

  it('still linkifies a bare hash that appears in normal prose', () => {
    const html = renderMarkdown(`Sample hash: ${HASH} observed on Tuesday.`);
    expect(html).toContain('class="ioc-link"');
    expect(html).toContain(`href="/dfir/ioc-check?q=${HASH}"`);
  });

  it('does not linkify a hash inside a code block', () => {
    const html = renderMarkdown('Sample:\n\n```\n' + HASH + '\n```');
    // The hash should appear inside <code> verbatim, no ioc-link wrapper.
    expect(html).toContain(HASH);
    expect(html).not.toContain(`href="/dfir/ioc-check?q=${HASH}"`);
  });

  it('does not nest anchors when the markdown link text is identical to its href hash', () => {
    const md = `[${HASH}](https://www.ransomlook.io/post/${HASH})`;
    const html = renderMarkdown(md);
    // Count <a> openings: should be exactly one per markdown link.
    const openings = (html.match(/<a\b/g) ?? []).length;
    const closings = (html.match(/<\/a>/g) ?? []).length;
    expect(openings).toBe(closings);
    // No <a class="ioc-link"> spliced inside the outer anchor.
    expect(html).not.toMatch(/<a [^>]*ioc-link[^>]*>[^<]*<\/a><\/a>/);
  });

  it('linkifies IPv4 addresses in prose but not inside attribute values', () => {
    const md = '[Report](https://example.com/?ip=203.0.113.5) — 203.0.113.5 is a known IOC.';
    const html = renderMarkdown(md);
    // The IP inside the URL must stay un-wrapped (kept in href attribute).
    expect(html).toContain('https://example.com/?ip=203.0.113.5');
    // The IP in prose should get the ioc-link wrapper.
    expect(html).toMatch(/<a class="ioc-link"[^>]*>203\.0\.113\.5<\/a>/);
  });
});
