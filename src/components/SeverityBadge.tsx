import type { ReactNode } from 'react';
import { SEVERITY_TONE, SEVERITY_BAR, type Severity } from './severity';

/**
 * Severity pill — the canonical way to render a CVSS / EPSS / threat-level
 * severity rating. Wraps the SEVERITY_TONE map so pages stop hand-rolling
 * `inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase
 * tracking-wider border ${SEVERITY_TONE[...]}`.
 *
 *   <SeverityBadge severity="critical" />
 *   <SeverityBadge severity="high" score="9.8" />
 *   <SeverityBadge severity="medium">MEDIUM</SeverityBadge>
 *
 * Use <SeverityDot> for the solid-fill legend / count-strip variant.
 */
interface SeverityBadgeProps {
  severity: Severity;
  /** Optional score shown after the label (e.g. "9.8"). */
  score?: string | number;
  /** Override the label (defaults to the severity name uppercased). */
  children?: ReactNode;
  className?: string;
  /** Size variant. sm = compact pill, xs = micro (for dense tables). */
  size?: 'sm' | 'xs';
}

const SIZE: Record<'sm' | 'xs', string> = {
  sm: 'px-2 py-0.5 text-xs',
  xs: 'px-1.5 py-0.5 text-micro',
};

export function SeverityBadge({ severity, score, children, className = '', size = 'sm' }: SeverityBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded border font-bold uppercase tracking-wider ${SIZE[size]} ${SEVERITY_TONE[severity]} ${className}`}
    >
      {children ?? severity}
      {score !== undefined && <span className="ml-1 opacity-70">{score}</span>}
    </span>
  );
}

/**
 * Solid-fill severity dot — for legends, count strips, and progress bars
 * where the translucent badge tone reads too faint. Uses SEVERITY_BAR.
 *
 *   <SeverityDot severity="critical" />
 *   <SeverityDot severity="high" className="h-2 w-2" />
 */
interface SeverityDotProps {
  severity: Severity;
  className?: string;
  /** Accessible label; defaults to the severity name. */
  label?: string;
}

export function SeverityDot({ severity, className = '', label }: SeverityDotProps) {
  return (
    <span
      className={`inline-block rounded-full ${SEVERITY_BAR[severity]} ${className}`}
      role="img"
      aria-label={label ?? severity}
    />
  );
}
