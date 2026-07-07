import { memo, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/**
 * Shared card primitive for the live-snapshot panels (LiveSnapshotPanel,
 * IocSnapshotPanel, RulesSnapshotPanel, RulesSnapshotPanel).
 *
 * Each consuming panel passes:
 *   - accent: which colour family to tint the border + icon with
 *   - icon + title: header content
 *   - optional newCount / watchCount badges (for the "new since visit" /
 *     watchlist patterns the panels share)
 *   - rightAction: typically a "feed →" Link to the deep-view page
 *   - loading: when true, render skeleton bars
 *   - error: when set, render the error string in rose
 *   - children: the body — typically a stat line + a list of items
 *
 * Accent colour map is closed-set so Tailwind's JIT can statically extract
 * the classes. Adding a new colour means adding a row here.
 */

export type SnapshotAccent = 'rose' | 'sky' | 'violet' | 'emerald' | 'amber' | 'fuchsia' | 'orange' | 'blue';

const ACCENT_BORDER: Record<SnapshotAccent, string> = {
  rose: 'border-rose-500/30',
  sky: 'border-sky-500/30',
  violet: 'border-violet-500/30',
  emerald: 'border-emerald-500/30',
  amber: 'border-amber-500/30',
  fuchsia: 'border-fuchsia-500/30',
  orange: 'border-orange-500/30',
  blue: 'border-blue-500/30',
};

const ACCENT_TEXT: Record<SnapshotAccent, string> = {
  rose: 'text-rose-600 dark:text-rose-400',
  sky: 'text-sky-600 dark:text-sky-400',
  violet: 'text-violet-600 dark:text-violet-400',
  emerald: 'text-emerald-600 dark:text-emerald-400',
  amber: 'text-amber-600 dark:text-amber-400',
  fuchsia: 'text-fuchsia-600 dark:text-fuchsia-400',
  orange: 'text-orange-600 dark:text-orange-400',
  blue: 'text-blue-600 dark:text-blue-400',
};

interface Props {
  accent: SnapshotAccent;
  icon: LucideIcon;
  title: string;
  /** Optional — number of items new since last visit. */
  newCount?: number;
  /** Optional — number of items matching the analyst's watchlist. */
  watchCount?: number;
  /** Optional — concrete watchlist terms used for the watchpill tooltip. */
  watchTerms?: string[];
  /** Whether to render newCount + watchCount badges (false when no last-visit baseline). */
  showNewBadge?: boolean;
  /** Element rendered top-right — typically a "feed →" Link. */
  rightAction?: ReactNode;
  /** When true: skeleton placeholder rows replace children. */
  loading?: boolean;
  /** When set: rose error message replaces children. */
  error?: string;
  /** Card padding tier — `compact` for landing-page embeds. */
  compact?: boolean;
  children?: ReactNode;
}

function NewBadge({ count }: { count: number }): JSX.Element | null {
  if (count <= 0) return null;
  return (
    <span
      className="text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-full border border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-300 shrink-0"
      aria-label={`${count} new since your last visit`}
    >
      {count} new
    </span>
  );
}

function WatchPill({ count, terms }: { count: number; terms?: string[] }): JSX.Element | null {
  if (count <= 0) return null;
  const tooltip =
    terms && terms.length > 0
      ? `watchlist match: ${terms.join(', ')}`
      : `${count} watchlist match${count === 1 ? '' : 'es'}`;
  return (
    <span
      className="text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-full border border-violet-500/50 bg-violet-500/15 text-violet-700 dark:text-violet-300 shrink-0"
      aria-label={tooltip}
    >
      {count} watch
    </span>
  );
}

/**
 * Skeleton bars sized to roughly match the post-load content shape so CLS
 * stays at zero. 1 stat line (slightly wider) + 4 item rows.
 */
function Skeleton(): JSX.Element {
  return (
    <div className="mt-1 space-y-2 animate-pulse" aria-hidden="true" role="presentation">
      <div className="h-3 bg-slate-200 dark:bg-[rgb(var(--surface-300))] rounded w-3/4" />
      <div className="h-2.5 bg-slate-200 dark:bg-[rgb(var(--surface-300))] rounded w-full mt-3" />
      <div className="h-2.5 bg-slate-200 dark:bg-[rgb(var(--surface-300))] rounded w-5/6" />
      <div className="h-2.5 bg-slate-200 dark:bg-[rgb(var(--surface-300))] rounded w-11/12" />
      <div className="h-2.5 bg-slate-200 dark:bg-[rgb(var(--surface-300))] rounded w-4/5" />
    </div>
  );
}

/**
 * The card itself is memoised because:
 *  - the parent LiveSnapshotPanel/IocSnapshotPanel re-renders on every
 *    `lastVisit` prop change (e.g. when the new-since-last-visit
 *    pill flips from 0 to N), and
 *  - each card's body is expensive (a list of 3-4 items with
 *    watchlist filtering, sanitized links, etc.).
 *
 * Card props are mostly primitives + a `children` node; `memo`
 * short-circuits the re-render when nothing in this card's slice
 * of state changed.
 */
export const SnapshotCard = memo(function SnapshotCard({
  accent,
  icon: Icon,
  title,
  newCount = 0,
  watchCount = 0,
  watchTerms,
  showNewBadge = true,
  rightAction,
  loading,
  error,
  compact,
  children,
}: Props): JSX.Element {
  const padding = compact ? 'p-3' : 'p-4';
  return (
    <div
      className={`rounded-xl border ${ACCENT_BORDER[accent]} bg-white dark:bg-[rgb(var(--surface-200))] ${padding} flex flex-col min-h-[200px]`}
    >
      <div className="flex items-baseline justify-between gap-2 mb-1 flex-wrap">
        <h3 className="font-display font-semibold text-sm inline-flex items-center gap-1.5 flex-wrap">
          <Icon size={14} className={ACCENT_TEXT[accent]} /> {title}
          {showNewBadge && <NewBadge count={newCount} />}
          <WatchPill count={watchCount} terms={watchTerms} />
        </h3>
        {rightAction && <div className="text-micro font-mono">{rightAction}</div>}
      </div>

      {error && <p className="text-mini font-mono text-rose-500">load error: {error}</p>}

      {loading && !error && <Skeleton />}

      {!loading && !error && children}
    </div>
  );
});
