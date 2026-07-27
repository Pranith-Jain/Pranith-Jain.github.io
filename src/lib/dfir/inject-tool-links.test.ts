import { describe, it, expect } from 'vitest';
import { injectToolLinks } from './inject-tool-links';

/**
 * Regression tests for the wiki tool-link injector.
 *
 * The nesting test (`does not nest when topics co-occur in tooltip text`)
 * is the load-bearing one - that's the exact bug that shipped to prod
 * before this module was extracted. The user observed:
 *
 *   What is [SPF](/dfir/domain "Check SPF, [DKIM](/dfir/domain "...
 *   Check SPF, DKIM, DMARC, MX, and TXT for any domain"), DMARC ...
 *
 * Because the SPF tooltip blurb contains "DKIM", the old code re-scanned
 * the freshly-injected link text and wrapped DKIM inside SPF's tooltip.
 */

describe('injectToolLinks', () => {
  it('wraps the first mention of a known topic in a markdown link', () => {
    const { body, matched } = injectToolLinks('What is SPF?');
    expect(body).toMatch(/^What is \[SPF\]\(\/dfir\/domain ".+"\)\?$/);
    expect(matched.length).toBe(1);
    expect(matched[0]?.term).toBe('SPF');
  });

  it('only wraps the FIRST mention of a topic', () => {
    const { body } = injectToolLinks('SPF and SPF and SPF again');
    // Three "SPF" tokens - only the first should be a link.
    const linkCount = (body.match(/\[SPF\]/g) || []).length;
    expect(linkCount).toBe(1);
  });

  it('does not nest when topics co-occur in tooltip text', () => {
    // The SPF / DKIM tool-topic blurbs both contain the literal strings
    // "SPF" and "DKIM" - this is the exact production regression.
    const { body } = injectToolLinks('What is SPF? What is DKIM?');

    // Outer-link assertion: SPF link's title text must NOT contain an
    // unescaped `[DKIM](...)` pattern. The bug emitted
    //   [SPF](/dfir/domain "Check SPF, [DKIM](/dfir/domain "...")...")
    expect(body).not.toMatch(/\[SPF\][^"]*"[^"]*\[DKIM\]/);

    // Symmetric for the other direction.
    expect(body).not.toMatch(/\[DKIM\][^"]*"[^"]*\[SPF\]/);

    // Both topics should still be wrapped as their own top-level links.
    expect(body).toMatch(/\[SPF\]\(\/dfir\/domain "[^"]+"\)/);
    expect(body).toMatch(/\[DKIM\]\(\/dfir\/domain "[^"]+"\)/);
  });

  it('preserves fenced code blocks as-is (does not link inside them)', () => {
    const input = '```\nSPF is a record\n```\nThen SPF appears.';
    const { body } = injectToolLinks(input);
    // The fenced block must survive intact, with no link inside it.
    expect(body).toContain('```\nSPF is a record\n```');
    // The mention OUTSIDE the fence should be wrapped.
    expect(body).toMatch(/Then \[SPF\]/);
  });

  it('preserves inline code as-is', () => {
    const { body } = injectToolLinks('Set `SPF` to v=spf1, then SPF outside.');
    expect(body).toContain('`SPF`');
    // The mention OUTSIDE inline code should be wrapped.
    expect(body).toMatch(/then \[SPF\]/);
  });

  it('does not wrap text already inside a markdown link', () => {
    const { body } = injectToolLinks('See [more on SPF](/external) for context.');
    // The "SPF" inside the existing link must not be re-wrapped.
    expect(body).toContain('[more on SPF](/external)');
    // No standalone SPF link should be emitted because the only mention
    // is inside the existing link.
    expect(body).not.toMatch(/\[SPF\]\(\/dfir/);
  });

  it('wraps every distinct topic and dedupes matched by href', () => {
    // SPF / DKIM / DMARC all link to the same /dfir/domain tool, so the
    // `matched` array (used to render the "Related tools" section) dedupes
    // them to one entry. The body, however, still contains a wrapped link
    // for each term.
    const { body, matched } = injectToolLinks('SPF and DKIM and DMARC.');
    expect(body).toMatch(/\[SPF\]\(\/dfir\/domain/);
    expect(body).toMatch(/\[DKIM\]\(\/dfir\/domain/);
    expect(body).toMatch(/\[DMARC\]\(\/dfir\/domain/);
    // Matched is keyed by href so the three same-destination topics
    // collapse to one entry pointing at /dfir/domain.
    expect(matched.length).toBe(1);
    expect(matched[0]?.href).toBe('/dfir/domain');
  });

  it('returns empty matched array when no topics appear', () => {
    const { body, matched } = injectToolLinks('A body with no security terms.');
    expect(body).toBe('A body with no security terms.');
    expect(matched).toEqual([]);
  });

  it('handles topic terms with regex-special characters in body', () => {
    // Mostly a smoke test - TOOL_TOPICS escapes special chars before
    // building the regex. The body itself may also contain special chars.
    const input = 'Use SPF (1.0+) for email.';
    const { body } = injectToolLinks(input);
    expect(body).toMatch(/\[SPF\]/);
    // Parentheses in the body should remain literal.
    expect(body).toContain('(1.0+)');
  });
});
