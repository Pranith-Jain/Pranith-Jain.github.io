import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Download, Loader2, Clock } from 'lucide-react';
import {
  CYBER_GRID,
  CYBER_GLOW,
  CYBER_ACCENT,
  SEVERITY_TEXT,
  defconFor,
  type SocSeverity,
  type CyberAccentKey,
} from './tone';
import { timeAgo } from './utils';

export type { SocSeverity } from './tone';

/* ─── Page shell — brand-aligned header + controls ─────────────────── */

interface WindowOption {
  days: number;
  label: string;
}

const DEFAULT_WINDOWS: ReadonlyArray<WindowOption> = [
  { days: 7, label: '7D' },
  { days: 30, label: '30D' },
  { days: 90, label: '90D' },
];

export interface SocStatus {
  label: string;
  severity: SocSeverity;
}

interface SocShellProps {
  title: string;
  icon: ReactNode;
  status: SocStatus;
  /** ISO string the data was last generated at. */
  generatedAt: string | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  /** Window options for the time-range toggle. Defaults to 7/30/90 days. */
  windows?: ReadonlyArray<WindowOption>;
  windowDays: number;
  onWindowChange: (days: number) => void;
  /** Auto-refresh interval in ms. 0 disables. Default 60_000. */
  autoRefreshMs?: number;
  onExport: () => void;
  children: ReactNode;
  /** Right-side extra content under the header (e.g. key totals). */
  meta?: ReactNode;
  /** Short description for under the h1 (matches the IntelDashboard pattern). */
  description?: ReactNode;
  /** Per-dashboard neon accent key. Drives glow + bracket hues. */
  accent: CyberAccentKey;
}

export function SocShell({
  title,
  icon,
  status,
  generatedAt,
  loading,
  error,
  onRefresh,
  windows = DEFAULT_WINDOWS,
  windowDays,
  onWindowChange,
  autoRefreshMs = 60_000,
  onExport,
  children,
  meta,
  description,
  accent,
}: SocShellProps): JSX.Element {
  const [nextRefreshIn, setNextRefreshIn] = useState<number>(autoRefreshMs);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    if (autoRefreshMs <= 0) return;
    setNextRefreshIn(autoRefreshMs);
    const id = window.setInterval(() => {
      setNextRefreshIn((v) => {
        if (v <= 1000) {
          queueMicrotask(() => onRefreshRef.current());
          return autoRefreshMs;
        }
        return v - 1000;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [autoRefreshMs]);

  // Reset the auto-refresh countdown whenever a refresh starts (manual
  // click or auto-fire). Otherwise the countdown keeps ticking down
  // through a manual refresh and the next auto-refresh fires too soon.
  useEffect(() => {
    if (loading) setNextRefreshIn(autoRefreshMs);
  }, [loading, autoRefreshMs]);

  const accentHex = CYBER_ACCENT[accent];
  return (
    <div
      className="min-h-screen relative bg-slate-50 dark:bg-[#05070d] text-slate-700 dark:text-slate-100"
      style={{
        backgroundImage: `linear-gradient(${CYBER_GRID} 1px, transparent 1px), linear-gradient(90deg, ${CYBER_GRID} 1px, transparent 1px)`,
        backgroundSize: '40px 40px',
      }}
    >
      {/* vignette — cheap radial overlay, no blur filter (dark only) */}
      <div
        className="pointer-events-none absolute inset-0 hidden dark:block"
        style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(5,7,13,0) 40%, rgba(5,7,13,0.85) 100%)' }}
      />
      <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8 py-12 relative">
        <BackLink />

        <div className="animate-fade-in-up mb-8">
          <h1 className="text-3xl sm:text-4xl font-display font-bold flex items-center gap-3 text-slate-900 dark:text-white uppercase tracking-wide">
            <span
              style={{ color: accentHex, '--glow': accentHex } as React.CSSProperties}
              className="[&_svg]:shrink-0 dark:[filter:drop-shadow(0_0_6px_var(--glow))]"
            >
              {icon}
            </span>
            {title}
          </h1>
          <div className="mt-3">
            <SocDefconBanner status={status} />
          </div>
          {description && (
            <p className="text-slate-600 dark:text-slate-400 mt-3 max-w-3xl leading-relaxed">{description}</p>
          )}
          {meta && <p className="text-xs text-slate-500 dark:text-slate-500 font-mono mt-2">{meta}</p>}
        </div>

        {/* Controls */}
        <div className="mb-8 flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-sm border border-slate-200 dark:border-slate-700/60 overflow-hidden">
            {windows.map((w) => {
              const on = w.days === windowDays;
              return (
                <button
                  key={w.days}
                  type="button"
                  onClick={() => onWindowChange(w.days)}
                  aria-label={`${w.days} day window`}
                  className="text-meta font-mono px-3 py-1.5 transition-colors bg-white dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  style={
                    on ? { color: accentHex, borderColor: accentHex, backgroundColor: `${accentHex}1f` } : undefined
                  }
                >
                  {w.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            aria-label="Refresh dashboard data"
            className="inline-flex items-center gap-1.5 text-meta font-mono px-3 py-1.5 rounded-sm border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900/60 text-slate-600 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500 disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            refresh
            {autoRefreshMs > 0 && !loading && (
              <span className="text-slate-500 dark:text-slate-500">· {Math.ceil(nextRefreshIn / 1000)}s</span>
            )}
          </button>

          <button
            type="button"
            onClick={onExport}
            aria-label="Export data as CSV"
            className="inline-flex items-center gap-1.5 text-meta font-mono px-3 py-1.5 rounded-sm border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900/60 text-slate-600 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500 transition-colors"
          >
            <Download size={12} /> export csv
          </button>

          {generatedAt && (
            <span className="hidden sm:inline-flex items-center gap-1.5 text-meta font-mono text-slate-500 dark:text-slate-500 ml-1">
              <Clock size={12} /> updated {timeAgo(generatedAt)}
            </span>
          )}

          {error && <span className="text-meta font-mono text-rose-600 dark:text-rose-400 ml-2">{error}</span>}
        </div>

        {loading ? <SocSkeleton /> : children}
      </div>
    </div>
  );
}

/* ─── Loading skeleton (shimmer placeholders for the full grid) ──── */

function SocSkeleton(): JSX.Element {
  const shimmer = 'animate-pulse rounded bg-slate-200 dark:bg-slate-800';
  const card = 'rounded-sm border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-950/40 p-4 sm:p-5';
  return (
    <div className="space-y-6" aria-label="Loading dashboard">
      {/* KPI skeleton row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className={card}>
            <div className={`${shimmer} h-3 w-16 mb-3`} />
            <div className={`${shimmer} h-7 w-24 mb-2`} />
            <div className={`${shimmer} h-3 w-32`} />
          </div>
        ))}
      </div>
      {/* Chart skeleton row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className={card}>
            <div className={`${shimmer} h-3 w-24 mb-6`} />
            <div className={`${shimmer} h-32 w-full`} />
          </div>
        ))}
      </div>
      {/* Second chart skeleton row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className={card}>
            <div className={`${shimmer} h-3 w-20 mb-6`} />
            <div className={`${shimmer} h-24 w-full`} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Back link (matches the rest of the app's BackLink pattern) ──── */

function BackLink(): JSX.Element {
  return (
    <Link
      to="/threatintel"
      className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
    >
      <ArrowLeft size={14} /> back to threatintel
    </Link>
  );
}

/* ─── DEFCON banner (severity-driven status line under the h1) ──────── */

function SocDefconBanner({ status }: { status: SocStatus }): JSX.Element {
  const { defcon, label } = defconFor(status.severity, status.label);
  const glow = CYBER_GLOW[status.severity];
  return (
    <span
      className={`inline-flex items-center gap-2 px-3 py-1 rounded-sm text-mini font-mono uppercase tracking-[0.2em] border ${SEVERITY_TEXT[status.severity]} dark:[text-shadow:0_0_8px_var(--glow)]`}
      style={
        {
          borderColor: `${glow}66`,
          backgroundColor: `${glow}14`,
          '--glow': `${glow}88`,
        } as React.CSSProperties
      }
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inset-0 rounded-full opacity-75 animate-ping" style={{ backgroundColor: glow }} />
        <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ backgroundColor: glow }} />
      </span>
      {defcon} · {label}
    </span>
  );
}

/* ─── Section header (matches the brand h2 pattern used elsewhere) ── */

export function SocSection({
  title,
  right,
  children,
}: {
  title: string;
  right?: ReactNode;
  children?: ReactNode;
}): JSX.Element {
  return (
    <section className="mb-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-sm font-bold uppercase tracking-[0.15em] text-slate-700 dark:text-slate-300 font-mono">
          {title}
        </h2>
        {right}
      </div>
      {children}
    </section>
  );
}

/* ─── KPI card (matches the standard IntelDashboard style) ────────── */

export function SocKpi({
  label,
  value,
  severity = 'info',
  sub,
  delta,
  deltaDirection = 'up',
  icon,
  accent,
  spark,
}: {
  label: string;
  value: ReactNode;
  severity?: SocSeverity;
  sub?: ReactNode;
  /** Inline delta chip (e.g. "+12 vs last 7d"). Direction picks the hue. */
  delta?: string;
  /** '+' / '−' / '~' — 'up' rose, 'down' emerald, 'flat' slate. */
  deltaDirection?: 'up' | 'down' | 'flat';
  icon?: ReactNode;
  /** Per-dashboard neon accent hex — drives the corner-bracket hue. */
  accent?: string;
  /** Optional sparkline / mini-chart rendered under the numeral. */
  spark?: ReactNode;
}): JSX.Element {
  const deltaCls =
    deltaDirection === 'up'
      ? 'text-rose-600 dark:text-rose-400'
      : deltaDirection === 'down'
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-slate-500 dark:text-slate-400';
  const glow = CYBER_GLOW[severity];
  const bracket = accent ?? glow;
  return (
    <div className="relative rounded-sm border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-950/40 p-4 sm:p-5 overflow-hidden">
      {/* corner brackets */}
      <span
        className="pointer-events-none absolute top-1 left-1 h-3 w-3 border-t-2 border-l-2"
        style={{ borderColor: bracket }}
      />
      <span
        className="pointer-events-none absolute bottom-1 right-1 h-3 w-3 border-b-2 border-r-2"
        style={{ borderColor: bracket }}
      />
      <div className="flex items-center justify-between mb-2">
        <span className="text-mini font-mono uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
          {label}
        </span>
        {icon && <span className="text-slate-400 dark:text-slate-500">{icon}</span>}
      </div>
      <div
        className={`font-mono font-extrabold leading-none tabular-nums text-3xl sm:text-4xl ${SEVERITY_TEXT[severity]} dark:[text-shadow:0_0_12px_var(--glow)]`}
        style={{ '--glow': glow } as React.CSSProperties}
      >
        {value}
      </div>
      {spark && <div className="mt-2">{spark}</div>}
      <div className="mt-2 flex items-center justify-between gap-2 text-meta font-mono text-slate-500 dark:text-slate-400">
        <span className="truncate">{sub}</span>
        {delta && <span className={deltaCls}>{delta}</span>}
      </div>
    </div>
  );
}

/* ─── Panel wrapper (matches the standard section panel) ──────────── */

export function SocPanel({ className = '', children }: { className?: string; children: ReactNode }): JSX.Element {
  return (
    <div
      className={`rounded-sm border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-950/40 p-4 sm:p-5 ${className}`}
    >
      {children}
    </div>
  );
}
