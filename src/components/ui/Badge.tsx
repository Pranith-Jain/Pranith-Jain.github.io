import { memo, type ReactNode } from 'react';

/**
 * Badge variants for different semantic meanings.
 * Each variant has appropriate colors for both light and dark modes.
 */
export type BadgeVariant =
  | 'default' // Neutral gray
  | 'primary' // Brand blue
  | 'success' // Green - for positive states
  | 'warning' // Amber - for caution states
  | 'danger' // Red - for error/critical states
  | 'info' // Cyan - for informational
  | 'live' // Pulsing green - for live data
  | 'new'; // Purple - for new features

export type BadgeSize = 'sm' | 'md' | 'lg';

interface BadgeProps {
  /** Badge content */
  children: ReactNode;
  /** Visual variant */
  variant?: BadgeVariant;
  /** Size */
  size?: BadgeSize;
  /** Optional icon before text */
  icon?: ReactNode;
  /** Show dot indicator */
  dot?: boolean;
  /** Pulse animation for live states */
  pulse?: boolean;
  /** Additional CSS classes */
  className?: string;
}

const VARIANT_STYLES: Record<BadgeVariant, string> = {
  default: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  primary: 'bg-brand-50 text-brand-700 dark:bg-brand-950/30 dark:text-brand-300',
  success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300',
  warning: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300',
  danger: 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300',
  info: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-300',
  live: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300',
  new: 'bg-purple-50 text-purple-700 dark:bg-purple-950/30 dark:text-purple-300',
};

const SIZE_STYLES: Record<BadgeSize, string> = {
  sm: 'px-1.5 py-0.5 text-micro',
  md: 'px-2 py-0.5 text-xs',
  lg: 'px-2.5 py-1 text-sm',
};

const DOT_COLORS: Record<BadgeVariant, string> = {
  default: 'bg-slate-400',
  primary: 'bg-brand-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-rose-500',
  info: 'bg-cyan-500',
  live: 'bg-emerald-500',
  new: 'bg-purple-500',
};

/**
 * Badge component for status indicators, tags, and labels.
 *
 * @example
 * <Badge variant="success">Active</Badge>
 * <Badge variant="live" dot pulse>Live</Badge>
 * <Badge variant="danger" size="sm">Critical</Badge>
 */
export const Badge = memo(function Badge({
  children,
  variant = 'default',
  size = 'md',
  icon,
  dot = false,
  pulse = false,
  className = '',
}: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center gap-1 rounded font-mono font-medium
        ${VARIANT_STYLES[variant]}
        ${SIZE_STYLES[size]}
        ${className}
      `}
      role="status"
    >
      {dot && (
        <span className="relative flex h-2 w-2">
          {pulse && (
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${DOT_COLORS[variant]}`}
              aria-hidden="true"
            />
          )}
          <span className={`relative inline-flex rounded-full h-2 w-2 ${DOT_COLORS[variant]}`} aria-hidden="true" />
        </span>
      )}
      {icon && (
        <span className="flex-shrink-0" aria-hidden="true">
          {icon}
        </span>
      )}
      {children}
    </span>
  );
});
