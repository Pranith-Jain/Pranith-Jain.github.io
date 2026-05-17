import type { ReactNode } from 'react';

/**
 * One async-state surface for every data-fetching view. Before this, ~half
 * the pages had no skeleton (content-flash) and ~30 had no error UI (blank
 * screen on a failed fetch). Consistent loading / error / empty here = a
 * uniform perceived-reliability story across the whole app.
 *
 * Usage:
 *   <DataState loading={s.loading} error={s.error} empty={!rows.length}
 *              emptyLabel="No findings in this window." onRetry={reload}>
 *     {rows.map(...)}
 *   </DataState>
 */
export interface DataStateProps {
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyLabel?: string;
  /** Skeleton bar count while loading. */
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
          style={{ width: `${92 - (i % 4) * 11}%`, animationDelay: `${i * 70}ms` }}
        />
      ))}
    </div>
  );
}

export function DataState({
  loading,
  error,
  empty,
  emptyLabel = 'Nothing here yet.',
  rows = 5,
  onRetry,
  children,
}: DataStateProps): JSX.Element {
  if (loading) {
    return (
      <div role="status" aria-live="polite" aria-busy="true">
        <span className="sr-only">Loading…</span>
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
        <p className="font-display font-semibold">Couldn’t load this.</p>
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

  if (empty) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-500">
        {emptyLabel}
      </div>
    );
  }

  return <>{children}</>;
}
