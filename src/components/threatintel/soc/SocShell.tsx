import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Download, Loader2, Clock } from 'lucide-react';
import { TONE_BG, TONE_RING, TONE_TEXT, TONE_GLOW, type SocTone } from './tone';
import { timeAgo } from './utils';

export type { SocTone } from './tone';

/* ─── L-shaped corner brackets (the tactical frame) ────────────────── */

export function CornerBrackets({ tone = 'cyan' }: { tone?: SocTone }): JSX.Element {
  const c = TONE_TEXT[tone];
  return (
    <>
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute left-0 top-0 h-3 w-3 border-l-2 border-t-2 ${c.replace('text-', 'border-')} rounded-tl-sm`}
      />
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute right-0 top-0 h-3 w-3 border-r-2 border-t-2 ${c.replace('text-', 'border-')} rounded-tr-sm`}
      />
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute left-0 bottom-0 h-3 w-3 border-l-2 border-b-2 ${c.replace('text-', 'border-')} rounded-bl-sm`}
      />
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute right-0 bottom-0 h-3 w-3 border-r-2 border-b-2 ${c.replace('text-', 'border-')} rounded-br-sm`}
      />
    </>
  );
}

/* ─── Page shell (header, status pill, time-range, refresh, export) ── */

interface WindowOption {
  days: number;
  label: string;
}

const DEFAULT_WINDOWS: ReadonlyArray<WindowOption> = [
  { days: 7, label: '7D' },
  { days: 30, label: '30D' },
  { days: 90, label: '90D' },
];

interface SocShellProps {
  title: string;
  icon: ReactNode;
  tone: SocTone;
  status: { label: string; tone: SocTone };
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
}

export function SocShell({
  title,
  icon,
  tone,
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
      <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <Link
          to="/threatintel"
          className="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-4 font-mono"
        >
          <ArrowLeft size={14} /> back to threatintel
        </Link>

        {/* ── Header ──────────────────────────────────────────────── */}
        <header className="mb-6 sm:mb-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span
                className={`grid place-items-center h-9 w-9 rounded border ${TONE_RING[tone]} bg-slate-900/40 dark:bg-slate-900/60 ${TONE_TEXT[tone]}`}
              >
                {icon}
              </span>
              <h1 className="text-2xl sm:text-3xl font-display font-extrabold tracking-tight">{title}</h1>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <SocStatusBadge label={status.label} tone={status.tone} />
              {generatedAt && (
                <span className="hidden sm:inline-flex items-center gap-1.5 text-meta font-mono text-slate-500 dark:text-slate-400">
                  <Clock size={12} /> updated {timeAgo(generatedAt)}
                </span>
              )}
            </div>
          </div>

          {meta && <div className="mt-3 text-meta font-mono text-slate-500 dark:text-slate-400">{meta}</div>}

          {/* Controls */}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded border border-slate-200 dark:border-slate-800 overflow-hidden">
              {windows.map((w) => {
                const on = w.days === windowDays;
                return (
                  <button
                    key={w.days}
                    type="button"
                    onClick={() => onWindowChange(w.days)}
                    className={`text-meta font-mono px-3 py-1.5 transition-colors ${
                      on
                        ? `${TONE_BG[tone]} text-white`
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
              className="inline-flex items-center gap-1.5 text-meta font-mono px-3 py-1.5 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-brand-500/40 disabled:opacity-50 transition-colors"
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
              className="inline-flex items-center gap-1.5 text-meta font-mono px-3 py-1.5 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-brand-500/40 transition-colors"
            >
              <Download size={12} /> export csv
            </button>

            {error && <span className="text-meta font-mono text-rose-600 dark:text-rose-400 ml-2">{error}</span>}
          </div>
        </header>

        {children}
      </div>
    </div>
  );
}

/* ─── Status pill (DEFCON-style with pulsing dot) ──────────────────── */

export function SocStatusBadge({ label, tone }: { label: string; tone: SocTone }): JSX.Element {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded border px-2.5 py-1 text-meta font-mono uppercase tracking-wider ${TONE_TEXT[tone]} ${TONE_RING[tone]} bg-slate-900/40 dark:bg-slate-900/60`}
    >
      <span className="relative flex h-2 w-2">
        <span className={`absolute inset-0 rounded-full ${TONE_BG[tone]} opacity-75 animate-ping`} />
        <span className={`relative inline-flex rounded-full h-2 w-2 ${TONE_BG[tone]}`} />
      </span>
      {label}
    </span>
  );
}

/* ─── Section header (underlined with `>` arrow) ───────────────────── */

export function SocSection({
  title,
  tone = 'cyan',
  children,
  right,
}: {
  title: string;
  tone?: SocTone;
  children?: ReactNode;
  right?: ReactNode;
}): JSX.Element {
  return (
    <section className="mb-4">
      <div className="flex items-center gap-2 mb-3">
        <span aria-hidden="true" className={`font-mono ${TONE_TEXT[tone]}`}>
          {'>'}
        </span>
        <h2 className={`text-eyebrow font-mono uppercase tracking-[0.18em] ${TONE_TEXT[tone]}`}>{title}</h2>
        <span className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
        {right}
      </div>
      {children}
    </section>
  );
}

/* ─── KPI card (huge number with glow + delta + bracket frame) ─────── */

export function SocKpi({
  label,
  value,
  tone = 'cyan',
  sub,
  delta,
  deltaTone,
  icon,
}: {
  label: string;
  value: ReactNode;
  tone?: SocTone;
  sub?: ReactNode;
  /** Inline delta chip (e.g. "+12 vs last 7d"). */
  delta?: string;
  /** Tone override for the delta chip. Defaults to emerald-up / rose-down. */
  deltaTone?: 'emerald' | 'rose' | 'amber' | 'slate';
  icon?: ReactNode;
}): JSX.Element {
  return (
    <div
      className={`relative rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-4 sm:p-5`}
    >
      <CornerBrackets tone={tone} />
      <div className="flex items-center justify-between mb-2">
        <span className={`text-eyebrow font-mono uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400`}>
          {label}
        </span>
        {icon && <span className={`${TONE_TEXT[tone]} opacity-70`}>{icon}</span>}
      </div>
      <div
        className={`font-mono font-extrabold leading-none tabular-nums text-4xl sm:text-5xl ${TONE_TEXT[tone]} ${TONE_GLOW[tone]}`}
      >
        {value}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-meta font-mono text-slate-500 dark:text-slate-400">
        <span className="truncate">{sub}</span>
        {delta && (
          <span
            className={
              deltaTone === 'rose'
                ? 'text-rose-500 dark:text-rose-400'
                : deltaTone === 'amber'
                  ? 'text-amber-500 dark:text-amber-400'
                  : deltaTone === 'slate'
                    ? 'text-slate-500'
                    : 'text-emerald-500 dark:text-emerald-400'
            }
          >
            {delta}
          </span>
        )}
      </div>
    </div>
  );
}

/* ─── Panel wrapper (corner brackets + ring) ───────────────────────── */

export function SocPanel({
  tone = 'cyan',
  className = '',
  children,
}: {
  tone?: SocTone;
  className?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div
      className={`relative rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-4 sm:p-5 ${className}`}
    >
      <CornerBrackets tone={tone} />
      {children}
    </div>
  );
}
