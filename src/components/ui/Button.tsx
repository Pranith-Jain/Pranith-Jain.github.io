import type { ReactNode, MouseEvent } from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'primary-brand' | 'secondary' | 'ghost' | 'danger' | 'danger-secondary';
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

// Geist component tokens: primary = solid gray-1000 with white label
// (the single most important action on a view); secondary = surface
// fill with a translucent gray-alpha-400 border; tertiary = transparent
// with gray-1000 text. The portfolio app overrides primary to brand-blue
// (the only place we use the accent for an action) by passing
// variant="primary" tone="brand" — see Button() below.
const VARIANT: Record<ButtonVariant, string> = {
  // Default: Geist-style gray-1000 fill (the "one important action" rule).
  primary:
    'bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 disabled:bg-slate-200 disabled:text-slate-500 dark:disabled:bg-slate-800 dark:disabled:text-slate-500 disabled:cursor-not-allowed',
  // Brand variant: only when the action is the literal "primary" of an
  // in-app surface (DFIR tool open, IOC check). Pass via className if
  // the caller wants brand blue; we keep the default neutral so the
  // portfolio landing chrome doesn't shout.
  'primary-brand':
    'bg-brand-600 text-white hover:bg-brand-500 dark:bg-brand-500 dark:hover:bg-brand-400 disabled:opacity-40 disabled:cursor-not-allowed',
  // Geist secondary: background-100 fill, translucent gray-alpha-400
  // border. Hover steps the border to gray-alpha-500 and the fill to
  // gray-alpha-100 (so the "100 → 200 → 300" intent is honoured).
  secondary:
    'bg-white text-slate-900 border border-black/15 hover:bg-black/5 hover:border-black/25 dark:bg-transparent dark:text-slate-100 dark:border-white/10 dark:hover:bg-white/5 dark:hover:border-white/20 disabled:opacity-50 disabled:cursor-not-allowed',
  ghost:
    'bg-transparent text-slate-700 hover:bg-black/5 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-white disabled:opacity-40 disabled:cursor-not-allowed',
  danger:
    'bg-red-700 text-white hover:bg-red-800 dark:bg-red-700 dark:hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed',
  'danger-secondary':
    'bg-white text-red-700 border border-black/15 hover:bg-red-50 hover:border-red-300 dark:bg-transparent dark:text-red-400 dark:border-white/10 dark:hover:bg-red-500/10 dark:hover:border-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed',
};

// Geist button sizes: sm 32, md 40, lg 48. Added xs (28) for tight
// data-tile chrome and xl (52) for the Contact CTA. Padding mirrors
// the spec: 0 6 / 0 10 / 0 14 / 0 16.
const SIZE: Record<ButtonSize, string> = {
  xs: 'h-7 px-1.5 text-tool font-medium',
  sm: 'h-8 px-2.5 text-tool font-medium',
  md: 'h-10 px-3 text-sm font-medium',
  lg: 'h-12 px-4 text-base font-medium',
  xl: 'h-[52px] px-5 text-base font-medium',
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
    // Geist button: 6px radius, no monospace (default UI), medium weight
    // (500 — the spec's button-14 fontWeight). Monospace is only
    // appropriate for terminal-style controls; the rest of the app
    // uses it because the previous Button passed font-mono unconditionally.
    'inline-flex items-center justify-center gap-2 rounded-md font-sans transition-colors',
    // Geist two-layer focus ring; the inner gap uses the surface color
    // (handled globally by :focus-visible in index.css).
    'focus-visible:outline-none',
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
