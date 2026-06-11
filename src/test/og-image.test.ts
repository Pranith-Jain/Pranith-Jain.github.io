import { describe, it, expect } from 'vitest';
import { generateOgSvg } from '../../worker/og-image';
import { matchOgImagePath } from '../../worker/og-path';
import { resolveOg } from '../../worker/og-rewriter';

/**
 * Pins the OG-image card pipeline:
 *  - generateOgSvg must emit WELL-FORMED SVG (resvg's parser is strict; the
 *    old title markup rendered line-0 twice and broke rasterisation).
 *  - briefing stats are computed from sections/tags, not stored.
 *  - the route path matcher and the meta-rewriter wire the dynamic image URL.
 */

describe('generateOgSvg', () => {
  it('emits balanced <text>/<tspan> tags (no stray tspan outside text)', () => {
    const svg = generateOgSvg({
      title: 'A fairly long briefing title that wraps onto multiple lines for sure',
      subtitle: 'Subtitle here',
      type: 'briefing',
      date: '2026-06-12',
      stats: { findings: 14, cves: 6, critical: 3, high: 5 },
    });
    expect(svg.startsWith('<svg')).toBe(true);
    // Every <tspan> opens and closes, and there are as many </text> as <text.
    const openText = (svg.match(/<text\b/g) ?? []).length;
    const closeText = (svg.match(/<\/text>/g) ?? []).length;
    expect(openText).toBe(closeText);
    const openTspan = (svg.match(/<tspan\b/g) ?? []).length;
    const closeTspan = (svg.match(/<\/tspan>/g) ?? []).length;
    expect(openTspan).toBe(closeTspan);
    expect(openTspan).toBeGreaterThan(0);
  });

  it('renders the stats strip for briefings with stats', () => {
    const svg = generateOgSvg({
      title: 'T',
      subtitle: 'S',
      type: 'briefing',
      stats: { findings: 14, cves: 6, critical: 3, high: 5 },
    });
    expect(svg).toContain('>14<');
    expect(svg).toContain('FINDINGS');
    expect(svg).toContain('CRITICAL');
  });

  it('falls back to tag chips for blogs (no stats strip)', () => {
    const svg = generateOgSvg({ title: 'T', subtitle: 'S', type: 'blog', tags: ['detection', 'workers'] });
    expect(svg).toContain('detection');
    expect(svg).not.toContain('FINDINGS');
  });

  it('escapes XML-special characters in the title', () => {
    const svg = generateOgSvg({ title: 'A & B <script>', subtitle: '', type: 'blog' });
    expect(svg).toContain('A &amp; B &lt;script&gt;');
    expect(svg).not.toContain('<script>');
  });
});

describe('matchOgImagePath', () => {
  it.each([
    ['/api/v1/og-image/briefing/daily-2026-06-12.png', { type: 'briefing', slug: 'daily-2026-06-12' }],
    ['/api/v1/og-image/blog/my-post.png', { type: 'blog', slug: 'my-post' }],
  ])('matches %s', (path, expected) => {
    expect(matchOgImagePath(path)).toEqual(expected);
  });

  it.each([
    '/api/v1/og-image/briefing/foo.svg', // wrong extension
    '/api/v1/og-image/unknown/foo.png', // unknown type
    '/api/v1/og-image/briefing/../etc.png', // path traversal chars
    '/api/v1/og-image/blog/.png', // empty slug
  ])('rejects %s', (path) => {
    expect(matchOgImagePath(path)).toBeNull();
  });
});

describe('resolveOg dynamic image wiring', () => {
  it('points a blog page at its dynamic card', async () => {
    const env = { CASE_STUDIES: { get: async () => ({ title: 'Post', excerpt: 'x' }) } };
    const og = await resolveOg(new URL('https://pranithjain.qzz.io/blog/my-post'), env as never);
    expect(og?.image).toBe('/api/v1/og-image/blog/my-post.png');
  });

  it('points a briefing page at its dynamic card (image even on a D1 miss)', async () => {
    const env = { BRIEFINGS_DB: undefined };
    const og = await resolveOg(
      new URL('https://pranithjain.qzz.io/threatintel/briefings/daily-2026-06-12'),
      env as never
    );
    expect(og?.image).toBe('/api/v1/og-image/briefing/daily-2026-06-12.png');
  });
});
