import type { ReactNode } from 'react';

/**
 * Editorial primitives shared across the portfolio surfaces.
 *
 * The site reads as a quiet editorial layout: drop-capped lead
 * paragraphs and a centered pull-quote that breathes between
 * sections. Single accent throughout.
 *
 * Per docs/superpowers/specs/2026-05-12-portfolio-editorial-redesign-design.md
 */

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
