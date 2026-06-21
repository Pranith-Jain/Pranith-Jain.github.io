import type { ReactNode } from 'react';

/**
 * Single-source-of-truth badge / pill primitive.
 *
 * Replaces three near-identical inline-style flavours that had drifted across
 * the portfolio (project tags, solution bullets, success badges). All tone +
 * size variants use the same rounded-full + border + thin-translucent-fill
 * recipe so they read as one design language, not three.
 *
 *   <Badge>{tag}</Badge>                    // default: neutral, sm
 *   <Badge tone="success" size="md">…</Badge>
 *
 * Keep it presentational. Interactive surfaces wrap a Badge in their own
 * <a>/<button>; the primitive itself stays an inline span.
 */

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'critical' | 'warning' | 'mono';
export type BadgeSize = 'xs' | 'sm';

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  size?: BadgeSize;
  className?: string;
  /** Optional small dot before the label (handy for status pills). */
  dot?: boolean;
}

const SIZE: Record<BadgeSize, string> = {
  xs: 'px-2 py-0.5 text-mini',
  sm: 'px-3 py-1 text-xs',
};

const TONE: Record<BadgeTone, string> = {
  // Default project-tag look — calm, surface-aware.
  neutral:
    'border-slate-200 bg-white/80 text-slate-700 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))]/60 dark:text-slate-200',
  brand:
    'border-brand-500/40 bg-brand-500/10 text-brand-700 dark:border-brand-400/40 dark:bg-brand-400/10 dark:text-brand-300',
  success:
    'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-400/10 dark:text-emerald-300',
  critical:
    'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:border-rose-400/40 dark:bg-rose-400/10 dark:text-rose-300',
  warning:
    'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-300',
  mono: 'border-slate-200 bg-slate-50 text-slate-700 font-mono dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))]/60 dark:text-slate-300',
};

const DOT: Record<BadgeTone, string> = {
  neutral: 'bg-slate-400',
  brand: 'bg-brand-500',
  success: 'bg-emerald-500',
  critical: 'bg-rose-500',
  warning: 'bg-amber-500',
  mono: 'bg-slate-500',
};

export function Badge({
  children,
  tone = 'neutral',
  size = 'sm',
  dot = false,
  className = '',
}: BadgeProps): JSX.Element {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${SIZE[size]} ${TONE[tone]} ${className}`.trim()}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${DOT[tone]}`} aria-hidden="true" />}
      {children}
    </span>
  );
}

/* ── Severity primitive ───────────────────────────────────────────────────
 *
 * Wraps the canonical SEVERITY_TONE table (lives in ./severity.ts so this
 * component file stays Fast-Refresh-friendly).
 */

// SeverityPill re-export — the canonical SeverityPill lives in
// ./SeverityPill.tsx (recipe-backed via Panda). This shim keeps the
// legacy `severity` prop name working for existing consumers like
// GlobalPulse.tsx; new code should import SeverityPill directly.
//
// TODO: migrate the 1 remaining consumer (GlobalPulse.tsx) to use
// `tone` instead of `severity`, then delete this shim.
import { SeverityPill as PandaSeverityPill, type SeverityPillProps as PandaSeverityPillProps } from './SeverityPill';
import type { Severity } from './severity';

export type { SeverityPillProps } from './SeverityPill';

interface LegacySeverityPillProps {
  severity: Severity;
  /** Optional label override; defaults to the severity name. */
  label?: string;
  className?: string;
}

export function SeverityPill({ severity, label, className }: LegacySeverityPillProps): JSX.Element {
  // Map the legacy `severity` prop to the new `tone` prop. The recipe
  // already produces uppercase mono labels, so the rendered output is
  // identical to the old inline-styled implementation.
  return (
    <PandaSeverityPill tone={severity} className={className}>
      {label ?? severity}
    </PandaSeverityPill>
  );
}

// Re-export the prop type for consumers that import it from Badge.tsx.
export type SeverityPillPropsCompat = PandaSeverityPillProps;
