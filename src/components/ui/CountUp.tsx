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

  // No aria-live: the animated counter mutates ~60×/sec, and a live region
  // would announce every intermediate value. Screen readers get the final
  // value once via aria-label; the animated text is hidden from them.
  return (
    <span className={`tabular-nums ${className}`} aria-label={ariaLabel ?? String(to)} role="img">
      <span aria-hidden="true">{display}</span>
    </span>
  );
}
