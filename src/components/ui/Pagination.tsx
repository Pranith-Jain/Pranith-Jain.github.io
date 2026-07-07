import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface PaginationProps {
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
  className?: string;
  showCount?: boolean;
  count?: number;
}

export function Pagination({
  page,
  totalPages,
  onPrev,
  onNext,
  className = '',
  showCount = false,
  count,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <nav aria-label="Pagination" className={`flex items-center justify-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={onPrev}
        disabled={page <= 1}
        className="inline-flex items-center gap-1 rounded border border-slate-200 px-3 py-1.5 text-xs font-mono text-slate-600 transition-colors hover:border-brand-500/40 hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-30 dark:border-[rgb(var(--border-400))] dark:text-slate-400 dark:hover:text-brand-400"
        aria-label="Previous page"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Prev
      </button>

      <span className="px-2 text-xs font-mono text-slate-500">
        {page} / {totalPages}
        {showCount && count !== undefined && <span className="ml-1 text-slate-400">({count})</span>}
      </span>

      <button
        type="button"
        onClick={onNext}
        disabled={page >= totalPages}
        className="inline-flex items-center gap-1 rounded border border-slate-200 px-3 py-1.5 text-xs font-mono text-slate-600 transition-colors hover:border-brand-500/40 hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-30 dark:border-[rgb(var(--border-400))] dark:text-slate-400 dark:hover:text-brand-400"
        aria-label="Next page"
      >
        Next
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </nav>
  );
}
