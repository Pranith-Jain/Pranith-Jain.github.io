import { describe, it, expect } from 'vitest';
import { renderCarouselSlideSvg } from '../../../src/case-study/social/carousel-svg';
import type { ContentSlide } from '../../../src/case-study/social/slide-spec';

const ctx = (i: number, total: number) => ({ index: i, total });

describe('renderCarouselSlideSvg', () => {
  it('emits a 1080x1350 SVG containing the headline', () => {
    const slide: ContentSlide = { index: 0, headline: 'Auth bypass on the edge', kind: 'hook' };
    const svg = renderCarouselSlideSvg(slide, ctx(0, 5));
    expect(svg).toMatch(/<svg[^>]*width="1080"[^>]*height="1350"/);
    expect(svg).toContain('Auth bypass on the edge');
  });

  it('XML-escapes headline text to prevent broken SVG', () => {
    const slide: ContentSlide = { index: 1, headline: 'A & B <script> "x"', kind: 'content' };
    const svg = renderCarouselSlideSvg(slide, ctx(1, 5));
    expect(svg).toContain('A &amp; B &lt;script&gt; &quot;x&quot;');
    expect(svg).not.toContain('<script>');
  });

  it('renders a pager "n/total" on non-cover slides', () => {
    const slide: ContentSlide = { index: 2, headline: 'Body', kind: 'content' };
    const svg = renderCarouselSlideSvg(slide, ctx(2, 6));
    expect(svg).toContain('3 / 6');
  });

  it('renders bullets when present', () => {
    const slide: ContentSlide = { index: 1, headline: 'Three things', bullets: ['One', 'Two', 'Three'], kind: 'list' };
    const svg = renderCarouselSlideSvg(slide, ctx(1, 5));
    expect(svg).toContain('One');
    expect(svg).toContain('Two');
    expect(svg).toContain('Three');
  });

  it('renders the brand URL on a cta slide', () => {
    const slide: ContentSlide = { index: 4, headline: 'Read the full analysis', kind: 'cta' };
    const svg = renderCarouselSlideSvg(slide, ctx(4, 5));
    expect(svg).toContain('pranithjain.qzz.io');
  });
});
