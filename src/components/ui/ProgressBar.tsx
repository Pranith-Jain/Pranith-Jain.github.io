export type ProgressBarColor = 'brand' | 'success' | 'warning' | 'danger' | 'gradient';

export interface ProgressBarProps {
  value: number;
  max?: number;
  color?: ProgressBarColor;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  label?: string;
  className?: string;
}

const COLOR: Record<ProgressBarColor, string> = {
  brand: 'bg-brand-600 dark:bg-brand-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-rose-500',
  gradient: 'bg-gradient-to-r from-brand-600 to-brand-400',
};

const SIZE: Record<string, string> = {
  sm: 'h-1.5',
  md: 'h-2.5',
  lg: 'h-4',
};

export function ProgressBar({
  value,
  max = 100,
  color = 'brand',
  size = 'md',
  showLabel = false,
  label,
  className = '',
}: ProgressBarProps) {
  const clampedValue = Math.max(0, Math.min(value, max));
  const percentage = max > 0 ? Math.round((clampedValue / max) * 100) : 0;

  return (
    <div className={className}>
      {(showLabel || label) && (
        <div className="mb-1 flex items-center justify-between">
          {label && <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{label}</span>}
          {showLabel && <span className="text-xs font-mono text-slate-500 dark:text-slate-400">{percentage}%</span>}
        </div>
      )}
      <div
        className={`w-full overflow-hidden rounded-full bg-slate-200 dark:bg-[rgb(var(--surface-300))] ${SIZE[size]}`}
        role="progressbar"
        aria-valuenow={clampedValue}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label || 'Progress'}
      >
        <div
          className={`${SIZE[size]} rounded-full transition-all duration-500 ease-out ${COLOR[color]}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
