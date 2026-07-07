import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Database,
  Eye,
  GitBranch,
  Globe,
  Key,
  KeyRound,
  Layers,
  Package,
  RefreshCw,
  Zap,
} from 'lucide-react';
import { DataPageLayout } from '../../components/DataPageLayout';
import type { LucideIcon } from 'lucide-react';

// ── Types mirroring api/src/routes/redhunt-insights.ts ───────────────
interface TrendSeries {
  previous_month_cumulative?: number;
  current_month_cumulative?: number;
  last_30_days_count?: number;
  last_24_hours_count?: number;
  last_1_hour_count?: number;
  total_count?: number;
  timestamp?: string;
  last_six_weeks?: Record<string, number>;
}

interface LatestSecret {
  id: string;
  type: string;
  typeIcon?: string;
  discoveredAt: string;
  organization: string;
  platform: string;
}

interface InsightsPayload {
  fetched_at: string;
  upstream_timestamp: string;
  ok: boolean;
  error?: string;
  data?: {
    trends: Record<string, TrendSeries>;
    top_domains: { top_domain: Record<string, number>; timestamp: string };
    top_secrets: { secrets: Record<string, number>; timestamp: string };
    latest_secrets: LatestSecret[];
    timestamp: string;
  };
}

// ── Pretty-printing helpers ──────────────────────────────────────────
function fmtCount(n: number | undefined): string {
  if (n == null) return '—';
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B+';
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M+';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K+';
  return n.toLocaleString();
}

function fmtExact(n: number | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString();
}

function fmtDelta(n: number | undefined): string {
  if (n == null || n === 0) return '0';
  if (n >= 1e6) return `+${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `+${(n / 1e3).toFixed(1)}K`;
  return `+${n.toLocaleString()}`;
}

function fmtWindow(window: '1h' | '24h' | '30d'): string {
  if (window === '1h') return 'in last hour';
  if (window === '24h') return 'in last 24 hours';
  return 'in last 30 days';
}

function relTime(iso: string | undefined): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function relTimeShort(iso: string | undefined): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

// ── Mini SVG line chart for the 6-week time series ───────────────────
function MiniLineChart({
  series,
  height = 80,
  color = '#0ea5e9',
  fill = true,
}: {
  series: Record<string, number> | undefined;
  height?: number;
  color?: string;
  fill?: boolean;
}): JSX.Element {
  const points = useMemo(() => {
    if (!series) return [] as { x: number; y: number; label: string; v: number }[];
    const entries = Object.entries(series);
    // Sort by week label chronologically. Labels are like '07th May', '14th May', etc.
    // Simplest reliable sort: parse the day number.
    entries.sort(([a], [b]) => {
      const da = parseInt(a, 10) || 0;
      const db = parseInt(b, 10) || 0;
      return da - db;
    });
    if (entries.length === 0) return [];
    const max = Math.max(...entries.map(([, v]) => v), 1);
    return entries.map(([label, v], i) => ({
      x: entries.length === 1 ? 50 : (i / (entries.length - 1)) * 100,
      y: 100 - (v / max) * 100,
      label,
      v,
    }));
  }, [series]);

  if (points.length === 0) {
    return <div className="flex h-20 items-center justify-center text-xs text-slate-400">no data</div>;
  }
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
  const fillD = `${pathD} L 100 100 L 0 100 Z`;
  return (
    <div className="relative w-full" style={{ height }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        {fill && <path d={fillD} fill={color} fillOpacity="0.12" />}
        <path
          d={pathD}
          fill="none"
          stroke={color}
          strokeWidth="1.2"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
        />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="0.9" fill={color} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      {/* X-axis labels */}
      <div className="absolute inset-x-0 -bottom-4 flex justify-between text-[9px] text-slate-400 dark:text-slate-500">
        {points.map((p, i) => (
          <span key={i} className={i === 0 ? 'text-left' : i === points.length - 1 ? 'text-right' : 'text-center'}>
            {p.label.replace('th', '').replace('st', '').replace('nd', '').replace('rd', '')}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Word cloud (CSS sized, top-25 domains) ───────────────────────────
function TopDomainsCloud({ domains }: { domains: Record<string, number> }): JSX.Element {
  const entries = useMemo(() => {
    const arr = Object.entries(domains);
    arr.sort(([, a], [, b]) => b - a);
    return arr.slice(0, 25);
  }, [domains]);
  if (entries.length === 0) return <div className="text-sm text-slate-500">no data</div>;
  const max = Math.max(...entries.map(([, v]) => v), 1);
  const min = Math.min(...entries.map(([, v]) => v), max);
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 py-4">
      {entries.map(([domain, count]) => {
        const ratio = (count - min) / Math.max(1, max - min);
        const size = 0.75 + ratio * 1.4; // rem multiplier
        const tone =
          ratio > 0.66
            ? 'text-brand-600 dark:text-brand-300 font-semibold'
            : ratio > 0.33
              ? 'text-slate-800 dark:text-slate-200 font-medium'
              : 'text-slate-500 dark:text-slate-400';
        return (
          <span
            key={domain}
            className={`${tone} hover:text-brand-600 dark:hover:text-brand-400 transition-colors cursor-default`}
            style={{ fontSize: `${size}rem`, lineHeight: 1.15 }}
            title={`${count.toLocaleString()} subdomains`}
          >
            {domain}
          </span>
        );
      })}
    </div>
  );
}

// ── Stat tile (the 6 big "subdomains 7.6B+" hero tiles) ──────────────
function BigStat({
  icon: Icon,
  label,
  total,
  delta,
  window: win,
  tone = 'brand',
}: {
  icon: LucideIcon;
  label: string;
  total: number | undefined;
  delta: number | undefined;
  window: '1h' | '24h' | '30d';
  tone?: 'brand' | 'emerald' | 'amber' | 'rose' | 'violet' | 'cyan';
}): JSX.Element {
  const toneCls: Record<string, string> = {
    brand: 'border-brand-200 dark:border-brand-800/60 bg-brand-50/40 dark:bg-brand-950/20',
    emerald: 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20',
    amber: 'border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20',
    rose: 'border-rose-200 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20',
    violet: 'border-violet-200 dark:border-violet-900/60 bg-violet-50/40 dark:bg-violet-950/20',
    cyan: 'border-cyan-200 dark:border-cyan-900/60 bg-cyan-50/40 dark:bg-cyan-950/20',
  };
  const iconTone: Record<string, string> = {
    brand: 'text-brand-600 dark:text-brand-400',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    amber: 'text-amber-600 dark:text-amber-400',
    rose: 'text-rose-600 dark:text-rose-400',
    violet: 'text-violet-600 dark:text-violet-400',
    cyan: 'text-cyan-600 dark:text-cyan-400',
  };
  return (
    <div className={`rounded-xl border ${toneCls[tone]} p-4 shadow-e1`}>
      <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
        <Icon className={`h-4 w-4 ${iconTone[tone]}`} />
        <span className="text-xs font-mono uppercase tracking-wider">{label}</span>
      </div>
      <div className="mt-2 text-2xl sm:text-3xl font-bold font-display text-slate-900 dark:text-slate-100 tabular-nums">
        {fmtCount(total)}
      </div>
      <div className="mt-1 flex items-baseline gap-1.5 text-xs">
        <span className="font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">{fmtDelta(delta)}</span>
        <span className="text-slate-500 dark:text-slate-500">{fmtWindow(win)}</span>
      </div>
    </div>
  );
}

// ── Secret type row (top-10 bar list) ────────────────────────────────
function SecretTypeRow({ name, count, max }: { name: string; count: number; max: number }): JSX.Element {
  const pct = max > 0 ? (count / max) * 100 : 0;
  return (
    <li>
      <div className="flex items-center gap-2 text-xs">
        <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-300" title={name}>
          {name}
        </span>
        <span className="font-mono tabular-nums text-muted">{count.toLocaleString()}</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-[rgb(var(--surface-300))]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand-500 to-violet-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </li>
  );
}

// ── Main page ────────────────────────────────────────────────────────
const REFRESH_MS = 60_000; // 1 min auto-refresh interval — see auto-refresh useEffect below

export default function RedHuntInsights(): JSX.Element {
  const [payload, setPayload] = useState<InsightsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Fetch on mount and whenever refreshKey changes.
  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetch('/api/v1/redhunt-insights', { signal: ctrl.signal, cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<InsightsPayload>;
      })
      .then((d) => {
        if (cancelled) return;
        setPayload(d);
        if (!d.ok) setError(d.error ?? 'upstream returned ok=false');
      })
      .catch((e: { name?: string; message?: string }) => {
        if (cancelled || e.name === 'AbortError') return;
        setError(e.message ?? 'fetch failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [refreshKey]);

  // (Date.now() is read directly in helpers; no reactive clock needed.)

  // Recompute "X minutes ago" every 30s without a refetch.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const i = window.setInterval(() => {
      /* trigger re-render via refreshKey so relative timestamps update */ setRefreshKey((k) => k);
    }, REFRESH_MS);
    return () => clearInterval(i);
  }, []);

  const data = payload?.data;
  const trends = data?.trends ?? {};
  const topDomains = data?.top_domains?.top_domain ?? {};
  const topSecrets = data?.top_secrets?.secrets ?? {};
  const latestSecrets = data?.latest_secrets ?? [];

  // Top 10 secret types — sorted desc.
  const topSecretEntries = useMemo(() => {
    const arr = Object.entries(topSecrets);
    arr.sort(([, a], [, b]) => b - a);
    return arr.slice(0, 10);
  }, [topSecrets]);
  const topSecretMax = topSecretEntries[0]?.[1] ?? 1;

  // Word cloud for top-25 domains.
  const topDomainsEntries = useMemo(() => {
    const arr = Object.entries(topDomains);
    arr.sort(([, a], [, b]) => b - a);
    return arr.slice(0, 25);
  }, [topDomains]);

  return (
    <DataPageLayout
      backTo="/threatintel"
      backLabel="back to threat intel"
      icon={<Activity className="h-6 w-6" />}
      title="RedHunt Labs Internet Insights"
      description={
        <span>
          Live analytics from{' '}
          <a
            href="https://research.redhuntlabs.com/internet-insights"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            research.redhuntlabs.com/internet-insights
          </a>{' '}
          — internet-wide exposure trends, code-platform secrets monitoring, subdomains enumeration, and Postman
          ecosystem exposure. Auto-refreshes every minute. The raw JSON is at{' '}
          <code className="rounded bg-slate-100 dark:bg-[rgb(var(--surface-300))] px-1 py-0.5 text-xs">
            research.redhuntlabs.com/api/latest.json
          </code>
          .
        </span>
      }
      headerExtra={
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            className="inline-flex items-center gap-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] px-2 py-1 text-slate-500 dark:text-slate-400 hover:border-brand-500/50 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
            aria-label="Refresh now"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            refresh
          </button>
          {payload && (
            <span className="rounded border border-slate-300 dark:border-[rgb(var(--border-400))] px-2 py-1 font-mono text-slate-500 dark:text-slate-400">
              fetched <span className="text-slate-700 dark:text-slate-200">{relTimeShort(payload.fetched_at)} ago</span>
            </span>
          )}
          {payload?.ok && (
            <span className="inline-flex items-center gap-1.5 rounded border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-1 text-emerald-700 dark:text-emerald-300 font-mono">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              live
            </span>
          )}
          {payload && !payload.ok && (
            <span
              className="rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 px-2 py-1 text-amber-700 dark:text-amber-300 font-mono"
              title={payload.error}
            >
              upstream failing
            </span>
          )}
        </div>
      }
      loading={loading && !payload}
      error={error}
      onRetry={() => setRefreshKey((k) => k + 1)}
      empty={!loading && !payload?.data}
      emptyMessage="No insights data available. The upstream may be down."
      maxWidthClass="max-w-7xl"
    >
      {data && (
        <>
          {/* ── Headline hero ────────────────────────────────────────── */}
          <div className="mb-4 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-gradient-to-br from-brand-50/60 via-white to-violet-50/40 dark:from-brand-950/20 dark:via-slate-900 dark:to-violet-950/20 p-5 shadow-e1">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <p className="text-micro font-mono uppercase tracking-wider text-brand-600 dark:text-brand-400">
                  Internet-Wide Exposure Analytics
                </p>
                <h2 className="mt-1 text-2xl sm:text-3xl font-display font-bold text-slate-900 dark:text-slate-100">
                  3.7+ Billion Addresses Analyzed
                </h2>
                <p className="mt-1 text-sm text-muted max-w-2xl">
                  Checkout Our Recent Internet Scan Study — aggregate counts of the assets RedHunt Labs' Project
                  Resonance engine has catalogued across subdomains, code-platform commits, DockerHub, APKs, and
                  Postman.
                </p>
              </div>
              <div className="text-right">
                <p className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Last updated
                </p>
                <p className="font-mono text-sm text-slate-700 dark:text-slate-200">
                  {data.timestamp ? new Date(data.timestamp).toLocaleString() : '—'}
                </p>
                <p className="text-micro font-mono text-slate-400">{relTime(data.timestamp)}</p>
              </div>
            </div>
          </div>

          {/* ── Top-level stat grid (the 6 hero tiles) ───────────────── */}
          <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <BigStat
              icon={Globe}
              label="Unique Subdomains Collected"
              total={trends.temp_domains_v1?.total_count}
              delta={trends.temp_domains_v1?.last_1_hour_count}
              window="1h"
              tone="brand"
            />
            <BigStat
              icon={GitBranch}
              label="Commits Correlated Across Platforms"
              total={
                (trends.github_commits_v?.total_count ?? 0) +
                (trends.gitlab_connections_v1?.total_count ?? 0) +
                (trends.bitbucket_connections_v1?.total_count ?? 0)
              }
              delta={
                (trends.github_commits_v?.last_1_hour_count ?? 0) +
                (trends.gitlab_connections_v1?.last_1_hour_count ?? 0) +
                (trends.bitbucket_connections_v1?.last_1_hour_count ?? 0)
              }
              window="1h"
              tone="emerald"
            />
            <BigStat
              icon={Database}
              label="Historical Correlations of DockerHub Users"
              total={trends.dockerhub_users_v1?.total_count}
              delta={trends.dockerhub_users_v1?.last_1_hour_count}
              window="1h"
              tone="cyan"
            />
            <BigStat
              icon={Package}
              label="Historical Correlations of APKs"
              total={trends.android_pkg_metadata_v1?.total_count}
              delta={trends.android_pkg_metadata_v1?.last_30_days_count}
              window="30d"
              tone="amber"
            />
            <BigStat
              icon={KeyRound}
              label="Total Secrets Found Across"
              total={
                (trends.github_monitoring_v1?.total_count ?? 0) +
                (trends.gitlab_monitoring_v1?.total_count ?? 0) +
                (trends.bitbucket_monitoring_v1?.total_count ?? 0)
              }
              delta={
                (trends.github_monitoring_v1?.last_1_hour_count ?? 0) +
                (trends.gitlab_monitoring_v1?.last_1_hour_count ?? 0) +
                (trends.bitbucket_monitoring_v1?.last_1_hour_count ?? 0)
              }
              window="1h"
              tone="brand"
            />
            <BigStat
              icon={Layers}
              label="Historical Correlations of DockerHub Repos"
              total={trends.dockerhub_repos_v1?.total_count}
              delta={trends.dockerhub_repos_v1?.last_1_hour_count}
              window="1h"
              tone="violet"
            />
          </div>

          {/* ── Collected Assets: 6-week chart for subdomains + APKs ─── */}
          <div className="mb-6 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-5">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Collected Assets</h3>
              <p className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Total Subdomains & APKs Collected Over the Past 6 Weeks
              </p>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2 pb-4">
              <div>
                <div className="flex items-baseline justify-between">
                  <p className="text-sm text-muted">Subdomains</p>
                  <p className="text-2xl font-display font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                    {fmtExact(trends.temp_domains_v1?.last_30_days_count)}
                  </p>
                </div>
                <div className="mt-3">
                  <MiniLineChart series={trends.temp_domains_v1?.last_six_weeks} color="#0ea5e9" />
                </div>
              </div>
              <div>
                <div className="flex items-baseline justify-between">
                  <p className="text-sm text-muted">APKs</p>
                  <p className="text-2xl font-display font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                    {fmtExact(trends.android_pkg_metadata_v1?.last_30_days_count)}
                  </p>
                </div>
                <div className="mt-3">
                  <MiniLineChart series={trends.android_pkg_metadata_v1?.last_six_weeks} color="#f59e0b" />
                </div>
              </div>
            </div>
          </div>

          {/* ── Top 25 Domains Word Cloud ────────────────────────────── */}
          <div className="mb-6 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-5">
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Top 25 Domains Word Cloud</h3>
              <p className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Distribution of Top 25 Domains by Subdomain Count in the Past Month
              </p>
            </div>
            <TopDomainsCloud domains={topDomains} />
            {topDomainsEntries.length > 0 && (
              <details className="mt-3 border-t border-slate-200 dark:border-[rgb(var(--border-400))] pt-3 text-xs">
                <summary className="cursor-pointer text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 font-mono">
                  show numeric table ({topDomainsEntries.length} domains)
                </summary>
                <table className="mt-2 w-full text-left">
                  <thead className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="py-1">Domain</th>
                      <th className="py-1 text-right">Subdomains</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topDomainsEntries.map(([d, c]) => (
                      <tr key={d} className="border-t border-slate-100 dark:border-[rgb(var(--border-400))]">
                        <td className="py-1 font-mono text-slate-700 dark:text-slate-300">{d}</td>
                        <td className="py-1 text-right font-mono tabular-nums text-muted">{c.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}
          </div>

          {/* ── Exposure Insights: Repositories and Secrets ──────────── */}
          <div className="mb-6">
            <h3 className="mb-3 text-lg font-semibold text-slate-900 dark:text-slate-100">
              Exposure Insights: Repositories and Secrets
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              <BigStat
                icon={GitBranch}
                label="GitHub Commits"
                total={trends.github_commits_v?.total_count}
                delta={trends.github_commits_v?.last_1_hour_count}
                window="1h"
                tone="brand"
              />
              <BigStat
                icon={GitBranch}
                label="GitLab Commits"
                total={trends.gitlab_connections_v1?.total_count}
                delta={trends.gitlab_connections_v1?.last_1_hour_count}
                window="1h"
                tone="amber"
              />
              <BigStat
                icon={GitBranch}
                label="BitBucket Commits"
                total={trends.bitbucket_connections_v1?.total_count}
                delta={trends.bitbucket_connections_v1?.last_1_hour_count}
                window="1h"
                tone="cyan"
              />
              <BigStat
                icon={KeyRound}
                label="GitHub Secrets"
                total={trends.github_monitoring_v1?.total_count}
                delta={trends.github_monitoring_v1?.last_1_hour_count}
                window="1h"
                tone="brand"
              />
              <BigStat
                icon={KeyRound}
                label="GitLab Secrets"
                total={trends.gitlab_monitoring_v1?.total_count}
                delta={trends.gitlab_monitoring_v1?.last_1_hour_count}
                window="1h"
                tone="brand"
              />
              <BigStat
                icon={KeyRound}
                label="BitBucket Secrets"
                total={trends.bitbucket_monitoring_v1?.total_count}
                delta={trends.bitbucket_monitoring_v1?.last_1_hour_count}
                window="1h"
                tone="brand"
              />
            </div>
          </div>

          {/* ── Commits Over Time + Secrets Found Over Time ──────────── */}
          <div className="mb-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-5">
              <h3 className="mb-1 text-base font-semibold text-slate-900 dark:text-slate-100">Commits Over Time</h3>
              <p className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Code Commits Scanned Across Major Code Platforms in Last 6 Weeks
              </p>
              <div className="mt-4 pb-4">
                <MiniLineChart
                  series={mergeWeekly(
                    trends.github_commits_v?.last_six_weeks,
                    trends.gitlab_connections_v1?.last_six_weeks,
                    trends.bitbucket_connections_v1?.last_six_weeks
                  )}
                  color="#10b981"
                  height={100}
                />
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-5">
              <h3 className="mb-1 text-base font-semibold text-slate-900 dark:text-slate-100">
                Secrets Found Over Time
              </h3>
              <p className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Secrets Found Across Major Code Platforms in Last 6 Weeks
              </p>
              <div className="mt-4 pb-4">
                <MiniLineChart
                  series={mergeWeekly(
                    trends.github_monitoring_v1?.last_six_weeks,
                    trends.gitlab_monitoring_v1?.last_six_weeks,
                    trends.bitbucket_monitoring_v1?.last_six_weeks
                  )}
                  color="#e11d48"
                  height={100}
                />
              </div>
            </div>
          </div>

          {/* ── Recently Discovered Secrets + Top 10 Secret Types ────── */}
          <div className="mb-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-5">
              <h3 className="mb-1 text-base font-semibold text-slate-900 dark:text-slate-100">
                Recently Discovered Secrets
              </h3>
              <p className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                20 most recent across all code platforms
              </p>
              {latestSecrets.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">no recent secrets in the latest snapshot</p>
              ) : (
                <ul className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
                  {latestSecrets.slice(0, 10).map((s) => (
                    <li key={s.id} className="flex items-start gap-3 py-2.5">
                      <Key className="mt-0.5 h-4 w-4 shrink-0 text-rose-500 dark:text-rose-400" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{s.type}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-mono">{s.organization}</span> · {s.platform}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400 font-mono">
                        {relTimeShort(s.discoveredAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-5">
              <div className="flex items-baseline justify-between">
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Top 10 Secrets Type</h3>
                <p className="text-sm font-display font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                  {fmtExact(topSecretEntries.reduce((n, [, c]) => n + c, 0))}
                </p>
              </div>
              <p className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Distribution of Top 10 Secret Types in Last Month
              </p>
              <ul className="mt-4 space-y-3">
                {topSecretEntries.map(([name, count]) => (
                  <SecretTypeRow key={name} name={name} count={count} max={topSecretMax} />
                ))}
              </ul>
            </div>
          </div>

          {/* ── Postman Ecosystem ────────────────────────────────────── */}
          <div className="mb-2">
            <h3 className="mb-3 text-lg font-semibold text-slate-900 dark:text-slate-100">
              Exposure Insights: Postman Ecosystem
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <BigStat
                icon={Zap}
                label="Collections Correlated"
                total={trends.postman_requests_v1?.total_count}
                delta={trends.postman_requests_v1?.last_1_hour_count}
                window="1h"
                tone="brand"
              />
              <BigStat
                icon={Eye}
                label="Environments Correlated"
                total={trends.postman_environments_v1?.total_count}
                delta={trends.postman_environments_v1?.last_1_hour_count}
                window="1h"
                tone="violet"
              />
            </div>
          </div>
          <div className="mb-6 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-5">
            <h3 className="mb-1 text-base font-semibold text-slate-900 dark:text-slate-100">
              Collections and Environments Growth
            </h3>
            <p className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Postman Collections & Environments Scanned Over The Past 6 Weeks
            </p>
            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-6 pb-4">
              <div>
                <p className="text-sm text-muted">Collections</p>
                <div className="mt-2">
                  <MiniLineChart series={trends.postman_requests_v1?.last_six_weeks} color="#0ea5e9" height={100} />
                </div>
              </div>
              <div>
                <p className="text-sm text-muted">Environments</p>
                <div className="mt-2">
                  <MiniLineChart series={trends.postman_environments_v1?.last_six_weeks} color="#8b5cf6" height={100} />
                </div>
              </div>
            </div>
          </div>

          {/* ── Footer / discover attack repeat ─────────────────────── */}
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 p-5 text-center">
            <p className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
              RedHunt Labs Research Loop
            </p>
            <p className="mt-2 font-display text-xl font-bold text-slate-900 dark:text-slate-100">
              <span className="text-brand-600 dark:text-brand-400">DISCOVER</span> ·{' '}
              <span className="text-emerald-600 dark:text-emerald-400">ATTACK</span> ·{' '}
              <span className="text-rose-600 dark:text-rose-400">REPEAT</span>
            </p>
            <p className="mt-2 text-sm text-muted max-w-2xl mx-auto">
              This mirror polls{' '}
              <a
                href="https://research.redhuntlabs.com/internet-insights"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-600 dark:text-brand-400 hover:underline"
              >
                research.redhuntlabs.com/internet-insights
              </a>{' '}
              every minute and caches in KV for 5 minutes. The data shown is the snapshot from{' '}
              <span className="font-mono">{data.timestamp ? new Date(data.timestamp).toLocaleString() : '—'}</span>.
            </p>
          </div>
        </>
      )}
    </DataPageLayout>
  );
}

// Sum per-week values across multiple series so the merged chart shows the
// platform-aggregated total. Weeks not present in all three are still shown
// as long as they're present in at least one — the chart already does
// best-effort label normalisation.
function mergeWeekly(...series: (Record<string, number> | undefined)[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of series) {
    if (!s) continue;
    for (const [k, v] of Object.entries(s)) {
      out[k] = (out[k] ?? 0) + v;
    }
  }
  return out;
}
