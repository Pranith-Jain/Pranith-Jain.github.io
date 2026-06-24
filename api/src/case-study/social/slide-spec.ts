// Shared carousel slide contract. Used by the online generation engine
// (api/) and mirrors social-content/src/content-spec.ts so both speak one
// shape. Online subset only — no thread/reel fields.

export type SlideKind = 'hook' | 'content' | 'list' | 'stat' | 'cta';

export interface ContentSlide {
  /** 0-indexed position in the carousel. */
  index: number;
  /** Large headline text. */
  headline: string;
  /** Optional supporting body. */
  body?: string;
  /** Optional scannable bullets (renders as a list). */
  bullets?: string[];
  /** Optional highlighted statistic. */
  stat?: { value: string; label: string };
  /** Optional explicit kind; otherwise derived (slide 0 = hook, last = cta). */
  kind?: SlideKind;
}

export interface CarouselSpec {
  format: 'instagram';
  slides: ContentSlide[];
}

/**
 * Bound a slide list to [min, max]. Returns [] when below min so the caller
 * can fall back to a deterministic builder. Re-indexes kept slides.
 */
export function clampSlides(slides: ContentSlide[], min: number, max: number): ContentSlide[] {
  if (slides.length < min) return [];
  return slides.slice(0, max).map((s, i) => ({ ...s, index: i }));
}
