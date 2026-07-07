import { memo } from 'react';
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useCountUp } from '../hooks/useCountUp';

/**
 * StatBand — the shared "operations console" stat cluster used by the two
 * landing pages. A bordered, hairline-separated row of big stat cells under a
 * labelled header. The host supplies the header `indicator` (a LIVE pulse on
 * /threatintel, a static TOOLKIT mark on /dfir) and the cells.
 *
 * Extracted so /threatintel's LivePulse (live telemetry) and /dfir's
 * CapabilityBand (static capability stats) share one visual language instead
 * of duplicating the container + cell markup.
 */

// eslint-disable-next-line react-refresh/only-export-components -- tiny shared helper colocated with the band primitives it serves
export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Big animated count-up number. Honours reduced motion via duration 0. */
/** memoised: each count-up is independent; the parent band re-renders
 *  on data fetch so a per-cell memo keeps the count-up animation from
 *  restarting across the band on every state change. */
export const StatNumber = memo(function StatNumber({
  value,
  reduce,
  className,
}: {
  value: number;
  reduce: boolean;
  className?: string;
}): JSX.Element {
  const v = useCountUp({ to: value, duration: reduce ? 0 : 750 });
  return <span className={className}>{v.toLocaleString()}</span>;
});

/** Shared type ramp for a band cell's number + sub-line. */
export const STAT_NUM = 'font-display text-3xl font-bold leading-none tabular-nums sm:text-4xl';
export const STAT_SUB = 'mt-auto font-mono text-mini leading-relaxed text-slate-500';

interface StatCellProps {
  to: string;
  label: string;
  icon: ReactNode;
  iconClass: string;
  ariaLabel: string;
  children: ReactNode;
}
/** One cell of the band — an icon-chipped, labelled link wrapping a number.
 *  memoised: each cell renders a <Link> + count-up + sub-line; the band
 *  re-renders on data fetch, so memo keeps cells whose slice of state
 *  didn't change from re-rendering their (potentially expensive) children. */
export const StatCell = memo(function StatCell({
  to,
  label,
  icon,
  iconClass,
  ariaLabel,
  children,
}: StatCellProps): JSX.Element {
  return (
    <Link
      to={to}
      aria-label={ariaLabel}
      className="group flex min-h-[7rem] flex-col gap-2.5 bg-white px-4 py-4 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500/50 dark:bg-[rgb(var(--surface-200))] dark:hover:bg-[#16161f] sm:px-5"
    >
      <div className="flex items-center gap-2">
        <span className={`inline-flex h-6 w-6 items-center justify-center rounded ${iconClass}`}>{icon}</span>
        <span className="font-mono text-micro uppercase tracking-[0.18em] text-slate-500">{label}</span>
      </div>
      {children}
    </Link>
  );
});

interface StatBandProps {
  ariaLabel: string;
  /** Left side of the header — a LIVE pulse + label, or a static toolkit mark. */
  indicator: ReactNode;
  /** Optional right-aligned header note (hidden on the narrowest screens). */
  note?: ReactNode;
  /** The cells (or skeletons) — a 2-up / 3-up / 4-up hairline grid.
   *  Defaults to 4 to keep /dfir's CapabilityBand unchanged. */
  gridCols?: 3 | 4;
  children: ReactNode;
}
const GRID_COLS_CLASS: Record<NonNullable<StatBandProps['gridCols']>, string> = {
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
};
export function StatBand({ ariaLabel, indicator, note, children, gridCols = 4 }: StatBandProps): JSX.Element {
  return (
    <section
      aria-label={ariaLabel}
      className="overflow-hidden rounded-2xl border border-slate-200/70 shadow-[0_1px_0_rgba(15,23,42,0.03)] dark:border-[rgb(var(--border-400))]"
    >
      <div className="flex items-center justify-between border-b border-slate-200/70 bg-slate-50/70 px-4 py-2 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))] sm:px-5">
        <div className="flex items-center gap-2">{indicator}</div>
        {note}
      </div>
      <div
        className={`grid grid-cols-1 sm:grid-cols-2 gap-px bg-slate-200/70 ${GRID_COLS_CLASS[gridCols]} dark:bg-[rgb(var(--border-400))]`}
      >
        {children}
      </div>
    </section>
  );
}
