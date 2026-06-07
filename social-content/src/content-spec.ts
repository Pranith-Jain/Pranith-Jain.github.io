/**
 * Content specification types — the shared contract between the author
 * (markdown frontmatter) and the generators (HTML/MD output).
 *
 * Authors write a markdown file with YAML frontmatter; the CLI parses
 * it into a `ContentSpec` and feeds it to the appropriate generator.
 *
 * Design system (3 base kinds + 4 content variants):
 *   hook       — slide 1, dark gradient, big headline, scroll-stopper
 *   content    — body slide (default), light bg, scannable
 *   cta        — last slide, dark gradient, big headline + button
 *
 *   Content variants (auto-detected from slide content):
 *   stat       — huge number + label
 *   list       — 3–5 bullets with numbers/icons
 *   framework  — 4–6 numbered cards in 2-column grid
 *   quote      — large pull-quote with attribution
 */

export type FunnelStage = 'tofu' | 'mofu' | 'bofu';

export type Platform = 'linkedin' | 'instagram' | 'twitter';

export type ContentFormat =
  | 'carousel' // LinkedIn carousel (PDF) or IG carousel (PNG slides)
  | 'thread' // Twitter/X thread
  | 'post' // Single text post (LinkedIn, Twitter)
  | 'graphic' // Single image (IG square, Twitter card)
  | 'reel'; // IG reel script

export type HookType =
  | 'contrarian'
  | 'data-shock'
  | 'curiosity-gap'
  | 'story'
  | 'list'
  | 'how-to'
  | 'hot-take'
  | 'question';

export type SlideKind = 'hook' | 'content' | 'cta' | 'stat' | 'list' | 'framework' | 'quote';

export interface ContentSlide {
  /** Slide number (1-indexed). */
  index: number;
  /** Optional kind override. If omitted, auto-detected: slide 1 = hook, last = cta, stat/quote/framework/list based on content. */
  kind?: SlideKind;
  /** Headline text (large, bold). */
  headline: string;
  /** Body text (smaller, supporting). */
  body?: string;
  /** Bullet points (if present, rendered as a list/framework variant). */
  bullets?: string[];
  /** Statistic to highlight (renders as a huge number). */
  stat?: { value: string; label: string };
  /** Mark as CTA slide (renderer will use the cta layout). */
  isCTA?: boolean;
}

export interface ContentSpec {
  /** Unique slug for the content piece. */
  slug: string;
  /** Display title. */
  title: string;
  /** Funnel stage. */
  funnel: FunnelStage;
  /** Primary platform. */
  platform: Platform;
  /** Content format. */
  format: ContentFormat;
  /** Hook type used in the first slide/tweet. */
  hook: HookType;
  /** Target persona (from research/target-audience.md). */
  persona: string;
  /** Hashtags (3–5). */
  hashtags: string[];
  /** Slides (for carousel/graphics). */
  slides: ContentSlide[];
  /** Thread tweets (for Twitter threads). */
  thread?: string[];
  /** Post body text (for single posts). */
  postBody?: string;
  /** CTA text. */
  cta: string;
  /** Estimated read time in seconds. */
  readTimeSec?: number;
  /** Author notes (not rendered). */
  notes?: string;
}
