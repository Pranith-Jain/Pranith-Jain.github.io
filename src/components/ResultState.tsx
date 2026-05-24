import type { ReactNode } from 'react';

/**
 * Async-state surface for INPUT-DRIVEN tools (submit a value → get a result),
 * the other half of the app `DataState` deliberately didn't cover. Those
 * ~30 DFIR tools each reinvent their idle / loading / error / result panel;
 * this is the one consistent shape.
 *
 * Phases (derived, not a prop):
 *   not submitted        → `idle` (a hint / instructions, or nothing)
 *   submitted + loading   → skeleton
 *   submitted + error     → error card (+ Retry)
 *   submitted + no result → empty
 *   submitted + result    → children
 */
export interface ResultStateProps {
  submitted: boolean;
  loading?: boolean;
  error?: string | null;
  hasResult?: boolean;
  idle?: ReactNode;
  emptyLabel?: string;
  rows?: number;
  onRetry?: () => void;
  children: ReactNode;
}

function Skeleton({ rows }: { rows: number }): JSX.Element {
  return (
    <div className="space-y-2.5" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-4 rounded bg-slate-200/70 dark:bg-slate-800/70 animate-pulse"
          style={{ width: `${94 - (i % 4) * 12}%`, animationDelay: `${i * 70}ms` }}
        />
      ))}
    </div>
  );
}

export function ResultState({
  submitted,
  loading,
  error,
  hasResult,
  idle = null,
  emptyLabel = 'No results.',
  rows = 5,
  onRetry,
  children,
}: ResultStateProps): JSX.Element {
  if (!submitted) return <>{idle}</>;

  if (loading) {
    return (
      <div role="status" aria-live="polite" aria-busy="true">
        <span className="sr-only">Working…</span>
        <Skeleton rows={rows} />
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-rose-300/70 bg-rose-50/60 px-4 py-5 text-sm text-rose-700 dark:border-rose-800/60 dark:bg-rose-950/30 dark:text-rose-300"
      >
        <p className="font-display font-semibold">That didn’t work.</p>
        <p className="mt-1 text-rose-600/90 dark:text-rose-400/90">{error}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex items-center rounded-md border border-rose-400/50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40 dark:text-rose-300 dark:hover:bg-rose-900/30"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  if (hasResult === false) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
        {emptyLabel}
      </div>
    );
  }

  return <>{children}</>;
}
