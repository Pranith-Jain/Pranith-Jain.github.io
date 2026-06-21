/**
 * <SeverityDot> — solid colored dot for legends, count strips, and
 * progress bar fills where the translucent badge tone reads too faint.
 *
 * Replaces the legacy `className={\`inline-block w-2 h-2 rounded-full
 * shrink-0 ${SEVERITY_BAR[severity]}\`}` pattern with a typed prop API.
 *
 * Default size is 8x8 (h-2 w-2) — matches the most common legend-dot
 * use. Override via `className` if a different size is needed.
 */
import { severityBar } from '../styled/recipes';
import type { Severity } from './severity';

export interface SeverityDotProps {
  tone: Severity;
  /** Visual size token. Defaults to 'sm' (8px). */
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** Extra classes (e.g. for animation, layout). */
  className?: string;
  /** Optional accessible label — defaults to the tone name. */
  'aria-label'?: string;
}

const SIZE: Record<NonNullable<SeverityDotProps['size']>, string> = {
  xs: 'h-1.5 w-1.5',
  sm: 'h-2 w-2',
  md: 'h-3 w-3',
  lg: 'h-4 w-4',
};

export function SeverityDot({ tone, size = 'sm', className, 'aria-label': ariaLabel }: SeverityDotProps) {
  return (
    <span
      className={`inline-block rounded-full shrink-0 ${severityBar({ tone })} ${SIZE[size]} ${className ?? ''}`.trim()}
      aria-hidden={ariaLabel ? undefined : 'true'}
      aria-label={ariaLabel ?? `${tone} severity`}
    />
  );
}
