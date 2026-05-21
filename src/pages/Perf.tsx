import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Gauge, RefreshCw, AlertTriangle } from 'lucide-react';

/**
 * /perf — public performance dashboard.
 *
 * Data comes from the daily Lighthouse cron (`runPerfNow`, scheduled at
 * 02:00 UTC). It calls Google PageSpeed Insights for each tracked URL
 * × mobile/desktop and stores the snapshot in KV. This page renders the
 * latest snapshot in detail plus a 7-day trend on the four category
 * scores so a regression is obvious at a glance.
 *
 * Real data — not a self-claim. When the cron hasn't run yet (fresh
 * deploy, KV unbound, cron disabled), the page shows an empty state with
 * an "ask back tomorrow" note rather than fabricating numbers.
 */

interface PsiResult {
  url: string;
  strategy: 'mobile' | 'desktop';
  fetched_at: string;
  scores: {
    performance?: number;
    accessibility?: number;
    best_practices?: number;
    seo?: number;
  };
  lab: {
    lcp_ms?: number;
    tbt_ms?: number;
    cls?: number;
    fcp_ms?: number;
    speed_index_ms?: number;
  };
  field?: {
    lcp_ms?: number;
    inp_ms?: number;
    cls?: number;
    lcp_category?: string;
    inp_category?: string;
    cls_category?: string;
  };
  error?: string;
}

interface PerfSnapshot {
  generated_at: string;
  results: PsiResult[];
}

interface PerfResponse {
  latest: PerfSnapshot | null;
  history: Record<string, PerfSnapshot>;
}

const CATEGORY_LABELS: Array<{ key: keyof PsiResult['scores']; label: string }> = [
  { key: 'performance', label: 'Performance' },
  { key: 'accessibility', label: 'Accessibility' },
  { key: 'best_practices', label: 'Best Practices' },
  { key: 'seo', label: 'SEO' },
];

function scoreColor(score?: number): string {
  if (score === undefined) return 'text-slate-400';
  if (score >= 0.9) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 0.5) return 'text-amber-600 dark:text-amber-400';
  return 'text-rose-600 dark:text-rose-400';
}

function scoreBar(score?: number): string {
  if (score === undefined) return 'bg-slate-300 dark:bg-slate-700';
  if (score >= 0.9) return 'bg-emerald-500';
  if (score >= 0.5) return 'bg-amber-500';
  return 'bg-rose-500';
}

function formatScore(score?: number): string {
  if (score === undefined) return '—';
  return Math.round(score * 100).toString();
}

/** Format a duration in ms. PSI returns Lighthouse-style decimal ms;
 *  we want seconds for >1000ms readouts, integer ms otherwise. */
function formatMs(ms?: number): string {
  if (ms === undefined) return '—';
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${Math.round(ms)}ms`;
}

function formatCls(cls?: number): string {
  if (cls === undefined) return '—';
  return cls.toFixed(3);
}

/** Path part of a tracked URL for the table display. */
function shortPath(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname === '/' ? '/' : u.pathname.replace(/\/$/, '');
  } catch {
    return url;
  }
}

export default function PerfPage(): JSX.Element {
  const [data, setData] = useState<PerfResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [strategy, setStrategy] = useState<'mobile' | 'desktop'>('mobile');
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/v1/perf');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = (await r.json()) as PerfResponse;
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const rows = useMemo(() => {
    if (!data?.latest) return [];
    return data.latest.results.filter((r) => r.strategy === strategy);
  }, [data, strategy]);

  /** 7-day trend per (url, strategy) — average performance score by date. */
  const trend = useMemo(() => {
    if (!data) return [] as Array<{ date: string; avg: number; count: number }>;
    const dates = Object.keys(data.history).sort().slice(-7);
    return dates.map((date) => {
      const snap = data.history[date]!;
      const matching = snap.results.filter((r) => r.strategy === strategy && r.scores.performance !== undefined);
      const sum = matching.reduce((a, r) => a + (r.scores.performance ?? 0), 0);
      const avg = matching.length > 0 ? sum / matching.length : 0;
      return { date, avg, count: matching.length };
    });
  }, [data, strategy]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-10 text-slate-900 dark:text-slate-100">
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-6 font-mono"
      >
        <ArrowLeft size={14} /> back to home
      </Link>

      <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 inline-flex items-center gap-3">
        <Gauge size={28} className="text-brand-600 dark:text-brand-400" /> Performance
      </h1>
      <p className="text-slate-600 dark:text-slate-400 mb-2 max-w-2xl leading-relaxed">
        Daily Lighthouse + Core Web Vitals readouts measured via Google PageSpeed Insights. Real numbers, not a
        self-claim — the cron runs at 02:00 UTC against six tracked URLs (mobile + desktop) and the dashboard surfaces
        whatever the most recent run produced.
      </p>
      <p className="text-[11px] font-mono text-slate-500 mb-6">
        {data?.latest && <>last measured {new Date(data.latest.generated_at).toLocaleString()} · </>}
        {Object.keys(data?.history ?? {}).length} day{Object.keys(data?.history ?? {}).length === 1 ? '' : 's'} of
        history
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded border border-slate-200 dark:border-slate-800 overflow-hidden">
          {(['mobile', 'desktop'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStrategy(s)}
              className={
                strategy === s
                  ? 'text-xs font-mono uppercase tracking-wider px-3 py-1.5 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                  : 'text-xs font-mono uppercase tracking-wider px-3 py-1.5 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }
            >
              {s}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setRefreshKey((k) => k + 1)}
          disabled={loading}
          className="text-[11px] font-mono px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 hover:border-brand-500/40 inline-flex items-center gap-1 disabled:opacity-40"
        >
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> refresh
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50/50 dark:bg-rose-900/15 p-4"
        >
          <div className="text-sm font-mono text-rose-700 dark:text-rose-300 inline-flex items-center gap-2">
            <AlertTriangle size={14} /> {error}
          </div>
        </div>
      )}

      {!loading && !error && !data?.latest && (
        <div className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/15 p-5">
          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
            No perf snapshot yet — the daily cron runs at <code className="font-mono">02:00 UTC</code> and stores the
            first result in KV. Check back after the next firing.
          </p>
        </div>
      )}

      {rows.length > 0 && (
        <>
          {/* 7-day trend bar */}
          {trend.length > 1 && (
            <section className="mb-6 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500">
                  Performance — 7-day trend ({strategy} avg across tracked URLs)
                </h2>
              </div>
              <div className="flex items-end gap-1 h-20">
                {trend.map((t) => {
                  const pct = Math.max(2, Math.round(t.avg * 100));
                  return (
                    <div key={t.date} className="flex-1 flex flex-col items-center justify-end">
                      <div
                        className={`w-full ${scoreBar(t.avg)} rounded-t transition-all`}
                        style={{ height: `${pct}%` }}
                        title={`${t.date}: ${Math.round(t.avg * 100)}/100 (${t.count} URLs)`}
                      />
                      <span className="text-[9px] font-mono text-slate-500 mt-1">{t.date.slice(5)}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Per-URL table */}
          <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[10px] font-mono uppercase tracking-wider text-slate-500 bg-slate-50/60 dark:bg-slate-900/60">
                <tr>
                  <th className="px-3 py-2">URL</th>
                  {CATEGORY_LABELS.map((c) => (
                    <th key={c.key} className="px-3 py-2 text-right">
                      {c.label}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right">LCP</th>
                  <th className="px-3 py-2 text-right">CLS</th>
                  <th className="px-3 py-2 text-right">TBT</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.url} className="border-t border-slate-200/70 dark:border-slate-800/70">
                    <td className="px-3 py-2 font-mono text-[12px]">
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-900 dark:text-slate-100 hover:text-brand-600 dark:hover:text-brand-400"
                      >
                        {shortPath(r.url)}
                      </a>
                      {r.error && <span className="text-rose-500 text-[10px] block">{r.error}</span>}
                    </td>
                    {CATEGORY_LABELS.map((c) => {
                      const s = r.scores[c.key];
                      return (
                        <td key={c.key} className="px-3 py-2 text-right">
                          <span className={`font-mono font-bold tabular-nums ${scoreColor(s)}`}>{formatScore(s)}</span>
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-[12px] text-slate-700 dark:text-slate-300">
                      {formatMs(r.lab.lcp_ms)}
                      {r.field?.lcp_category && (
                        <span
                          className={`block text-[9px] uppercase ${
                            r.field.lcp_category === 'FAST'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : r.field.lcp_category === 'AVERAGE'
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-rose-600 dark:text-rose-400'
                          }`}
                          title="Chrome User Experience Report (real-user data)"
                        >
                          crux {r.field.lcp_category.toLowerCase()}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-[12px] text-slate-700 dark:text-slate-300">
                      {formatCls(r.lab.cls)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-[12px] text-slate-700 dark:text-slate-300">
                      {formatMs(r.lab.tbt_ms)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <p className="mt-4 text-[11px] font-mono text-slate-500 leading-relaxed max-w-3xl">
            Scores: <span className="text-emerald-600 dark:text-emerald-400">90-100 good</span> ·{' '}
            <span className="text-amber-600 dark:text-amber-400">50-89 needs improvement</span> ·{' '}
            <span className="text-rose-600 dark:text-rose-400">0-49 poor</span>. LCP (Largest Contentful Paint) under
            2.5s and CLS (Cumulative Layout Shift) under 0.1 are Google's "good" thresholds. TBT is Total Blocking Time
            — a Lighthouse proxy for interactivity in lab mode; the real-user equivalent is INP, which appears in the
            CrUX line under LCP when CrUX has field data for that URL.
          </p>
        </>
      )}
    </div>
  );
}
