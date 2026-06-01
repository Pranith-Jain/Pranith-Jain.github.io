import { memo } from 'react';

/**
 * Skeleton loading placeholder variants.
 */
export type SkeletonVariant = 'text' | 'circular' | 'rectangular' | 'card';

interface SkeletonProps {
  /** Visual variant */
  variant?: SkeletonVariant;
  /** Width (CSS value) */
  width?: string;
  /** Height (CSS value) */
  height?: string;
  /** Number of lines for text variant */
  lines?: number;
  /** Additional CSS classes */
  className?: string;
  /** Accessible label for screen readers */
  label?: string;
}

const VARIANT_STYLES: Record<SkeletonVariant, string> = {
  text: 'rounded',
  circular: 'rounded-full',
  rectangular: 'rounded-md',
  card: 'rounded-lg',
};

/**
 * Skeleton loading placeholder component.
 * Shows a pulsing placeholder while content is loading.
 *
 * @example
 * <Skeleton variant="text" lines={3} />
 * <Skeleton variant="circular" width="40px" height="40px" />
 * <Skeleton variant="card" height="200px" />
 */
export const Skeleton = memo(function Skeleton({
  variant = 'text',
  width,
  height,
  lines = 1,
  className = '',
  label = 'Loading...',
}: SkeletonProps) {
  const baseStyle = `
    animate-pulse bg-slate-200 dark:bg-slate-800
    ${VARIANT_STYLES[variant]}
    ${className}
  `;

  if (variant === 'text' && lines > 1) {
    return (
      <div className="space-y-2" role="status" aria-label={label} aria-live="polite">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={`${baseStyle} h-4`}
            style={{
              width: i === lines - 1 ? '75%' : '100%',
              height: height ?? '1rem',
            }}
            aria-hidden="true"
          />
        ))}
        <span className="sr-only">{label}</span>
      </div>
    );
  }

  return (
    <div className={baseStyle} style={{ width, height }} role="status" aria-label={label} aria-live="polite">
      <span className="sr-only">{label}</span>
    </div>
  );
});

/**
 * Pre-built skeleton layouts for common patterns.
 */
export const SkeletonCard = memo(function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div
      className={`rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-3 ${className}`}
      role="status"
      aria-label="Loading card"
    >
      <Skeleton variant="text" width="40%" height="0.75rem" />
      <Skeleton variant="text" lines={2} />
      <div className="flex gap-2">
        <Skeleton variant="rectangular" width="60px" height="24px" />
        <Skeleton variant="rectangular" width="80px" height="24px" />
      </div>
      <span className="sr-only">Loading card content</span>
    </div>
  );
});

export const SkeletonTable = memo(function SkeletonTable({
  rows = 5,
  columns = 4,
  className = '',
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden ${className}`}
      role="status"
      aria-label={`Loading table with ${rows} rows and ${columns} columns`}
    >
      {/* Header */}
      <div className="bg-slate-50 dark:bg-slate-800/60 px-4 py-3 flex gap-4">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} variant="text" width={`${100 / columns}%`} height="0.75rem" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="px-4 py-3 flex gap-4 border-t border-slate-100 dark:border-slate-800">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton key={colIndex} variant="text" width={`${100 / columns}%`} height="0.75rem" />
          ))}
        </div>
      ))}
      <span className="sr-only">Loading table data</span>
    </div>
  );
});
