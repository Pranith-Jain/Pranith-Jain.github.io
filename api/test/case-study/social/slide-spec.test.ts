import { describe, it, expect } from 'vitest';
import { clampSlides, type ContentSlide } from '../../../src/case-study/social/slide-spec';

const slide = (headline: string): ContentSlide => ({ index: 0, headline });

describe('clampSlides', () => {
  it('pads nothing but truncates to max, preserving order', () => {
    const many = Array.from({ length: 12 }, (_, i) => slide(`h${i}`));
    const out = clampSlides(many, 3, 8);
    expect(out).toHaveLength(8);
    expect(out[0]!.headline).toBe('h0');
    expect(out.map((s, i) => s.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('returns [] when given fewer than min (caller falls back)', () => {
    expect(clampSlides([slide('a')], 3, 8)).toEqual([]);
  });
});
