/**
 * Content specification types — the shared contract between the author
 * (markdown frontmatter) and the generators (HTML/MD output).
 *
 * Authors write a markdown file with YAML frontmatter; the CLI parses
 * it into a `ContentSpec` and feeds it to the appropriate generator.
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

export type SlideLayout =
  | 'auto' // Auto-detect from content
  | 'hero' // Dark gradient, big headline, used for slide 1
  | 'stat' // Big number hero
  | 'list' // Numbered cards with icons
  | 'framework' // 2-column grid
  | 'comparison' // Side-by-side compare
  | 'quote' // Large pull-quote
  | 'cta'; // Brand-color CTA slide

export interface ContentSlide {
  /** Slide number (1-indexed). */
  index: number;
  /** Headline text (large, bold). */
  headline: string;
  /** Body text (smaller, supporting). */
  body?: string;
  /** Bullet points (if present, rendered instead of body). */
  bullets?: string[];
  /** Statistic to highlight (renders as a large number). */
  stat?: { value: string; label: string };
  /** Visual element hint (icon name → emoji/SVG lookup, or 'none'). */
  visual?: string;
  /** Background override (CSS color). */
  bg?: string;
  /** Text color override (CSS color). */
  color?: string;
  /** Accent color override for this slide (CSS color). */
  accent?: string;
  /** Small uppercase label above headline ("THE PROBLEM", "KEY INSIGHT"). */
  eyebrow?: string;
  /** Force a specific layout (default: auto-detect). */
  layout?: SlideLayout;
  /** Is this the CTA slide? */
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
