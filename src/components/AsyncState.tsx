import type { ReactNode } from 'react';
import { Inbox, AlertTriangle, RefreshCw } from 'lucide-react';

export interface AsyncStateProps {
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  idle?: boolean;
  idleContent?: ReactNode;
  emptyLabel?: string;
  /** Optional icon for the empty state (defaults to Inbox). */
  emptyIcon?: ReactNode;
  /** Optional CTA rendered below the empty label (e.g. "Try a different indicator"). */
  emptyAction?: ReactNode;
  /** Optional hint shown below the error message (root-cause context). */
  errorHint?: string;
  skeletonRows?: number;
  /** Skeleton shape variant — matches the content layout so loading previews structure. */
  skeletonVariant?: 'list' | 'table' | 'cards';
  onRetry?: () => void;
  children: ReactNode;
}

function Skeleton({ rows, variant = 'list' }: { rows: number; variant?: 'list' | 'table' | 'cards' }): JSX.Element {
  if (variant === 'cards') {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="surface-card p-4 animate-pulse" style={{ animationDelay: `${i * 70}ms` }}>
            <div className="h-4 w-1/3 rounded bg-slate-200/70 dark:bg-[rgb(var(--surface-300)/0.7)]" />
            <div className="mt-3 h-3 w-full rounded bg-slate-200/50 dark:bg-[rgb(var(--surface-300)/0.5)]" />
            <div className="mt-2 h-3 w-2/3 rounded bg-slate-200/50 dark:bg-[rgb(var(--surface-300)/0.5)]" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'table') {
    return (
      <div className="space-y-1" aria-hidden="true">
        {/* header row */}
        <div className="flex gap-4 pb-2 border-b border-slate-200 dark:border-[rgb(var(--border-400))]">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-3 flex-1 rounded bg-slate-200/70 dark:bg-[rgb(var(--surface-300)/0.7)] animate-pulse"
            />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex gap-4 py-2">
            {Array.from({ length: 4 }).map((_, j) => (
              <div
                key={j}
                className="h-3 flex-1 rounded bg-slate-200/50 dark:bg-[rgb(var(--surface-300)/0.5)] animate-pulse"
                style={{ width: `${88 - (j % 3) * 12}%`, animationDelay: `${i * 70}ms` }}
              />
            ))}
          </div>
        ))}
      </div>
    );
  }

  // default: list
  return (
    <div className="space-y-2.5" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-4 rounded bg-slate-200/70 dark:bg-[rgb(var(--surface-300)/0.7)] animate-pulse"
          style={{ width: `${92 - (i % 4) * 11}%`, animationDelay: `${i * 70}ms` }}
        />
      ))}
    </div>
  );
}

export function AsyncState({
  loading,
  error,
  empty,
  idle,
  idleContent = null,
  emptyLabel = 'Nothing here yet.',
  emptyIcon,
  emptyAction,
  errorHint,
  skeletonRows = 5,
  skeletonVariant = 'list',
  onRetry,
  children,
}: AsyncStateProps): JSX.Element {
  if (idle) return <>{idleContent}</>;

  if (loading) {
    return (
      <div role="status" aria-live="polite" aria-busy="true">
        <span className="sr-only">Loading…</span>
        <Skeleton rows={skeletonRows} variant={skeletonVariant} />
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-rose-300/70 bg-rose-50/60 px-4 py-5 text-tool text-rose-700 dark:border-rose-800/60 dark:bg-rose-950/30 dark:text-rose-300"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-rose-500 dark:text-rose-400" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-display font-semibold">Couldn&rsquo;t load this.</p>
            <p className="mt-1 text-rose-600/90 dark:text-rose-400/90">{error}</p>
            {errorHint && <p className="mt-1.5 text-meta text-rose-500/80 dark:text-rose-400/70">{errorHint}</p>}
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="mt-3 inline-flex items-center gap-1.5 rounded border border-rose-400/50 px-3 py-1.5 text-meta font-semibold text-rose-700 transition-colors hover:bg-rose-100/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40 dark:text-rose-300 dark:hover:bg-rose-900/30"
              >
                <RefreshCw size={13} aria-hidden="true" />
                Retry
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (empty) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 px-4 py-12 text-center text-tool text-slate-500 dark:border-[rgb(var(--border-400))] dark:text-muted"
      >
        <div className="mb-3 text-slate-400 dark:text-slate-500" aria-hidden="true">
          {emptyIcon ?? <Inbox size={28} strokeWidth={1.5} />}
        </div>
        <p>{emptyLabel}</p>
        {emptyAction && <div className="mt-4">{emptyAction}</div>}
      </div>
    );
  }

  return <>{children}</>;
}
