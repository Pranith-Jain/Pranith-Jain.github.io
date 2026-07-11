import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DataState } from '../../components/DataState';
import { BackLink } from '../../components/BackLink';
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Bug,
  CheckCircle2,
  Clock,
  Loader2,
  Radio,
  RefreshCw,
  Skull,
  Target,
  XCircle,
} from 'lucide-react';

interface FeedRow {
  id: string;
  label: string;
  page_path: string;
  status: 'ok' | 'degraded' | 'down' | 'cold';
  reason: string;
  upstream_age_s?: number;
  reliability?: string;
  category?: string;
  info_credibility?: number;
  admiralty_grade?: string;
  metrics?: Record<string, number>;
}

interface FeedStatusData {
  generated_at: string;
  rows: FeedRow[];
  overall: 'ok' | 'degraded' | 'down' | 'cold';
  total_sources: number;
  healthy: number;
  degraded: number;
  down: number;
  cold: number;
  reliability_distribution: Record<string, number>;
  degraded_sources: Array<{ id: string; status: string; reason: string; page_path: string }>;
}

interface IntelData {
  generated_at: string;
  telegram_monitor: { total_leaks: number; leaks_24h: number; watched_channels: number };
  leaks_7d: number;
  feed_health: string;
  feed_count: number;
}

interface SnapshotData {
  generated_at?: string;
  ioc_count?: number;
  ransomware_claims_24h?: number;
  cve_kev_count?: number;
  [key: string]: unknown;
}

const STATUS_ICON: Record<string, typeof CheckCircle2> = {
  ok: CheckCircle2,
  degraded: AlertTriangle,
  down: XCircle,
  cold: Clock,
};

const STATUS_COLOR: Record<string, string> = {
  ok: 'text-emerald-600 dark:text-emerald-400',
  degraded: 'text-amber-600 dark:text-amber-400',
  down: 'text-rose-600 dark:text-rose-400',
  cold: 'text-slate-400 dark:text-slate-500',
};

const STATUS_BG: Record<string, string> = {
  ok: 'bg-emerald-500/10 border-emerald-500/30',
  degraded: 'bg-amber-500/10 border-amber-500/30',
  down: 'bg-rose-500/10 border-rose-500/30',
  cold: 'bg-slate-500/10 border-slate-500/30',
};

function formatAge(seconds?: number): string {
  if (seconds === undefined) return '—';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

function reliabilityColor(grade?: string): string {
  if (!grade) return 'text-slate-400';
  const letter = grade.charAt(0);
  if (letter === 'A') return 'text-emerald-600 dark:text-emerald-400';
  if (letter === 'B') return 'text-sky-600 dark:text-sky-400';
  if (letter === 'C') return 'text-amber-600 dark:text-amber-400';
  return 'text-rose-600 dark:text-rose-400';
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }): JSX.Element {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-[rgb(var(--surface-300))] overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function AnalyticsDashboard(): JSX.Element {
  const [feedData, setFeedData] = useState<FeedStatusData | null>(null);
  const [intelData, setIntelData] = useState<IntelData | null>(null);
  const [snapshotData, setSnapshotData] = useState<SnapshotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    const opts = { signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(15_000)]) };

    Promise.all([
      fetch('/api/v1/feed-status', opts)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`feed-status ${r.status}`))))
        .catch(() => null),
      fetch('/api/v1/intel-dashboard', opts)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`intel-dashboard ${r.status}`))))
        .catch(() => null),
      fetch('/api/v1/snapshot', opts)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`snapshot ${r.status}`))))
        .catch(() => null),
    ])
      .then(([feed, intel, snapshot]) => {
        if (cancelled) return;
        setFeedData(feed as FeedStatusData | null);
        setIntelData(intel as IntelData | null);
        setSnapshotData(snapshot as SnapshotData | null);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load analytics');
        setLoading(false);
      });

    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [refreshKey]);

  const categoryBreakdown = useMemo(() => {
    if (!feedData) return [];
    const cats: Record<string, { ok: number; degraded: number; down: number; cold: number; total: number }> = {};
    for (const row of feedData.rows) {
      const cat = row.category ?? 'other';
      if (!cats[cat]) cats[cat] = { ok: 0, degraded: 0, down: 0, cold: 0, total: 0 };
      cats[cat][row.status]++;
      cats[cat].total++;
    }
    return Object.entries(cats)
      .map(([name, counts]) => ({ name, ...counts }))
      .sort((a, b) => b.total - a.total);
  }, [feedData]);

  const topMetrics = useMemo(() => {
    if (!feedData) return [];
    const withMetrics = feedData.rows
      .filter((r) => r.metrics && Object.keys(r.metrics).length > 0)
      .flatMap((r) =>
        Object.entries(r.metrics!).map(([key, value]) => ({
          source: r.label,
          key,
          value,
          status: r.status,
        }))
      )
      .sort((a, b) => b.value - a.value);
    return withMetrics.slice(0, 12);
  }, [feedData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="animate-spin text-slate-400" />
      </div>
    );
  }

  if (error) {
    return (
      <DataState
        loading={false}
        error={error}
        onRetry={() => {
          setError(null);
          setLoading(true);
          setRefreshKey((k) => k + 1);
        }}
      />
    );
  }

  const feed = feedData;
  const intel = intelData;
  const snap = snapshotData;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono transition-colors"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up mb-10">
        <h1 className="text-3xl sm:text-4xl font-display font-semibold mb-2 flex items-center gap-3">
          <span className="text-brand-600 dark:text-brand-400">
            <BarChart3 size={28} />
          </span>{' '}
          Analytics &amp; Ops
        </h1>
        <p className="text-muted max-w-2xl leading-relaxed">
          Combined view of platform health, feed reliability, and key intelligence metrics. Data refreshes on each load.
        </p>
        <div className="flex items-center gap-3 mt-3">
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setError(null);
              setRefreshKey((k) => k + 1);
            }}
            className="text-mini font-mono px-2.5 py-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40 inline-flex items-center gap-1"
          >
            <RefreshCw size={11} /> refresh
          </button>
          {feed?.generated_at && (
            <span className="text-mini font-mono text-slate-400">
              feeds {new Date(feed.generated_at).toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* ── KPI Row ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <KpiCard
          icon={<CheckCircle2 size={18} />}
          label="Feeds Healthy"
          value={`${feed?.healthy ?? 0}/${feed?.total_sources ?? 0}`}
          accent="text-emerald-600 dark:text-emerald-400"
        />
        <KpiCard
          icon={<AlertTriangle size={18} />}
          label="Degraded"
          value={String(feed?.degraded ?? 0)}
          accent="text-amber-600 dark:text-amber-400"
        />
        <KpiCard
          icon={<XCircle size={18} />}
          label="Down"
          value={String(feed?.down ?? 0)}
          accent="text-rose-600 dark:text-rose-400"
        />
        <KpiCard
          icon={<Clock size={18} />}
          label="Cold (unprobed)"
          value={String(feed?.cold ?? 0)}
          accent="text-slate-500 dark:text-slate-400"
        />
      </div>

      {/* ── Intel Snapshot Row ───────────────────────────────────── */}
      {(intel || snap) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {snap?.ransomware_claims_24h !== undefined && (
            <KpiCard
              icon={<Skull size={18} />}
              label="Ransomware 24h"
              value={String(snap.ransomware_claims_24h)}
              accent="text-rose-600 dark:text-rose-400"
              href="/threatintel/iocs"
            />
          )}
          {snap?.ioc_count !== undefined && (
            <KpiCard
              icon={<Target size={18} />}
              label="Live IOCs"
              value={snap.ioc_count > 1000 ? `${(snap.ioc_count / 1000).toFixed(1)}k` : String(snap.ioc_count)}
              accent="text-brand-600 dark:text-brand-400"
              href="/threatintel/iocs"
            />
          )}
          {snap?.cve_kev_count !== undefined && (
            <KpiCard
              icon={<Bug size={18} />}
              label="CVE KEV"
              value={String(snap.cve_kev_count)}
              accent="text-amber-600 dark:text-amber-400"
              href="/threatintel/cves/cves"
            />
          )}
          {intel?.telegram_monitor && (
            <KpiCard
              icon={<Radio size={18} />}
              label="Telegram 24h"
              value={String(intel.telegram_monitor.leaks_24h)}
              accent="text-sky-600 dark:text-sky-400"
              href="/threatintel/social/firehose"
            />
          )}
        </div>
      )}

      {/* ── Reliability Distribution ─────────────────────────────── */}
      {feed?.reliability_distribution && (
        <section className="mb-8">
          <h2 className="font-display font-semibold text-lg text-slate-700 dark:text-slate-300 mb-3">
            Source Reliability (NATO Admiralty)
          </h2>
          <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
            {(['A', 'B', 'C', 'D', 'E', 'F', 'ungraded'] as const).map((grade) => {
              const count = feed.reliability_distribution[grade] ?? 0;
              return (
                <div
                  key={grade}
                  className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-3 text-center"
                >
                  <div className={`text-2xl font-display font-bold ${reliabilityColor(grade)}`}>
                    {grade === 'ungraded' ? '—' : grade}
                  </div>
                  <div className="text-mini font-mono text-slate-500 mt-1">
                    {count} {count === 1 ? 'source' : 'sources'}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Category Health ──────────────────────────────────────── */}
      {categoryBreakdown.length > 0 && (
        <section className="mb-8">
          <h2 className="font-display font-semibold text-lg text-slate-700 dark:text-slate-300 mb-3">
            Health by Category
          </h2>
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] divide-y divide-slate-100 dark:divide-slate-800">
            {categoryBreakdown.map((cat) => (
              <div key={cat.name} className="flex items-center gap-4 px-4 py-3">
                <span className="font-mono text-sm text-slate-700 dark:text-slate-300 w-32 shrink-0 capitalize">
                  {cat.name}
                </span>
                <div className="flex-1">
                  <MiniBar value={cat.ok} max={cat.total} color="bg-emerald-500" />
                </div>
                <div className="flex items-center gap-2 text-mini font-mono text-slate-500 shrink-0">
                  <span className="text-emerald-600">{cat.ok}</span>
                  <span className="text-amber-600">{cat.degraded}</span>
                  <span className="text-rose-600">{cat.down}</span>
                  <span className="text-slate-400">{cat.cold}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Feed Detail Table ────────────────────────────────────── */}
      {feed?.rows && feed.rows.length > 0 && (
        <section className="mb-8">
          <h2 className="font-display font-semibold text-lg text-slate-700 dark:text-slate-300 mb-3">
            All Sources ({feed.rows.length})
          </h2>
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-[rgb(var(--border-400))] text-left">
                    <th className="px-4 py-2 font-mono text-mini text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-2 font-mono text-mini text-slate-500 uppercase tracking-wider">Source</th>
                    <th className="px-4 py-2 font-mono text-mini text-slate-500 uppercase tracking-wider hidden sm:table-cell">
                      Category
                    </th>
                    <th className="px-4 py-2 font-mono text-mini text-slate-500 uppercase tracking-wider hidden md:table-cell">
                      Grade
                    </th>
                    <th className="px-4 py-2 font-mono text-mini text-slate-500 uppercase tracking-wider hidden lg:table-cell">
                      Age
                    </th>
                    <th className="px-4 py-2 font-mono text-mini text-slate-500 uppercase tracking-wider">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {feed.rows.map((row) => {
                    const Icon = STATUS_ICON[row.status] ?? Clock;
                    return (
                      <tr
                        key={row.id}
                        className="hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-300)/0.5)] transition-colors"
                      >
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex items-center gap-1.5 ${STATUS_COLOR[row.status]}`}>
                            <Icon size={14} />
                            <span className="font-mono text-xs capitalize">{row.status}</span>
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          {row.page_path ? (
                            <Link
                              to={row.page_path}
                              className="font-mono text-sm text-slate-900 dark:text-slate-100 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                            >
                              {row.label}
                            </Link>
                          ) : (
                            <span className="font-mono text-sm text-slate-700 dark:text-slate-300">{row.label}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 hidden sm:table-cell">
                          <span className="font-mono text-xs text-slate-500 capitalize">{row.category ?? '—'}</span>
                        </td>
                        <td className="px-4 py-2.5 hidden md:table-cell">
                          <span className={`font-mono text-xs font-semibold ${reliabilityColor(row.admiralty_grade)}`}>
                            {row.admiralty_grade ?? '—'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 hidden lg:table-cell">
                          <span className="font-mono text-xs text-slate-500">{formatAge(row.upstream_age_s)}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">{row.reason}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* ── Degraded Sources Alert ───────────────────────────────── */}
      {feed?.degraded_sources && feed.degraded_sources.length > 0 && (
        <section className="mb-8">
          <h2 className="font-display font-semibold text-lg text-slate-700 dark:text-slate-300 mb-3">
            Degraded Sources ({feed.degraded_sources.length})
          </h2>
          <div className="rounded-xl border border-amber-300/50 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/20 p-4 space-y-2">
            {feed.degraded_sources.map((src) => (
              <div key={src.id} className="flex items-start gap-2">
                <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">{src.id}</span>
                  <span className="text-xs text-slate-500 ml-2">({src.status})</span>
                  <p className="text-xs text-muted mt-0.5">{src.reason}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Top Metrics ──────────────────────────────────────────── */}
      {topMetrics.length > 0 && (
        <section className="mb-8">
          <h2 className="font-display font-semibold text-lg text-slate-700 dark:text-slate-300 mb-3">
            Top Feed Metrics
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {topMetrics.map((m, i) => (
              <div key={`${m.source}-${m.key}-${i}`} className={`rounded-xl border p-3 ${STATUS_BG[m.status]}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-xs text-slate-500">{m.source}</span>
                  <span className="font-mono text-xs text-slate-400">{m.key}</span>
                </div>
                <div className="font-display font-bold text-xl text-slate-900 dark:text-slate-100">
                  {m.value.toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Analytics Engine Note ────────────────────────────────── */}
      <section className="rounded-xl border border-dashed border-slate-300 dark:border-[rgb(var(--border-400))] p-5 text-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Visitor analytics (page views, geographic distribution, response times) are tracked in Cloudflare Analytics
          Engine. Query them from the{' '}
          <a
            href="https://dash.cloudflare.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            Cloudflare dashboard
          </a>{' '}
          → Analytics → Workers Analytics Engine.
        </p>
      </section>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  accent,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: string;
  href?: string;
}): JSX.Element {
  const inner = (
    <>
      <div className={`${accent} mb-1`}>{icon}</div>
      <div className="font-display font-bold text-2xl text-slate-900 dark:text-slate-100">{value}</div>
      <div className="text-mini font-mono text-slate-500 dark:text-slate-400 mt-0.5">{label}</div>
    </>
  );

  const cardClass =
    'rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-4 transition hover:-translate-y-0.5 hover:shadow-e2';

  if (href) {
    return (
      <Link to={href} className={`${cardClass} block`}>
        {inner}
      </Link>
    );
  }
  return <div className={cardClass}>{inner}</div>;
}
