import { useState, useEffect, useCallback } from 'react';
import { BackLink } from '../../components/BackLink';
import { api } from '../../lib/api-client';
import {
  ArrowLeft,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  Search,
  Loader2,
  Activity,
  Database,
  Shield,
} from 'lucide-react';

interface IocLifecycle {
  indicator: string;
  indicator_type: string;
  first_seen: string;
  last_seen: string;
  peak_score: number;
  current_score: number;
  observation_count: number;
  sources_seen: string[];
  last_sources: string[];
  decay_rate: number;
  tags: string[];
  age_hours: number;
  last_seen_hours_ago: number;
  status: 'active' | 'declining' | 'dormant' | 'archived';
  trend: 'rising' | 'stable' | 'declining';
}

interface Stats {
  total_iocs: number;
  active_24h: number;
  active_7d: number;
  ipv4_count: number;
  domain_count: number;
  url_count: number;
  hash_count: number;
  avg_observations: number;
  avg_decay_rate: number;
  max_score: number;
  earliest_seen: string;
}

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  declining: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  dormant: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  archived: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};

const TREND_ICON: Record<string, typeof TrendingUp> = { rising: TrendingUp, stable: Minus, declining: TrendingDown };
const TREND_COLOR: Record<string, string> = {
  rising: 'text-emerald-600 dark:text-emerald-400',
  stable: 'text-slate-400',
  declining: 'text-rose-600 dark:text-rose-400',
};

const TABS = ['stats', 'trending', 'lookup'] as const;
const TAB_LABEL: Record<string, string> = { stats: 'Statistics', trending: 'Trending', lookup: 'Lookup' };

function ScoreBar({ score, max = 100 }: { score: number; max?: number }) {
  const pct = Math.min(100, (score / max) * 100);
  const color = score >= 70 ? 'bg-rose-500' : score >= 40 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-1.5">
      <div className={`${color} h-1.5 rounded-full`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function IocLifecycle(): JSX.Element {
  const [query, setQuery] = useState('');
  const [searchType, setSearchType] = useState<'lookup' | 'trending' | 'stats'>('stats');
  const [loading, setLoading] = useState(false);
  const [lifecycle, setLifecycle] = useState<IocLifecycle | null>(null);
  const [trending, setTrending] = useState<IocLifecycle[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await api.get<{ stats?: Stats }>('/api/v1/ioc-lifecycle/stats');
      setStats(d.stats ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTrending = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await api.get<{ trending?: IocLifecycle[] }>('/api/v1/ioc-lifecycle/trending?limit=50');
      setTrending(d.trending ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const lookupIoc = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setLifecycle(null);
    try {
      const d = await api.get<{ found?: boolean; lifecycle?: IocLifecycle }>(
        `/api/v1/ioc-lifecycle?indicator=${encodeURIComponent(query)}`
      );
      if (d.found && d.lifecycle) setLifecycle(d.lifecycle);
      else setError('IOC not found');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    if (searchType === 'stats') fetchStats();
    else if (searchType === 'trending') fetchTrending();
  }, [searchType, fetchStats, fetchTrending]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>
      <div className="animate-fade-in-up mb-10">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 flex items-center gap-3">
          <Clock size={28} className="text-brand-600 dark:text-brand-400" /> IOC Lifecycle Tracker
        </h1>
        <p className="text-slate-600 dark:text-slate-400 max-w-2xl leading-relaxed">
          Track when IOCs appear, their activity patterns, and decay rates.
        </p>
      </div>
      <div className="flex gap-1.5 mb-6">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setSearchType(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-colors ${searchType === t ? 'border-brand-500/60 bg-brand-500/10 text-brand-600 dark:text-brand-400' : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:border-brand-500/30'}`}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>
      {searchType === 'lookup' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-5 mb-6">
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void lookupIoc()}
              placeholder="Enter IP, domain, URL, or hash…"
              className="flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2.5 text-sm font-mono text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
            />
            <button
              onClick={lookupIoc}
              disabled={loading || !query.trim()}
              className="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg text-sm font-semibold text-white transition-colors flex items-center gap-2"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} Lookup
            </button>
          </div>
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-rose-300/70 dark:border-rose-800/60 bg-rose-50/60 dark:bg-rose-950/30 p-4 mb-6 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}
      {searchType === 'stats' && stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 animate-fade-in-up">
          <StatCard label="Total IOCs" value={stats.total_iocs} icon={<Database size={16} />} />
          <StatCard
            label="Active (24h)"
            value={stats.active_24h}
            icon={<Activity size={16} />}
            color="text-emerald-600 dark:text-emerald-400"
          />
          <StatCard
            label="Active (7d)"
            value={stats.active_7d}
            icon={<Shield size={16} />}
            color="text-brand-600 dark:text-brand-400"
          />
          <StatCard
            label="Max Score"
            value={stats.max_score}
            icon={<TrendingUp size={16} />}
            color="text-rose-600 dark:text-rose-400"
          />
        </div>
      )}
      {searchType === 'trending' && trending.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 overflow-hidden animate-fade-in-up">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-left">
                  {['Indicator', 'Type', 'Status', 'Trend', 'Score', 'Obs', 'Last Seen'].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className="px-4 py-3 text-[10px] font-mono uppercase tracking-wider text-slate-400"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trending.map((ioc) => {
                  const T = TREND_ICON[ioc.trend] ?? Minus;
                  return (
                    <tr
                      key={ioc.indicator}
                      className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-900/20"
                    >
                      <td className="px-4 py-2.5 font-mono text-xs truncate max-w-[200px]">{ioc.indicator}</td>
                      <td className="px-4 py-2.5">
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-slate-500">
                          {ioc.indicator_type}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${STATUS_BADGE[ioc.status]}`}>
                          {ioc.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <T size={14} className={TREND_COLOR[ioc.trend]} />
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="w-20">
                          <div className="text-xs font-mono mb-0.5">{ioc.current_score}</div>
                          <ScoreBar score={ioc.current_score} />
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-xs font-mono text-slate-500">{ioc.observation_count}</td>
                      <td className="px-4 py-2.5 text-xs font-mono text-slate-400">
                        {ioc.last_seen_hours_ago < 1 ? 'Just now' : `${ioc.last_seen_hours_ago}h ago`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {searchType === 'lookup' && lifecycle && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-5 animate-fade-in-up">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-display font-bold font-mono">{lifecycle.indicator}</h2>
              <p className="text-xs text-slate-500 font-mono">
                {lifecycle.indicator_type} · {lifecycle.age_hours}h ago
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${STATUS_BADGE[lifecycle.status]}`}>
                {lifecycle.status}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">First Seen</div>
              <div className="text-sm">{new Date(lifecycle.first_seen).toLocaleString()}</div>
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Last Seen</div>
              <div className="text-sm">{new Date(lifecycle.last_seen).toLocaleString()}</div>
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Peak</div>
              <div className="text-sm font-mono">{lifecycle.peak_score}</div>
              <ScoreBar score={lifecycle.peak_score} />
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Current</div>
              <div className="text-sm font-mono">{lifecycle.current_score}</div>
              <ScoreBar score={lifecycle.current_score} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">
                Sources ({lifecycle.sources_seen.length})
              </div>
              <div className="flex flex-wrap gap-1">
                {lifecycle.sources_seen.map((s) => (
                  <span
                    key={s}
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-slate-500"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">Tags</div>
              <div className="flex flex-wrap gap-1">
                {lifecycle.tags.map((t) => (
                  <span
                    key={t}
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number | null;
  icon?: React.ReactNode;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-4">
      <div className="flex items-center gap-2 mb-1.5">
        {icon && <span className={color ?? 'text-slate-400'}>{icon}</span>}
        <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">{label}</span>
      </div>
      <div className={`text-2xl font-display font-bold ${color ?? 'text-slate-900 dark:text-white'}`}>
        {(value ?? 0).toLocaleString()}
      </div>
    </div>
  );
}
