import { useCallback, useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DataPageLayout } from '../../components/DataPageLayout';
import {
  AlertTriangle,
  Bug,
  Building2,
  Calendar,
  ChevronDown,
  ExternalLink,
  Filter,
  Globe,
  RefreshCw,
  Search,
  Shield,
  Skull,
  TrendingUp,
  X,
} from 'lucide-react';
import { useDebounce } from '../../hooks/useDebounce';

/**
 * CyberPulse — comprehensive breach/leak/intel incident tracker.
 *
 * Broader than ransom.live: covers ransomware, data leaks, credential leaks,
 * extortion, supply chain, zero-day, DDoS, hacktivism, and general breaches.
 * Data sourced from X/Twitter, Telegram, Reddit, Bluesky, and Mastodon firehose.
 */

const TYPE_ICONS: Record<string, typeof AlertTriangle> = {
  ransomware: Skull,
  data_leak: AlertTriangle,
  credential_leak: Bug,
  extortion: Shield,
  defacement: Globe,
  supply_chain: Building2,
  zero_day: AlertTriangle,
  breach: Shield,
  ddos: Globe,
  hacktivism: Skull,
  other: Shield,
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  low: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  info: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
};

const TYPE_COLORS: Record<string, string> = {
  ransomware: 'bg-red-500/10 text-red-400 border-red-500/20',
  data_leak: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  credential_leak: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  extortion: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  defacement: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  supply_chain: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  zero_day: 'bg-red-600/10 text-red-300 border-red-600/20',
  breach: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  ddos: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  hacktivism: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
  other: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

const TYPE_LABELS: Record<string, string> = {
  ransomware: 'Ransomware',
  data_leak: 'Data Leak',
  credential_leak: 'Credential Leak',
  extortion: 'Extortion',
  defacement: 'Defacement',
  supply_chain: 'Supply Chain',
  zero_day: 'Zero-Day',
  breach: 'Breach',
  ddos: 'DDoS',
  hacktivism: 'Hacktivism',
  other: 'Other',
};

const PLATFORM_LABELS: Record<string, string> = {
  x: 'X/Twitter',
  telegram: 'Telegram',
  bluesky: 'Bluesky',
  mastodon: 'Mastodon',
  reddit: 'Reddit',
  manual: 'Manual',
  rss: 'RSS',
  other: 'Other',
};

interface Incident {
  id: string;
  incident_type: string;
  severity: string;
  victim_name: string | null;
  victim_domain: string | null;
  victim_sector: string | null;
  victim_country: string | null;
  threat_actor: string | null;
  title: string;
  description: string | null;
  records_count: number | null;
  data_volume: string | null;
  source_platform: string;
  source_url: string | null;
  source_handle: string | null;
  source_author: string | null;
  confidence: number;
  discovered_at: string;
  reported_at: string | null;
  tags: string;
  source_likes: number;
  source_retweets: number;
}

interface Stats {
  total: number;
  by_type: Array<{ incident_type: string; count: number }>;
  by_severity: Array<{ severity: string; count: number }>;
  by_platform: Array<{ source_platform: string; count: number }>;
  by_sector: Array<{ victim_sector: string; count: number }>;
  daily_trend: Array<{ day: string; count: number }>;
  top_actors: Array<{ threat_actor: string; count: number }>;
  top_victims: Array<{ victim_name: string; count: number }>;
}

interface Trending {
  trending_actors: Array<{ name: string; this_week: number; last_week: number; delta: number }>;
  trending_victims: Array<{ name: string; this_week: number; last_week: number; delta: number }>;
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - Date.parse(dateStr);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatNumber(n: number | null): string {
  if (n === null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function CyberPulse(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [trending, setTrending] = useState<Trending | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  // Filters
  const [typeFilter, setTypeFilter] = useState(searchParams.get('type') ?? '');
  const [severityFilter, setSeverityFilter] = useState(searchParams.get('sev') ?? '');
  const [platformFilter, setPlatformFilter] = useState(searchParams.get('plat') ?? '');
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') ?? '');
  const debouncedSearch = useDebounce(searchQuery, 200);
  const [days, setDays] = useState(Number(searchParams.get('days') ?? '7'));
  const [refreshKey, setRefreshKey] = useState(0);

  const pulseRef = useRef<AbortController | null>(null);

  const fetchIncidents = useCallback(async () => {
    pulseRef.current?.abort();
    const ctrl = new AbortController();
    pulseRef.current = ctrl;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('limit', '100');
      params.set('days', String(days));
      if (typeFilter) params.set('type', typeFilter);
      if (severityFilter) params.set('severity', severityFilter);
      if (platformFilter) params.set('platform', platformFilter);
      if (debouncedSearch) params.set('q', debouncedSearch);

      const signal = AbortSignal.any([ctrl.signal, AbortSignal.timeout(15_000)]);
      const [incRes, statsRes, trendRes] = await Promise.all([
        fetch(`/api/v1/cyberpulse/incidents?${params}`, { signal }),
        fetch(`/api/v1/cyberpulse/stats?days=${days}`, { signal }),
        fetch('/api/v1/cyberpulse/trending', { signal }),
      ]);
      if (ctrl.signal.aborted) return;

      if (incRes.ok) {
        const d = await incRes.json();
        setIncidents(d.incidents);
        setTotal(d.total);
        setHasMore(d.has_more);
      }
      if (statsRes.ok) setStats(await statsRes.json());
      if (trendRes.ok) setTrending(await trendRes.json());
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, [days, typeFilter, severityFilter, platformFilter, debouncedSearch, refreshKey]);

  useEffect(() => {
    fetchIncidents();
    return () => {
      pulseRef.current?.abort();
    };
  }, [fetchIncidents]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (typeFilter) params.set('type', typeFilter);
    if (severityFilter) params.set('sev', severityFilter);
    if (platformFilter) params.set('plat', platformFilter);
    if (searchQuery) params.set('q', searchQuery);
    if (days !== 7) params.set('days', String(days));
    setSearchParams(params, { replace: true });
  }, [typeFilter, severityFilter, platformFilter, searchQuery, days, setSearchParams]);

  const clearFilters = () => {
    setTypeFilter('');
    setSeverityFilter('');
    setPlatformFilter('');
    setSearchQuery('');
    setDays(7);
  };

  const hasFilters = typeFilter || severityFilter || platformFilter || searchQuery || days !== 7;

  return (
    <DataPageLayout
      backTo="/threatintel"
      title="CyberPulse"
      description="Breach, leak & cybercrime incident tracker — sourced from X/Twitter, Telegram, Reddit, Bluesky & Mastodon firehose"
      icon={<AlertTriangle size={28} />}
    >
      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
          <StatCard label="Total" value={stats.total} color="text-white" />
          {stats.by_severity.map((s) => (
            <StatCard
              key={s.severity}
              label={s.severity}
              value={s.count}
              color={SEVERITY_COLORS[s.severity]?.split(' ')[1] ?? 'text-slate-400'}
            />
          ))}
        </div>
      )}

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4 p-3 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white/50 dark:bg-[rgb(var(--surface-200))]">
        <Filter className="w-4 h-4 text-slate-500" />
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search incidents..."
            className="pl-7 pr-2 py-1 text-sm rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-100))] text-slate-900 dark:text-white w-48"
          />
        </div>
        <FilterSelect value={typeFilter} onChange={setTypeFilter} options={TYPE_LABELS} placeholder="Type" />
        <FilterSelect
          value={severityFilter}
          onChange={setSeverityFilter}
          options={{ critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low', info: 'Info' }}
          placeholder="Severity"
        />
        <FilterSelect
          value={platformFilter}
          onChange={setPlatformFilter}
          options={PLATFORM_LABELS}
          placeholder="Platform"
        />
        <FilterSelect
          value={String(days)}
          onChange={(v) => setDays(Number(v))}
          options={{ '1': '1 day', '3': '3 days', '7': '7 days', '14': '14 days', '30': '30 days' }}
          placeholder="Period"
        />
        {hasFilters && (
          <button onClick={clearFilters} className="text-xs text-slate-400 hover:text-white flex items-center gap-1">
            <X className="w-3 h-3" /> Clear
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-slate-500">{total.toLocaleString()} incidents</span>
          <button
            onClick={() => setRefreshKey((k) => k + 1)}
            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
          >
            <RefreshCw className={`w-4 h-4 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && <div className="text-center py-8 text-red-400">{error}</div>}

      {/* Main content: incidents feed + sidebar */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Incidents feed */}
        <div className="flex-1 min-w-0 space-y-3">
          {incidents.length === 0 && !loading && (
            <div className="text-center py-12 text-slate-500">
              <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No incidents found. The ingestion pipeline runs hourly.</p>
              <p className="text-xs mt-2">Try broadening your filters or waiting for the next scan.</p>
            </div>
          )}
          {incidents.map((inc) => (
            <IncidentCard key={inc.id} incident={inc} />
          ))}
          {hasMore && (
            <div className="text-center py-4">
              <button
                onClick={() => {
                  const ctrl = new AbortController();
                  fetch(
                    `/api/v1/cyberpulse/incidents?limit=100&offset=${incidents.length}&days=${days}${typeFilter ? `&type=${typeFilter}` : ''}${severityFilter ? `&severity=${severityFilter}` : ''}${platformFilter ? `&platform=${platformFilter}` : ''}${debouncedSearch ? `&q=${debouncedSearch}` : ''}`,
                    { signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(15_000)]) }
                  )
                    .then((r) => {
                      if (ctrl.signal.aborted) return;
                      return r.json();
                    })
                    .then((d) => {
                      if (ctrl.signal.aborted) return;
                      setIncidents((prev) => [...prev, ...d.incidents]);
                      setHasMore(d.has_more);
                    });
                }}
                className="text-sm text-blue-400 hover:text-blue-300"
              >
                Load more...
              </button>
            </div>
          )}
        </div>

        {/* Sidebar: trending + type breakdown */}
        <div className="w-full lg:w-80 space-y-4">
          {/* Type breakdown */}
          {stats && stats.by_type.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-4">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                <Shield className="w-4 h-4" /> By Type
              </h3>
              <div className="space-y-2">
                {stats.by_type.map((t) => (
                  <button
                    key={t.incident_type}
                    onClick={() => setTypeFilter(typeFilter === t.incident_type ? '' : t.incident_type)}
                    className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs transition-colors ${typeFilter === t.incident_type ? 'bg-blue-500/20 text-blue-400' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'}`}
                  >
                    <span className="flex items-center gap-1.5">
                      <span
                        className={`w-2 h-2 rounded-full ${TYPE_COLORS[t.incident_type]?.split(' ')[0] ?? 'bg-slate-500'}`}
                      />
                      {TYPE_LABELS[t.incident_type] ?? t.incident_type}
                    </span>
                    <span className="font-mono">{t.count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Trending actors */}
          {trending && trending.trending_actors.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-4">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" /> Trending Actors
              </h3>
              <div className="space-y-1.5">
                {trending.trending_actors.map((a) => (
                  <button
                    key={a.name}
                    onClick={() => setTypeFilter('')}
                    className="w-full flex items-center justify-between px-2 py-1 rounded text-xs hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
                  >
                    <span className="truncate">{a.name}</span>
                    <span className="flex items-center gap-1 font-mono">
                      <span className="text-white">{a.this_week}</span>
                      <span className="text-green-400">+{a.delta}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Top victims */}
          {stats && stats.top_victims.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-4">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                <Building2 className="w-4 h-4" /> Most Targeted
              </h3>
              <div className="space-y-1.5">
                {stats.top_victims.map((v) => (
                  <div
                    key={v.victim_name}
                    className="flex items-center justify-between px-2 py-1 text-xs text-slate-600 dark:text-slate-400"
                  >
                    <span className="truncate">{v.victim_name}</span>
                    <span className="font-mono text-white">{v.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Daily trend mini chart */}
          {stats && stats.daily_trend.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-4">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                <Calendar className="w-4 h-4" /> Daily Trend
              </h3>
              <div className="flex items-end gap-1 h-16">
                {stats.daily_trend.map((d) => {
                  const maxCount = Math.max(...stats.daily_trend.map((x) => x.count));
                  const height = maxCount > 0 ? (d.count / maxCount) * 100 : 0;
                  return (
                    <div
                      key={d.day}
                      className="flex-1 flex flex-col items-center gap-0.5"
                      title={`${d.day}: ${d.count}`}
                    >
                      <div className="w-full bg-blue-500/40 rounded-t" style={{ height: `${Math.max(height, 4)}%` }} />
                      <span className="text-[9px] text-slate-500 font-mono">{d.day.slice(5)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </DataPageLayout>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-3 text-center">
      <div className={`text-xl font-bold ${color}`}>{formatNumber(value)}</div>
      <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Record<string, string>;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1 px-2 py-1 text-xs rounded border ${value ? 'border-blue-500/50 text-blue-400 bg-blue-500/10' : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-600 dark:text-slate-400'}`}
      >
        {value ? (options[value] ?? value) : placeholder}
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 left-0 bg-white dark:bg-[rgb(var(--surface-300))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded shadow-e3 max-h-48 overflow-auto min-w-[120px]">
            <button
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
              className="block w-full text-left px-3 py-1.5 text-xs hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"
            >
              All
            </button>
            {Object.entries(options).map(([k, v]) => (
              <button
                key={k}
                onClick={() => {
                  onChange(k);
                  setOpen(false);
                }}
                className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-slate-100 dark:hover:bg-slate-700 ${value === k ? 'text-blue-400 font-semibold' : 'text-slate-700 dark:text-slate-300'}`}
              >
                {v}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function IncidentCard({ incident: inc }: { incident: Incident }) {
  const Icon = TYPE_ICONS[inc.incident_type] ?? Shield;
  const tags: string[] = (() => {
    try {
      return JSON.parse(inc.tags);
    } catch {
      return [];
    }
  })();

  return (
    <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-4 hover:border-slate-300 dark:hover:border-[rgb(var(--border-500))] transition-colors">
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 p-1.5 rounded ${TYPE_COLORS[inc.incident_type]?.split(' ').slice(0, 2).join(' ') ?? 'bg-slate-500/10 text-slate-400'}`}
        >
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span
              className={`px-1.5 py-0.5 text-[10px] font-semibold uppercase rounded border ${SEVERITY_COLORS[inc.severity] ?? 'bg-slate-500/20 text-slate-400 border-slate-500/30'}`}
            >
              {inc.severity}
            </span>
            <span
              className={`px-1.5 py-0.5 text-[10px] font-medium uppercase rounded border ${TYPE_COLORS[inc.incident_type]?.split(' ').slice(0, 2).join(' ') ?? 'bg-slate-500/10 text-slate-400 border-slate-500/20'}`}
            >
              {TYPE_LABELS[inc.incident_type] ?? inc.incident_type}
            </span>
            <span className="text-[10px] text-slate-500 font-mono">
              {PLATFORM_LABELS[inc.source_platform] ?? inc.source_platform}
            </span>
          </div>

          <p className="text-sm text-slate-200 dark:text-slate-200 leading-snug mb-1.5 line-clamp-2">{inc.title}</p>

          <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
            {inc.victim_name && (
              <span className="flex items-center gap-1">
                <Building2 className="w-3 h-3" />
                {inc.victim_name}
              </span>
            )}
            {inc.threat_actor && (
              <span className="flex items-center gap-1 text-red-400">
                <Skull className="w-3 h-3" />
                {inc.threat_actor}
              </span>
            )}
            {inc.victim_sector && <span className="text-slate-500">{inc.victim_sector}</span>}
            {inc.records_count && <span className="font-mono">{formatNumber(inc.records_count)} records</span>}
            {inc.data_volume && <span className="font-mono">{inc.data_volume}</span>}
          </div>

          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {tags.slice(0, 5).map((tag) => (
              <span
                key={tag}
                className="px-1.5 py-0.5 text-[10px] rounded bg-slate-100 dark:bg-slate-800 text-slate-500"
              >
                {tag}
              </span>
            ))}
            <span className="text-[10px] text-slate-600 ml-auto">{relativeTime(inc.discovered_at)}</span>
            {inc.source_url && (
              <a
                href={inc.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300"
              >
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
