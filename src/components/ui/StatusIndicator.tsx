import { memo } from 'react';

export type Status = 'online' | 'offline' | 'warning' | 'error' | 'loading' | 'unknown';

interface StatusIndicatorProps {
  /** Current status */
  status: Status;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Show label text */
  label?: string;
  /** Pulse animation for live states */
  pulse?: boolean;
  /** Additional CSS classes */
  className?: string;
}

const STATUS_COLORS: Record<Status, string> = {
  online: 'bg-emerald-500',
  offline: 'bg-slate-400',
  warning: 'bg-amber-500',
  error: 'bg-rose-500',
  loading: 'bg-blue-500 animate-pulse',
  unknown: 'bg-slate-300',
};

const STATUS_LABELS: Record<Status, string> = {
  online: 'Online',
  offline: 'Offline',
  warning: 'Warning',
  error: 'Error',
  loading: 'Loading',
  unknown: 'Unknown',
};

const SIZE_STYLES = {
  sm: 'h-2 w-2',
  md: 'h-3 w-3',
  lg: 'h-4 w-4',
};

/**
 * Status indicator dot with optional label.
 * Shows a colored dot representing the current status with accessible labeling.
 *
 * @example
 * <StatusIndicator status="online" label="API" />
 * <StatusIndicator status="error" pulse />
 * <StatusIndicator status="loading" size="lg" />
 */
export const StatusIndicator = memo(function StatusIndicator({
  status,
  size = 'md',
  label,
  pulse = status === 'online',
  className = '',
}: StatusIndicatorProps) {
  const statusLabel = label ?? STATUS_LABELS[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 ${className}`}
      role="status"
      aria-label={`${statusLabel}: ${STATUS_LABELS[status]}`}
    >
      <span className="relative flex">
        {pulse && (
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${STATUS_COLORS[status]}`}
            aria-hidden="true"
          />
        )}
        <span
          className={`relative inline-flex rounded-full ${SIZE_STYLES[size]} ${STATUS_COLORS[status]}`}
          aria-hidden="true"
        />
      </span>
      {label && <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{label}</span>}
    </span>
  );
});
