import type { ReactNode } from 'react';

/**
 * Editorial primitives shared across the portfolio surfaces.
 *
 * The site reads as an editorial dossier: numbered sections filed under
 * subjects, drop-capped lead paragraphs, and a centered pull-quote that
 * breathes between sections. Single accent throughout — no per-section
 * color differentiation; the numbered subjects do the work of hierarchy.
 *
 * Per docs/superpowers/specs/2026-05-12-portfolio-editorial-redesign-design.md
 */

interface FiledTagProps {
  /** Two-digit issue / section number — 01, 02, 03 … */
  number: string;
  /** Subject line in caps, e.g. "WELCOME", "ABOUT", "EXPERIENCE". */
  subject: string;
  /** Optional date stamp on the right side. Defaults to the current month/year. */
  date?: string;
  /** Render in light text for inverted backgrounds (rare in the new system). */
  inverted?: boolean;
}

const DEFAULT_DATE = 'MAY · MMXXVI';

/**
 * Mono caps with the accent ink-blue picking up the FILED label + the
 * number; subject in ink-2; date stamp in ink-3 on the right. Hairlines
 * between elements use the rule token.
 */
export function FiledTag({ number, subject, date = DEFAULT_DATE, inverted }: FiledTagProps): JSX.Element {
  const labelClass = inverted ? 'text-surface-page/85' : 'text-ink-2';
  const stampClass = inverted ? 'text-surface-page/45' : 'text-ink-3';
  const accentClass = inverted ? 'text-surface-page' : 'text-accent';
  const ruleClass = inverted ? 'bg-surface-page/20' : 'bg-rule';
  return (
    <div className="mb-4 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.22em]">
      <span className={accentClass}>Filed</span>
      <span className={`${accentClass} tabular-nums`}>{number}</span>
      <span aria-hidden="true" className={`hidden h-px w-6 ${ruleClass} sm:inline-block`} />
      <span className={labelClass}>{subject}</span>
      <span aria-hidden="true" className={`hidden h-px flex-1 ${ruleClass} sm:inline-block`} />
      <span className={stampClass}>{date}</span>
    </div>
  );
}

interface DropCapParagraphProps {
  /** First character will be rendered as the drop cap; rest as prose. */
  children: string;
  className?: string;
}

/**
 * Editorial drop-cap on the lead paragraph of long-form prose. Floats
 * left, set in serif at large size; remaining text wraps around it.
 * Single accent — no per-section color differentiation.
 */
export function DropCapParagraph({ children, className = '' }: DropCapParagraphProps): JSX.Element {
  const first = children.charAt(0);
  const rest = children.slice(1);
  return (
    <p className={`text-base leading-relaxed text-ink-2 ${className}`}>
      <span
        aria-hidden="true"
        className="float-left mr-3 mt-1 font-serif text-[3.5rem] font-medium leading-[0.85] text-accent sm:text-[4.5rem]"
      >
        {first}
      </span>
      {rest}
    </p>
  );
}

interface PullQuoteProps {
  /** The quotation itself, without quote marks. */
  children: ReactNode;
  /** Optional attribution line. */
  attribution?: string;
  /** Tighten / loosen vertical rhythm. */
  className?: string;
}

/**
 * Editorial pull-quote — upright Newsreader at display size, centered,
 * with a centered attribution line below. No decorative quote glyphs,
 * no horizontal rules — the typography is the breather.
 */
export function PullQuote({ children, attribution, className = '' }: PullQuoteProps): JSX.Element {
  return (
    <figure className={`mx-auto max-w-3xl px-4 py-16 text-center sm:py-20 ${className}`}>
      <blockquote>
        <p className="font-serif text-3xl font-medium leading-[1.25] tracking-[-0.01em] text-ink-1 sm:text-4xl">
          {children}
        </p>
      </blockquote>
      {attribution && (
        <figcaption className="mt-6 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3">
          — {attribution}
        </figcaption>
      )}
    </figure>
  );
}
