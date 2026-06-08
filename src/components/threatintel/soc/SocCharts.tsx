import { useState, type ReactNode } from 'react';
import { CHART_RANK, CHART_DAILY } from './tone';
import { formatNumber } from './utils';

export interface BarItem {
  label: string;
  value: number;
  hint?: string;
  color?: string;
  href?: string;
  meta?: ReactNode;
}

interface SocBarProps {
  items: BarItem[];
  max?: number;
  axis?: boolean;
  vertical?: boolean;
  height?: number;
  emptyText?: string;
  onItemClick?: (item: BarItem, index: number) => void;
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
    return (
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${w} ${height}`}
          className="w-full"
          style={{ display: 'block' }}
          role="img"
          aria-label="Bar chart"
        >
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
                  fontSize="9"
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
            const fill = it.color ?? defaultColor ?? CHART_RANK[Math.min(i, CHART_RANK.length - 1)];
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
                  height={Math.max(4, h)}
                  fill={fill}
                  opacity={isHover ? 0.85 : 1}
                  rx={1}
                />
                {isHover && (
                  <text
                    x={x + barW / 2}
                    y={Math.max(10, y - 3)}
                    textAnchor="middle"
                    fontSize="9"
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
                  fontSize="9"
                  className="fill-slate-500"
                  fontFamily="ui-monospace,monospace"
                >
                  {truncate(it.label, Math.max(4, Math.floor(slotW / 7)))}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((it, i) => {
        const pct = (it.value / ceiling) * 100;
        const color = it.color ?? defaultColor ?? CHART_RANK[Math.min(i, CHART_RANK.length - 1)];
        const isHover = hover === i;
        return (
          <li key={`${it.label}-${i}`} className="text-meta font-mono">
            <div className="flex items-baseline justify-between mb-1 gap-2">
              <button
                type="button"
                onClick={() => onItemClick?.(it, i)}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                className={`text-left truncate text-slate-800 dark:text-slate-200 font-medium ${onItemClick ? 'hover:text-brand-600 dark:hover:text-brand-400 cursor-pointer' : 'cursor-default'}`}
                title={it.label}
              >
                {it.label}
              </button>
              <span className="text-slate-600 dark:text-slate-400 tabular-nums shrink-0 flex items-center gap-1.5">
                {fmt(it.value)}
                {it.hint && <span className="text-slate-400">{it.hint}</span>}
                {it.meta}
              </span>
            </div>
            <div
              className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden ring-1 ring-inset ring-slate-200 dark:ring-slate-700/50"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <div
                className="h-full rounded-full transition-all duration-150"
                style={{
                  width: `${Math.max(2, pct)}%`,
                  backgroundColor: color,
                  opacity: isHover ? 0.85 : 1,
                }}
                aria-label={`${it.label}: ${fmt(it.value)}`}
              />
            </div>
          </li>
        );
      })}
      {axis && (
        <li className="flex justify-between text-[10px] text-slate-400 dark:text-slate-500 font-mono pt-1">
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
  centerLabel?: ReactNode;
  centerSub?: ReactNode;
  legend?: boolean;
  emptyText?: string;
}

export function SocDonut({
  slices,
  size = 200,
  thickness = 32,
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
    <div className={legend ? 'grid sm:grid-cols-[auto_1fr] gap-5 items-start' : ''}>
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
            const offset = circumference * (1 - cumulative);
            cumulative += frac;
            return (
              <circle
                key={`${s.label}-${i}`}
                cx={c}
                cy={c}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={hover === s.label ? thickness + 5 : thickness}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={offset}
                transform={`rotate(-90 ${c} ${c})`}
                onMouseEnter={() => setHover(s.label)}
                onMouseLeave={() => setHover(null)}
                style={{ transition: 'stroke-width 140ms ease, opacity 140ms ease', cursor: 'pointer' }}
                opacity={hover && hover !== s.label ? 0.5 : 1}
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
            <div className="leading-tight">
              {centerLabel && (
                <div className="font-mono font-bold text-2xl text-slate-900 dark:text-slate-100 tabular-nums">
                  {centerLabel}
                </div>
              )}
              {centerSub && (
                <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mt-1">
                  {centerSub}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {legend ? (
        <ul className="space-y-1.5 text-meta font-mono w-full">
          {slices
            .slice()
            .sort((a, b) => b.value - a.value)
            .map((s) => (
              <li
                key={s.label}
                className={`flex items-center gap-2 rounded-md px-2 -mx-2 py-1 transition-colors ${
                  hover === s.label ? 'bg-slate-100 dark:bg-slate-800/60' : ''
                }`}
                onMouseEnter={() => setHover(s.label)}
                onMouseLeave={() => setHover(null)}
              >
                <span className="inline-block h-3 w-3 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
                <span className="truncate text-slate-700 dark:text-slate-300">{s.label}</span>
                <span className="ml-auto text-slate-600 dark:text-slate-400 tabular-nums">
                  {s.value.toLocaleString('en-US')}{' '}
                  <span className="text-slate-400">({((s.value / total) * 100).toFixed(1)}%)</span>
                </span>
              </li>
            ))}
        </ul>
      ) : (
        <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-meta font-mono">
          {slices.map((s) => (
            <li
              key={s.label}
              className="flex items-center gap-2 rounded-md px-1 -mx-1 py-0.5 transition-colors"
              onMouseEnter={() => setHover(s.label)}
              onMouseLeave={() => setHover(null)}
            >
              <span className="inline-block h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
              <span className="truncate text-slate-700 dark:text-slate-300">{s.label}</span>
              <span className="ml-auto text-slate-600 dark:text-slate-400 tabular-nums">
                {((s.value / total) * 100).toFixed(1)}%
              </span>
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
  const fillColor = color ?? CHART_DAILY;

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
      <svg
        viewBox={`0 0 ${w} ${height}`}
        className="w-full"
        style={{ display: 'block' }}
        role="img"
        aria-label="Time series chart"
      >
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
                fontSize="9"
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
            <circle key={i} cx={x} cy={y} r={1.6} fill={fillColor}>
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
                fontSize="9"
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
