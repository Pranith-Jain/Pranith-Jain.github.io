import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Download, Loader2, Clock } from 'lucide-react';
import { SEVERITY_DOT, SEVERITY_PILL, SEVERITY_TEXT, type SocSeverity } from './tone';
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
}: SocShellProps): JSX.Element {
  const [nextRefreshIn, setNextRefreshIn] = useState<number>(autoRefreshMs);

  useEffect(() => {
    if (autoRefreshMs <= 0) return;
    setNextRefreshIn(autoRefreshMs);
    const id = window.setInterval(() => {
      setNextRefreshIn((v) => {
        if (v <= 1000) {
          onRefresh();
          return autoRefreshMs;
        }
        return v - 1000;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [autoRefreshMs, onRefresh]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8 py-12 text-slate-900 dark:text-slate-100">
        <BackLink />

        <div className="animate-fade-in-up mb-8">
          <h1 className="text-3xl sm:text-4xl font-display font-bold flex items-center gap-3">
            <span className="text-brand-600 dark:text-brand-400 [&_svg]:shrink-0">{icon}</span>
            {title}
            <SocStatusBadge status={status} />
          </h1>
          {description && (
            <p className="text-slate-600 dark:text-slate-400 mt-2 max-w-3xl leading-relaxed">{description}</p>
          )}
          {meta && <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-2">{meta}</p>}
        </div>

        {/* Controls */}
        <div className="mb-8 flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
            {windows.map((w) => {
              const on = w.days === windowDays;
              return (
                <button
                  key={w.days}
                  type="button"
                  onClick={() => onWindowChange(w.days)}
                  className={`text-meta font-mono px-3 py-1.5 transition-colors ${
                    on
                      ? 'bg-brand-500/15 text-brand-700 dark:text-brand-300'
                      : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
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
            className="inline-flex items-center gap-1.5 text-meta font-mono px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-brand-500/40 disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            refresh
            {autoRefreshMs > 0 && !loading && (
              <span className="text-slate-400 dark:text-slate-500">· {Math.ceil(nextRefreshIn / 1000)}s</span>
            )}
          </button>

          <button
            type="button"
            onClick={onExport}
            className="inline-flex items-center gap-1.5 text-meta font-mono px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-brand-500/40 transition-colors"
          >
            <Download size={12} /> export csv
          </button>

          {generatedAt && (
            <span className="hidden sm:inline-flex items-center gap-1.5 text-meta font-mono text-slate-500 dark:text-slate-400 ml-1">
              <Clock size={12} /> updated {timeAgo(generatedAt)}
            </span>
          )}

          {error && <span className="text-meta font-mono text-rose-600 dark:text-rose-400 ml-2">{error}</span>}
        </div>

        {children}
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

/* ─── Status badge (small, severity-colored, sits next to the h1) ──── */

function SocStatusBadge({ status }: { status: SocStatus }): JSX.Element {
  return (
    <span
      className={`inline-flex items-center gap-1.5 ml-1 px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider border ${SEVERITY_PILL[status.severity]}`}
    >
      <span className={`relative flex h-1.5 w-1.5`}>
        <span className={`absolute inset-0 rounded-full ${SEVERITY_DOT[status.severity]} opacity-75 animate-ping`} />
        <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${SEVERITY_DOT[status.severity]}`} />
      </span>
      {status.label}
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
        <h2 className="text-sm font-bold uppercase tracking-[0.15em] text-brand-600 dark:text-brand-400 font-mono">
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
}): JSX.Element {
  const deltaCls =
    deltaDirection === 'up'
      ? 'text-rose-600 dark:text-rose-400'
      : deltaDirection === 'down'
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-slate-500 dark:text-slate-400';
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
          {label}
        </span>
        {icon && <span className="text-slate-400 dark:text-slate-500">{icon}</span>}
      </div>
      <div
        className={`font-mono font-extrabold leading-none tabular-nums text-3xl sm:text-4xl ${SEVERITY_TEXT[severity]}`}
      >
        {value}
      </div>
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
      className={`rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 ${className}`}
    >
      {children}
    </div>
  );
}
