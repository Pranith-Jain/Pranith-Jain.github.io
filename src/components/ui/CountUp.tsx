import { useCountUp } from '../../hooks/useCountUp';

export interface CountUpProps {
  from?: number;
  to: number;
  duration?: number;
  className?: string;
  formatter?: (value: number) => string;
  ariaLabel?: string;
}

export function CountUp({ from = 0, to, duration = 600, className = '', formatter, ariaLabel }: CountUpProps) {
  const value = useCountUp({ from, to, duration });
  const display = formatter ? formatter(value) : value.toLocaleString();

  return (
    <span className={`tabular-nums ${className}`} aria-live="polite" aria-atomic="true" aria-label={ariaLabel}>
      {display}
    </span>
  );
}
