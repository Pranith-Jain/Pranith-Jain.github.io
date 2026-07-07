import { createContext, useContext, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { backCategoryFor } from '../lib/back-link';

/**
 * When a `DataPageLayout` is already mounted higher in the tree, nested
 * children (e.g. tab panels that also wrap in `DataPageLayout`) should
 * suppress their own back link to avoid duplicates.  The context carries
 * a single boolean — `true` when an ancestor layout is present.
 */
const DataPageLayoutContext = createContext(false);

/**
 * Returns `true` when the calling component is nested inside a
 * `DataPageLayout`.  Use this to conditionally hide a back link:
 *
 *     const insideLayout = useInsideDataPageLayout();
 *     {!insideLayout && <BackLink to="/threatintel">…</BackLink>}
 */
export function useInsideDataPageLayout(): boolean {
  return useContext(DataPageLayoutContext);
}

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
  /** Suppress the back link. When true the component still provides the
   *  layout shell (title, description, error/loading/empty states) but
   *  skips rendering the ArrowLeft back link — useful when an ancestor
   *  `DataPageLayout` already renders one. */
  hideBack?: boolean;
  /** When set, skip the smart-back (`backCategoryFor`) lookup and use this
   *  path verbatim for the back link. Use for pages that are surfaced as
   *  cross-surface "cards" from a different parent (e.g. the Global Pulse
   *  snap on the portfolio home — the user came in from `/`, not from
   *  `/threatintel/catalog?cat=predictive`, so "back" should return to
   *  the portfolio home, not the threat-intel hub). */
  backToOverride?: string;
  /** Accent color for the H1 icon. Defaults to brand (blue, for DFIR).
   *  Pass e.g. "text-rose-600 dark:text-rose-400" for threat-intel pages so
   *  the header icon matches the page accent. */
  accentClass?: string;
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
  hideBack = false,
  backToOverride,
  accentClass = 'text-brand-600 dark:text-brand-400',
}: DataPageLayoutProps): JSX.Element {
  // Smart back target: return to the category-filtered hub the user likely came
  // from (e.g. /threatintel/c/knowledge) when one is mapped for this route, else
  // fall back to the explicit backTo. Mirrors the shared BackLink behavior so
  // migrating a page onto this shell preserves its category-aware back-link.
  // `backToOverride` (when set) bypasses the smart-back entirely — used for
  // pages surfaced as cross-surface cards where "back" should return to the
  // parent surface (e.g. portfolio home), not the threatintel hub.
  const { pathname } = useLocation();
  const backTarget = backToOverride ?? backCategoryFor(pathname) ?? backTo;
  return (
    <div
      className={`${maxWidthClass} mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100 ${className ?? ''}`}
    >
      {!hideBack && (
        <Link
          to={backTarget}
          className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono transition-colors"
        >
          <ArrowLeft size={14} /> {backLabel}
        </Link>
      )}

      <div className="animate-fade-in-up mb-10">
        <h1 className="text-3xl sm:text-4xl font-display font-semibold tracking-[-1.28px] mb-2 flex items-center gap-3">
          <span className={accentClass}>{icon}</span> {title}
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
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono text-rose-700 dark:text-rose-300 border border-rose-300/50 dark:border-rose-800/50 rounded-xl hover:bg-rose-100/50 dark:hover:bg-rose-900/20 transition-colors"
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
        <div
          className="rounded-xl border border-dashed border-slate-300 dark:border-[rgb(var(--border-400))] p-10 text-center"
          role="status"
        >
          {emptyIcon && <div className="mb-3">{emptyIcon}</div>}
          <p className="text-sm text-slate-500 dark:text-slate-400">{emptyMessage}</p>
        </div>
      ) : (
        <DataPageLayoutContext value>
          <div className="animate-fade-in-up">{children}</div>
        </DataPageLayoutContext>
      )}
    </div>
  );
}
