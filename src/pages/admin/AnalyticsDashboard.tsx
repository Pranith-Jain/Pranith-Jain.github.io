import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Activity, BarChart3, Globe, TrendingUp, Users, RefreshCw, Calendar } from 'lucide-react';

interface AnalyticsEvent {
  blobs: string[];
  doubles: number[];
  indexes: string[];
  timestamp: string;
}

interface AnalyticsSummary {
  totalEvents: number;
  eventsByType: Record<string, number>;
  eventsByCountry: Record<string, number>;
  recentEvents: AnalyticsEvent[];
  topEvents: Array<{ type: string; count: number }>;
  topCountries: Array<{ country: string; count: number }>;
}

/**
 * Analytics Dashboard — shows page views, tool usage, and geographic data
 * from Cloudflare Analytics Engine. Accessible at /admin/analytics.
 */
export default function AnalyticsDashboard(): JSX.Element {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);

    // Fetch analytics data from the API
    fetch('/api/v1/analytics/summary', { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: AnalyticsSummary) => {
        if (alive) setData(d);
      })
      .catch((e) => {
        if (alive && e.name !== 'AbortError') {
          // Fallback: generate mock data if API not available
          if (alive) {
            setData({
              totalEvents: 0,
              eventsByType: {},
              eventsByCountry: {},
              recentEvents: [],
              topEvents: [],
              topCountries: [],
            });
          }
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [refreshKey]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-lg bg-slate-100 dark:bg-[#12121a] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <Link
        to="/admin"
        className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-slate-500 hover:text-brand-600 dark:hover:text-brand-400 mb-6"
      >
        <ArrowLeft size={12} /> back to admin
      </Link>

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900 dark:text-white">Analytics Dashboard</h1>
          <p className="text-xs font-mono text-slate-500 mt-1">Page views, tool usage, and geographic data</p>
        </div>
        <button
          type="button"
          onClick={() => setRefreshKey((k) => k + 1)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 dark:border-[#1e2030] rounded text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-[#16161f] hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <SummaryCard
          label="Total Events"
          value={data?.totalEvents?.toLocaleString() ?? '0'}
          icon={Activity}
          color="text-brand-600 dark:text-brand-400"
        />
        <SummaryCard
          label="Event Types"
          value={Object.keys(data?.eventsByType ?? {}).length.toString()}
          icon={BarChart3}
          color="text-emerald-600 dark:text-emerald-400"
        />
        <SummaryCard
          label="Countries"
          value={Object.keys(data?.eventsByCountry ?? {}).length.toString()}
          icon={Globe}
          color="text-amber-600 dark:text-amber-400"
        />
        <SummaryCard
          label="Recent"
          value={data?.recentEvents?.length?.toString() ?? '0'}
          icon={TrendingUp}
          color="text-violet-600 dark:text-violet-400"
        />
      </div>

      {/* Top events */}
      <section className="mb-8">
        <h2 className="font-display font-bold text-lg text-slate-900 dark:text-white mb-4">Top Events</h2>
        <div className="rounded-lg border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a] divide-y divide-slate-200 dark:divide-[#1e2030]">
          {(data?.topEvents ?? []).length === 0 ? (
            <p className="p-4 text-sm text-slate-500">No event data available yet.</p>
          ) : (
            (data?.topEvents ?? []).map((e) => (
              <div key={e.type} className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <Activity size={14} className="text-slate-400" />
                  <span className="font-mono text-sm text-slate-700 dark:text-slate-300">{e.type}</span>
                </div>
                <span className="font-mono text-sm font-medium text-slate-900 dark:text-white">
                  {e.count.toLocaleString()}
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Top countries */}
      <section className="mb-8">
        <h2 className="font-display font-bold text-lg text-slate-900 dark:text-white mb-4">Top Countries</h2>
        <div className="rounded-lg border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a] divide-y divide-slate-200 dark:divide-[#1e2030]">
          {(data?.topCountries ?? []).length === 0 ? (
            <p className="p-4 text-sm text-slate-500">No country data available yet.</p>
          ) : (
            (data?.topCountries ?? []).map((c) => (
              <div key={c.country} className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <Globe size={14} className="text-slate-400" />
                  <span className="font-mono text-sm text-slate-700 dark:text-slate-300">{c.country}</span>
                </div>
                <span className="font-mono text-sm font-medium text-slate-900 dark:text-white">
                  {c.count.toLocaleString()}
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Recent events */}
      <section>
        <h2 className="font-display font-bold text-lg text-slate-900 dark:text-white mb-4">Recent Events</h2>
        <div className="rounded-lg border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a] divide-y divide-slate-200 dark:divide-[#1e2030]">
          {(data?.recentEvents ?? []).length === 0 ? (
            <p className="p-4 text-sm text-slate-500">No recent events.</p>
          ) : (
            (data?.recentEvents ?? []).slice(0, 20).map((e, idx) => (
              <div key={idx} className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <Activity size={14} className="text-slate-400" />
                  <div>
                    <span className="font-mono text-sm text-slate-700 dark:text-slate-300">
                      {e.blobs[0] ?? 'unknown'}
                    </span>
                    {e.blobs[1] && <span className="text-xs text-slate-500 ml-2">{e.blobs[1]}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {e.indexes[0] && <span className="text-xs font-mono text-slate-500">{e.indexes[0]}</span>}
                  <span className="text-xs text-slate-400">{new Date(e.timestamp).toLocaleTimeString()}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  icon: typeof Activity;
  color: string;
}): JSX.Element {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a] p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} className={color} />
        <span className="text-xs font-mono uppercase tracking-wider text-slate-500">{label}</span>
      </div>
      <div className="text-2xl font-mono font-bold text-slate-900 dark:text-white">{value}</div>
    </div>
  );
}
