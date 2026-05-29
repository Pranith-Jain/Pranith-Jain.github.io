export type StatusDotVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'active';

export interface StatusDotProps {
  variant?: StatusDotVariant;
  pulse?: boolean;
  size?: 'sm' | 'md';
  label?: string;
  className?: string;
}

const VARIANT: Record<StatusDotVariant, string> = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  error: 'bg-rose-500',
  info: 'bg-brand-500',
  neutral: 'bg-slate-400',
  active: 'bg-sky-500',
};

const SIZE: Record<string, string> = {
  sm: 'h-1.5 w-1.5',
  md: 'h-2 w-2',
};

export function StatusDot({ variant = 'neutral', pulse = false, size = 'sm', label, className = '' }: StatusDotProps) {
  return (
    <span
      className={`inline-block rounded-full ${SIZE[size]} ${VARIANT[variant]} ${pulse ? 'animate-pulse' : ''} ${className}`}
      aria-label={label}
      role={label ? 'img' : undefined}
    />
  );
}
