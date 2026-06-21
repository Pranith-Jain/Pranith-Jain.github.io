import type { ReactNode, MouseEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { button, type ButtonVariants } from '../../styled/recipes';

export type ButtonVariant = NonNullable<ButtonVariants['intent']>;
export type ButtonSize = NonNullable<ButtonVariants['size']>;

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

/**
 * Button — Geist-style primitive, recipe-backed.
 *
 * Visual contract is identical to the pre-Panda hand-rolled class
 * strings (Geist gray-1000 default; brand-blue for primary-brand;
 * surface-fill secondary; transparent ghost; red-700 danger; etc.).
 *
 * Sizes follow the Geist spec: xs (28) | sm (32) | md (40) | lg (48) |
 * xl (52). All sizes share the same 6px radius + medium weight
 * (Geist button-14 fontWeight).
 */
export function Button({
  variant = 'primary',
  size = 'sm',
  loading = false,
  icon,
  iconPosition = 'left',
  fullWidth = false,
  className,
  children,
  href,
  disabled,
  type = 'button',
  onClick,
}: ButtonProps) {
  const classes = [button({ intent: variant, size }), fullWidth ? 'w-full' : '', className].filter(Boolean).join(' ');

  const isDisabled = disabled || loading;

  if (href) {
    // External-link safety: any http(s) URL that isn't same-origin opens
    // in a new tab with rel=noopener+noreferrer to prevent the linked
    // page from gaining access to window.opener (a phishing foothold)
    // and to keep referrer headers from leaking. Internal links keep
    // same-tab navigation so the back button works.
    const isExternal =
      /^https?:\/\//i.test(href) &&
      (typeof window === 'undefined' || new URL(href, window.location.href).origin !== window.location.origin);
    const linkProps = isExternal ? { target: '_blank' as const, rel: 'noopener noreferrer' } : {};
    return (
      <a
        href={href}
        className={classes}
        onClick={isDisabled ? undefined : onClick}
        aria-disabled={isDisabled || undefined}
        tabIndex={isDisabled ? -1 : undefined}
        {...linkProps}
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
