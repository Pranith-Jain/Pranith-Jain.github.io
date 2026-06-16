import { memo } from 'react';

/**
 * Zero-dependency SVG sparkline. Draws a single series as a line + faint
 * area fill with an endpoint dot. Inherits its colour from the parent via
 * `currentColor`, so callers set the tone with a Tailwind text class. Kept
 * tiny and presentational — no animation, no deps — so it adds ~nothing to
 * the bundle and is safe under prefers-reduced-motion.
 *
 * Decorative by default (aria-hidden): the LivePulse cell that hosts it
 * already exposes the same trend as text, so the chart is redundant for
 * screen readers. Pass `ariaLabel` to give it a standalone text equivalent.
 *
 * Memoised: pure function of `values` + presentation props; re-renders
 * only when the series or visual props change.
 */
interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
  ariaLabel?: string;
}

export const Sparkline = memo(function Sparkline({
  values,
  width = 104,
  height = 30,
  className,
  ariaLabel,
}: SparklineProps): JSX.Element | null {
  if (values.length < 2) return null;
  const pad = 3;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const stepX = w / (values.length - 1);
  const points = values.map((v, i) => {
    const x = pad + i * stepX;
    const y = pad + h - ((v - min) / range) * h;
    return [x, y] as const;
  });
  const line = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${(pad + w).toFixed(1)} ${(pad + h).toFixed(1)} L${pad.toFixed(1)} ${(pad + h).toFixed(1)} Z`;
  const [lastX, lastY] = points[points.length - 1] as readonly [number, number];
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      preserveAspectRatio="none"
      className={className}
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
    >
      <path d={area} fill="currentColor" opacity={0.12} />
      <path d={line} stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r={2.2} fill="currentColor" />
    </svg>
  );
});
