import { useEffect, useState } from 'react';
import { BackLink } from '../../components/BackLink';
import { DataState } from '../../components/DataState';
import { ArrowLeft, AlertTriangle, BarChart3, Activity, Globe, Send, TrendingUp } from 'lucide-react';
import { SEVERITY_BAR, type Severity } from '../../components/severity';

interface Stats {
  total_entries: number;
  last_24h: number;
  severity_distribution: Array<{ severity: string; n: number }>;
  top_channels: Array<{ channel_handle: string; n: number }>;
  top_domains: Array<{ domain: string; count: number }>;
}

function toSeverity(raw: string): Severity {
  const s = raw?.toLowerCase();
  if (s === 'critical' || s === 'high' || s === 'medium' || s === 'info') return s;
  if (s === 'informational') return 'info';
  return 'low'; // low + none/unknown/unrated fall through to neutral slate
}

export default function TelegramLeakStats(): JSX.Element {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/telegram-leaks/stats')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<Stats>;
      })
      .then((d) => {
        if (!cancelled) setStats(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const totalN = stats?.severity_distribution?.reduce((s, x) => s + x.n, 0) ?? 0;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up mb-8">
        <h1 className="text-3xl sm:text-4xl font-display font-bold flex items-center gap-3">
          <BarChart3 size={28} className="text-brand-600 dark:text-brand-400" /> Telegram Leak Monitor Stats
        </h1>
        <p className="text-muted mt-2 max-w-2xl">
          Aggregate statistics across all monitored channels and leak entries.
        </p>
      </div>

      <DataState loading={loading} error={error} rows={6}>
        {stats && (
          <div className="space-y-8">
            {/* KPI cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-xl border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a] shadow-e1 p-5">
                <div className="flex items-center gap-2 text-xs font-mono text-slate-500 dark:text-slate-400 mb-1">
                  <Activity size={14} /> Total entries
                </div>
                <p className="text-3xl font-bold font-display">{stats.total_entries}</p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a] shadow-e1 p-5">
                <div className="flex items-center gap-2 text-xs font-mono text-slate-500 dark:text-slate-400 mb-1">
                  <TrendingUp size={14} /> Last 24h
                </div>
                <p className="text-3xl font-bold font-display">{stats.last_24h}</p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a] shadow-e1 p-5">
                <div className="flex items-center gap-2 text-xs font-mono text-slate-500 dark:text-slate-400 mb-1">
                  <Send size={14} /> Monitored channels
                </div>
                <p className="text-3xl font-bold font-display">{stats.top_channels?.length ?? '…'}</p>
              </div>
            </div>

            {/* Severity distribution */}
            <section className="rounded-xl border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a] shadow-e1 p-5">
              <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-mono mb-4 flex items-center gap-2">
                <AlertTriangle size={14} /> Severity distribution
              </h2>
              {stats.severity_distribution.length > 0 ? (
                <div className="space-y-3">
                  {stats.severity_distribution.map((item) => {
                    const pct = totalN > 0 ? (item.n / totalN) * 100 : 0;
                    return (
                      <div key={item.severity} className="flex items-center gap-3">
                        <span className="text-xs font-mono w-16 capitalize text-muted">{item.severity}</span>
                        <div className="flex-1 h-4 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${SEVERITY_BAR[toSeverity(item.severity)]}`}
                            style={{ width: `${Math.max(pct, 2)}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono text-slate-500 w-12 text-right">{item.n}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs font-mono text-slate-500 dark:text-slate-400">No entries yet</p>
              )}
            </section>

            {/* Top channels & domains */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <section className="rounded-xl border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a] shadow-e1 p-5">
                <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-mono mb-3 flex items-center gap-2">
                  <Send size={14} /> Top channels
                </h2>
                {stats.top_channels.length > 0 ? (
                  <div className="space-y-2">
                    {stats.top_channels.map((ch, i) => (
                      <div key={ch.channel_handle} className="flex items-center justify-between text-xs font-mono">
                        <span className="truncate text-slate-700 dark:text-slate-300">
                          {i + 1}. {ch.channel_handle}
                        </span>
                        <span className="text-slate-500 shrink-0 ml-2">{ch.n} entries</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs font-mono text-slate-500 dark:text-slate-400">No data yet</p>
                )}
              </section>

              <section className="rounded-xl border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a] shadow-e1 p-5">
                <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-mono mb-3 flex items-center gap-2">
                  <Globe size={14} /> Top domains
                </h2>
                {stats.top_domains.length > 0 ? (
                  <div className="space-y-2">
                    {stats.top_domains.map((d, i) => (
                      <div key={d.domain} className="flex items-center justify-between text-xs font-mono">
                        <span className="truncate text-slate-700 dark:text-slate-300">
                          {i + 1}. {d.domain}
                        </span>
                        <span className="text-slate-500 shrink-0 ml-2">{d.count} hits</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs font-mono text-slate-500 dark:text-slate-400">No data yet</p>
                )}
              </section>
            </div>
          </div>
        )}
      </DataState>
    </div>
  );
}
