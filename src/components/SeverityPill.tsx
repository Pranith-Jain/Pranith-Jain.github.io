/**
 * <SeverityPill> — the typed, recipe-backed severity badge.
 *
 * Replaces the legacy `className={\`... ${SEVERITY_TONE[tone]}\`}` pattern
 * with a single component that owns the variant, padding, and font
 * choices. Migrates the inline `'text-xs font-mono px-1.5 py-0.5 rounded
 * border ${SEVERITY_TONE[cvssSeverity(...)]}'` ad-hoc strings to a
 * typed prop API.
 *
 * Why a component and not just a className helper:
 *   1. The pill has a fixed shape (border + padding + text style);
 *      allowing callers to re-style it produces drift.
 *   2. A component lets us add features later (icon slot, click-to-
 *      filter, tooltips) without touching 37+ call sites.
 *
 * Visual contract is identical to SEVERITY_TONE[severity] + the
 * "inline-flex items-center rounded border" base — verified against
 * the design system doc and the legacy ad-hoc class strings.
 */
import type { ReactNode } from 'react';
import { severityPill } from '../styled/recipes';
import type { Severity } from './severity';

export interface SeverityPillProps {
  tone: Severity;
  /** Optional override classes — use sparingly; prefer tone variants. */
  className?: string;
  children: ReactNode;
}

export function SeverityPill({ tone, className, children }: SeverityPillProps) {
  return (
    <span
      // The `data-severity` attribute is also useful in tests
      // (Playwright / Testing Library selectors) and in user-CSS
      // overrides (e.g. forcing a specific tone in a screenshot).
      data-severity={tone}
      className={[
        severityPill({ tone }),
        // The base layout — sits in the recipe's `base` block, but
        // we re-state it here as a hint to Panda's extractor. The
        // duplicate is harmless because the cascade merges identical
        // declarations.
        'inline-flex items-center',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </span>
  );
}
