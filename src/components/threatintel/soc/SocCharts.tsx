import { useState, type ReactNode } from 'react';
import { CHART_RANK } from './tone';
import { formatNumber } from './utils';

/* ─── Horizontal bar chart with hover tooltip + click-through ──────── */

export interface BarItem {
  label: string;
  value: number;
  /** Optional secondary annotation (e.g. "(KEV)" or "23%"). */
  hint?: string;
  /** Color override for this specific row. */
  color?: string;
  /** Optional click target — makes the bar a button-like element. */
  href?: string;
  /** Optional right-side meta rendered after the value. */
  meta?: ReactNode;
}

interface SocBarProps {
  items: BarItem[];
  /** Hard ceiling for bar widths. Default: max of all values. */
  max?: number;
  /** Show a numeric axis at the bottom (0 / mid / max). */
  axis?: boolean;
  /** Render as a vertical bar (column) chart instead. */
  vertical?: boolean;
  /** When vertical, fixed pixel height of the chart area. */
  height?: number;
  emptyText?: string;
  onItemClick?: (item: BarItem, index: number) => void;
  /** Color slot for items without an explicit override. */
  defaultColor?: string;
}

export function SocBar({
  items,
  max,
  axis = false,
  vertical = false,
  height = 180,
  emptyText = 'No data in window.',
  onItemClick,
  defaultColor,
}: SocBarProps): JSX.Element {
  const [hover, setHover] = useState<number | null>(null);
  if (items.length === 0) {
    return <p className="text-meta font-mono text-slate-500 italic">{emptyText}</p>;
  }
  const ceiling = max ?? Math.max(...items.map((i) => i.value), 1);
  const fmt = formatNumber;

  if (vertical) {
    const w = 720;
    const padL = 36;
    const padB = 22;
    const innerW = w - padL - 8;
    const innerH = height - padB - 8;
    const slotW = innerW / items.length;
    const barW = Math.max(2, slotW * 0.7);
    const fallback = defaultColor ?? CHART_RANK[0];
    return (
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${w} ${height}`} className="w-full" role="img" aria-label="Bar chart">
          {/* y-axis grid */}
          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const y = innerH - innerH * t;
            return (
              <g key={t}>
                <line
                  x1={padL}
                  y1={y}
                  x2={w - 8}
                  y2={y}
                  stroke="currentColor"
                  className="text-slate-200 dark:text-slate-800"
                  strokeDasharray="2 3"
                />
                <text
                  x={padL - 4}
                  y={y + 3}
                  textAnchor="end"
                  fontSize="10"
                  className="fill-slate-400"
                  fontFamily="ui-monospace,monospace"
                >
                  {fmt(Math.round(ceiling * t))}
                </text>
              </g>
            );
          })}
          {items.map((it, i) => {
            const x = padL + i * slotW + (slotW - barW) / 2;
            const h = (it.value / ceiling) * innerH;
            const y = innerH - h;
            const fill = it.color ?? fallback;
            const isHover = hover === i;
            return (
              <g
                key={`${it.label}-${i}`}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: onItemClick ? 'pointer' : 'default' }}
                onClick={() => onItemClick?.(it, i)}
              >
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={Math.max(1, h)}
                  fill={fill}
                  opacity={isHover ? 0.85 : 1}
                  rx={1}
                />
                {isHover && h > 14 && (
                  <text
                    x={x + barW / 2}
                    y={y - 3}
                    textAnchor="middle"
                    fontSize="10"
                    fill="currentColor"
                    className="fill-slate-700 dark:fill-slate-200"
                    fontFamily="ui-monospace,monospace"
                  >
                    {fmt(it.value)}
                  </text>
                )}
                <text
                  x={x + barW / 2}
                  y={innerH + 14}
                  textAnchor="middle"
                  fontSize="10"
                  className="fill-slate-500"
                  fontFamily="ui-monospace,monospace"
                >
                  {truncate(it.label, Math.max(5, Math.floor(slotW / 7)))}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    );
  }

  return (
    <ul className="space-y-1.5">
      {items.map((it, i) => {
        const pct = (it.value / ceiling) * 100;
        const color = it.color ?? defaultColor ?? CHART_RANK[Math.min(i, CHART_RANK.length - 1)];
        const isHover = hover === i;
        return (
          <li key={`${it.label}-${i}`} className="text-meta font-mono">
            <div className="flex items-baseline justify-between mb-0.5 gap-2">
              <button
                type="button"
                onClick={() => onItemClick?.(it, i)}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                className={`text-left truncate text-slate-700 dark:text-slate-300 ${onItemClick ? 'hover:text-brand-600 dark:hover:text-brand-400 cursor-pointer' : 'cursor-default'}`}
                title={it.label}
              >
                {it.label}
              </button>
              <span className="text-slate-500 tabular-nums shrink-0 flex items-center gap-1.5">
                {fmt(it.value)}
                {it.hint && <span className="text-slate-400">{it.hint}</span>}
                {it.meta}
              </span>
            </div>
            <div
              className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <div
                className="h-full rounded-full transition-opacity"
                style={{
                  width: `${Math.max(1.5, pct)}%`,
                  backgroundColor: color,
                  opacity: isHover ? 0.8 : 1,
                }}
                aria-label={`${it.label}: ${fmt(it.value)}`}
              />
            </div>
          </li>
        );
      })}
      {axis && (
        <li className="flex justify-between text-mini text-slate-400 dark:text-slate-500 font-mono pt-1">
          <span>0</span>
          <span>{fmt(Math.round(ceiling / 2))}</span>
          <span>{fmt(ceiling)}</span>
        </li>
      )}
    </ul>
  );
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, Math.max(0, n - 1)) + '…';
}

/* ─── Donut chart with hover + legend ──────────────────────────────── */

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
  hint?: string;
}

interface SocDonutProps {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  /** Center text (e.g. "44%"). */
  centerLabel?: ReactNode;
  centerSub?: ReactNode;
  /** Render slices as a vertical legend instead of an inline label box. */
  legend?: boolean;
  emptyText?: string;
}

export function SocDonut({
  slices,
  size = 200,
  thickness = 28,
  centerLabel,
  centerSub,
  legend = false,
  emptyText = 'No data in window.',
}: SocDonutProps): JSX.Element {
  const [hover, setHover] = useState<string | null>(null);
  const total = slices.reduce((s, x) => s + x.value, 0);

  if (total === 0) {
    return <p className="text-meta font-mono text-slate-500 italic">{emptyText}</p>;
  }

  const r = size / 2 - thickness / 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  let cumulative = 0;

  return (
    <div className={legend ? 'grid sm:grid-cols-[auto_1fr] gap-4 items-center' : ''}>
      <div className="relative inline-block">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="block"
          role="img"
          aria-label="Donut chart"
        >
          <circle
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke="currentColor"
            className="text-slate-200 dark:text-slate-800"
            strokeWidth={thickness}
          />
          {slices.map((s, i) => {
            const frac = s.value / total;
            const dash = circumference * frac;
            const offset = circumference * (1 - cumulative - frac);
            cumulative += frac;
            return (
              <circle
                key={`${s.label}-${i}`}
                cx={c}
                cy={c}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={offset}
                transform={`rotate(-90 ${c} ${c})`}
                onMouseEnter={() => setHover(s.label)}
                onMouseLeave={() => setHover(null)}
                style={{ transition: 'opacity 120ms ease', cursor: 'pointer', opacity: hover === s.label ? 0.8 : 1 }}
              >
                <title>
                  {s.label}: {s.value.toLocaleString('en-US')} ({((s.value / total) * 100).toFixed(1)}%)
                </title>
              </circle>
            );
          })}
        </svg>
        {(centerLabel || centerSub) && (
          <div className="absolute inset-0 grid place-items-center text-center pointer-events-none">
            <div>
              {centerLabel && (
                <div className="font-mono font-bold text-xl text-slate-900 dark:text-slate-100 tabular-nums">
                  {centerLabel}
                </div>
              )}
              {centerSub && (
                <div className="text-mini font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mt-0.5">
                  {centerSub}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {legend ? (
        <ul className="space-y-1.5 text-meta font-mono">
          {slices
            .slice()
            .sort((a, b) => b.value - a.value)
            .map((s) => (
              <li
                key={s.label}
                className={`flex items-center gap-2 rounded px-1 -mx-1 transition-colors ${
                  hover === s.label ? 'bg-slate-100 dark:bg-slate-800/60' : ''
                }`}
                onMouseEnter={() => setHover(s.label)}
                onMouseLeave={() => setHover(null)}
              >
                <span className="inline-block h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
                <span className="truncate text-slate-700 dark:text-slate-300">{s.label}</span>
                <span className="ml-auto text-slate-500 tabular-nums">
                  {s.value.toLocaleString('en-US')}{' '}
                  <span className="text-slate-400">({((s.value / total) * 100).toFixed(1)}%)</span>
                </span>
              </li>
            ))}
        </ul>
      ) : (
        <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 text-meta font-mono">
          {slices.map((s) => (
            <li
              key={s.label}
              className="flex items-center gap-2"
              onMouseEnter={() => setHover(s.label)}
              onMouseLeave={() => setHover(null)}
            >
              <span className="inline-block h-2 w-2 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
              <span className="truncate text-slate-700 dark:text-slate-300">{s.label}</span>
              <span className="ml-auto text-slate-500 tabular-nums">{((s.value / total) * 100).toFixed(1)}%</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ─── Sparkline / area chart (time series) ─────────────────────────── */

export interface SparkPoint {
  label: string;
  value: number;
}

interface SocSparklineProps {
  points: SparkPoint[];
  height?: number;
  fill?: boolean;
  /** Show label ticks on x-axis (sparse to avoid clutter). */
  showAxis?: boolean;
  emptyText?: string;
  color?: string;
}

export function SocSparkline({
  points,
  height = 140,
  fill = true,
  showAxis = true,
  emptyText = 'No data.',
  color,
}: SocSparklineProps): JSX.Element {
  if (points.length === 0) {
    return <p className="text-meta font-mono text-slate-500 italic">{emptyText}</p>;
  }
  const w = 720;
  const padL = 32;
  const padB = showAxis ? 22 : 8;
  const padT = 12;
  const innerW = w - padL - 8;
  const innerH = height - padB - padT;
  const max = Math.max(...points.map((p) => p.value), 1);
  const slotW = innerW / points.length;
  const fillColor = color ?? CHART_RANK[0];

  const pathD = points
    .map((p, i) => {
      const x = padL + i * slotW + slotW / 2;
      const y = padT + innerH - (p.value / max) * innerH;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
  const fillD = `${pathD} L ${padL + (points.length - 1) * slotW + slotW / 2} ${padT + innerH} L ${padL + slotW / 2} ${padT + innerH} Z`;

  const showTicks = showAxis && points.length <= 60;
  const tickInterval = Math.max(1, Math.floor(points.length / 6));
  const ticks = points.filter((_, i) => i % tickInterval === 0 || i === points.length - 1);

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${height}`} className="w-full" role="img" aria-label="Time series chart">
        {/* y-axis grid */}
        {[0, 0.5, 1].map((t) => {
          const y = padT + innerH - innerH * t;
          return (
            <g key={t}>
              <line
                x1={padL}
                y1={y}
                x2={w - 8}
                y2={y}
                stroke="currentColor"
                className="text-slate-200 dark:text-slate-800"
                strokeDasharray="2 3"
              />
              <text
                x={padL - 4}
                y={y + 3}
                textAnchor="end"
                fontSize="10"
                className="fill-slate-400"
                fontFamily="ui-monospace,monospace"
              >
                {Math.round(max * t)}
              </text>
            </g>
          );
        })}

        {fill && <path d={fillD} fill={fillColor} opacity={0.18} />}
        <path d={pathD} stroke={fillColor} strokeWidth={1.5} fill="none" />

        {points.map((p, i) => {
          const x = padL + i * slotW + slotW / 2;
          const y = padT + innerH - (p.value / max) * innerH;
          return (
            <circle key={i} cx={x} cy={y} r={2.5} fill={fillColor}>
              <title>
                {p.label}: {p.value}
              </title>
            </circle>
          );
        })}

        {showTicks &&
          ticks.map((p, i) => {
            const idx = points.indexOf(p);
            const x = padL + idx * slotW + slotW / 2;
            return (
              <text
                key={`${p.label}-${i}`}
                x={x}
                y={height - 6}
                textAnchor="middle"
                fontSize="10"
                className="fill-slate-500"
                fontFamily="ui-monospace,monospace"
              >
                {truncate(p.label, 8)}
              </text>
            );
          })}
      </svg>
    </div>
  );
}
