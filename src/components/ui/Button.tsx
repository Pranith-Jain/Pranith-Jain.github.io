import type { ReactNode, MouseEvent } from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-secondary';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  className?: string;
  children?: ReactNode;
  href?: string;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  onClick?: (e: MouseEvent<HTMLButtonElement | HTMLAnchorElement>) => void;
}

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-600 text-white hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-400 disabled:opacity-30 disabled:cursor-not-allowed',
  secondary:
    'border border-slate-200 text-slate-600 hover:border-brand-500/40 dark:border-slate-800 dark:text-slate-400 disabled:opacity-50 disabled:cursor-not-allowed',
  ghost:
    'text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed',
  danger:
    'border border-rose-400/60 text-rose-700 hover:bg-rose-500/10 dark:text-rose-300 disabled:opacity-50 disabled:cursor-not-allowed',
  'danger-secondary':
    'border border-slate-300 text-slate-600 hover:border-rose-500/40 hover:text-rose-600 dark:border-slate-700 dark:text-slate-400 dark:hover:text-rose-400 disabled:opacity-50 disabled:cursor-not-allowed',
};

const SIZE: Record<ButtonSize, string> = {
  xs: 'px-3 py-1.5 text-xs',
  sm: 'px-4 py-2 text-sm',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-5 py-3 text-sm',
  xl: 'px-6 py-3 text-sm',
};

export function Button({
  variant = 'primary',
  size = 'sm',
  loading = false,
  icon,
  iconPosition = 'left',
  fullWidth = false,
  className = '',
  children,
  href,
  disabled,
  type = 'button',
  onClick,
}: ButtonProps) {
  const classes = [
    'inline-flex items-center justify-center gap-2 rounded-lg font-mono font-semibold transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
    VARIANT[variant],
    SIZE[size],
    fullWidth ? 'w-full' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const isDisabled = disabled || loading;

  if (href) {
    return (
      <a
        href={href}
        className={classes}
        onClick={isDisabled ? undefined : onClick}
        aria-disabled={isDisabled || undefined}
        tabIndex={isDisabled ? -1 : undefined}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {!loading && icon && iconPosition === 'left' && <span aria-hidden="true">{icon}</span>}
        {children && <span>{children}</span>}
        {!loading && icon && iconPosition === 'right' && <span aria-hidden="true">{icon}</span>}
      </a>
    );
  }

  return (
    <button
      type={type}
      disabled={isDisabled}
      className={classes}
      onClick={isDisabled ? undefined : onClick}
      aria-busy={loading || undefined}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {!loading && icon && iconPosition === 'left' && <span aria-hidden="true">{icon}</span>}
      {children && <span>{children}</span>}
      {!loading && icon && iconPosition === 'right' && <span aria-hidden="true">{icon}</span>}
    </button>
  );
}
