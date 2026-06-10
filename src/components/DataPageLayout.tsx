import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { backCategoryFor } from '../lib/back-link';

export interface DataPageLayoutProps {
  backTo: string;
  backLabel?: string;
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  headerExtra?: ReactNode;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  empty?: boolean;
  emptyMessage?: string;
  emptyIcon?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** Container width cap. Defaults to max-w-5xl; pass e.g. max-w-7xl for wide/command-center pages. */
  maxWidthClass?: string;
}

export function DataPageLayout({
  backTo,
  backLabel = 'back',
  icon,
  title,
  description,
  headerExtra,
  loading,
  error,
  onRetry,
  empty,
  emptyMessage = 'Nothing here yet.',
  emptyIcon,
  children,
  className,
  maxWidthClass = 'max-w-5xl',
}: DataPageLayoutProps): JSX.Element {
  // Smart back target: return to the category-filtered hub the user likely came
  // from (e.g. /threatintel/c/knowledge) when one is mapped for this route, else
  // fall back to the explicit backTo. Mirrors the shared BackLink behavior so
  // migrating a page onto this shell preserves its category-aware back-link.
  const { pathname } = useLocation();
  const backTarget = backCategoryFor(pathname) ?? backTo;
  return (
    <div
      className={`${maxWidthClass} mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100 ${className ?? ''}`}
    >
      <Link
        to={backTarget}
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono transition-colors"
      >
        <ArrowLeft size={14} /> {backLabel}
      </Link>

      <div className="animate-fade-in-up mb-10">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 flex items-center gap-3">
          <span className="text-brand-600 dark:text-brand-400">{icon}</span> {title}
        </h1>
        {description && <p className="text-slate-600 dark:text-slate-400 max-w-2xl leading-relaxed">{description}</p>}
        {headerExtra && <div className="mt-4">{headerExtra}</div>}
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-300/70 dark:border-rose-800/60 bg-rose-50/60 dark:bg-rose-950/30 p-4 mb-6 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3">
            <AlertTriangle size={16} className="text-rose-600 dark:text-rose-400 flex-shrink-0" />
            <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p>
          </div>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono text-rose-700 dark:text-rose-300 border border-rose-300/50 dark:border-rose-800/50 rounded-lg hover:bg-rose-100/50 dark:hover:bg-rose-900/20 transition-colors"
            >
              <RefreshCw size={12} /> Retry
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16" role="status" aria-live="polite">
          <Loader2 size={24} className="animate-spin text-slate-400" aria-hidden="true" />
          <span className="sr-only">Loading…</span>
        </div>
      ) : empty ? (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center" role="status">
          {emptyIcon && <div className="mb-3">{emptyIcon}</div>}
          <p className="text-sm text-slate-500 dark:text-slate-400">{emptyMessage}</p>
        </div>
      ) : (
        <div className="animate-fade-in-up">{children}</div>
      )}
    </div>
  );
}
