import { useState, useMemo, useEffect } from 'react';
import { BackLink } from '../../components/BackLink';
import { DataState } from '../../components/DataState';
import {
  AlertTriangle,
  ArrowLeft,
  Bug,
  Copy,
  FileWarning,
  Globe,
  Key,
  LayoutGrid,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Trophy,
} from 'lucide-react';

type TabId = 'overview' | 'live' | 'leaderboard';
type Severity = 'critical' | 'high' | 'medium' | 'low';
type Source = 'file' | 'commit';

interface LeakEntry {
  id: string;
  provider: string;
  redactedKey: string;
  repo: string;
  owner: string;
  file: string;
  severity: Severity;
  source: Source;
  timestamp: string;
  exposureScore: number;
  secretCount: number;
  url?: string;
}

interface SecretLeaksResponse {
  generated_at: string;
  total_scanned: number;
  total_secrets: number;
  total_repos: number;
  total_providers: number;
  leaks: LeakEntry[];
  severity_mix: Record<Severity, number>;
  leaderboard: {
    providers: Array<{ name: string; count: number; pct: number }>;
    repos: Array<{ name: string; secrets: number; owner: string }>;
    owners: Array<{ name: string; repos: number; totalSecrets: number }>;
  };
}

const SEV_STYLES: Record<Severity, { text: string; chip: string; Icon: typeof ShieldAlert }> = {
  critical: {
    text: 'text-rose-700 dark:text-rose-300',
    chip: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
    Icon: ShieldX,
  },
  high: {
    text: 'text-orange-600 dark:text-orange-400',
    chip: 'border-orange-500/30 bg-orange-500/5 text-orange-600 dark:text-orange-400',
    Icon: ShieldAlert,
  },
  medium: {
    text: 'text-amber-700 dark:text-amber-400',
    chip: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
    Icon: AlertTriangle,
  },
  low: {
    text: 'text-sky-700 dark:text-sky-400',
    chip: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400',
    Icon: ShieldCheck,
  },
};

export default function SecretLeaks(): JSX.Element {
  const [data, setData] = useState<SecretLeaksResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [tab, setTab] = useState<TabId>('overview');
  const [query, setQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<Severity | 'all'>('all');
  const [providerFilter, setProviderFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | Source>('all');
  const [sortBy, setSortBy] = useState<'score' | 'secrets' | 'repo' | 'scan'>('score');
  const [page, setPage] = useState(1);
  const [copied, setCopied] = useState<string | null>(null);
  const perPage = 8;

  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetch('/api/v1/secret-leaks', { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: SecretLeaksResponse) => {
        if (alive) setData(d);
      })
      .catch((e) => {
        if (alive && (e as { name?: string }).name !== 'AbortError') {
          setError(e instanceof Error ? e.message : String(e));
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

  const leaks = useMemo(() => data?.leaks ?? [], [data]);
  const providers = useMemo(() => [...new Set(leaks.map((l) => l.provider))].sort(), [leaks]);
  const stats = data
    ? {
        totalSecrets: data.total_secrets,
        leakedRepos: data.total_repos,
        providers: data.total_providers,
        reposScanned: data.total_scanned,
      }
    : { totalSecrets: 0, leakedRepos: 0, providers: 0, reposScanned: 0 };

  const filtered = useMemo(() => {
    let items = [...leaks];
    if (query) {
      const q = query.toLowerCase();
      items = items.filter(
        (l) =>
          l.repo.toLowerCase().includes(q) ||
          l.owner.toLowerCase().includes(q) ||
          l.provider.toLowerCase().includes(q) ||
          l.file.toLowerCase().includes(q)
      );
    }
    if (severityFilter !== 'all') items = items.filter((l) => l.severity === severityFilter);
    if (providerFilter !== 'all') items = items.filter((l) => l.provider === providerFilter);
    if (sourceFilter !== 'all') items = items.filter((l) => l.source === sourceFilter);
    items.sort((a, b) => {
      switch (sortBy) {
        case 'score':
          return b.exposureScore - a.exposureScore;
        case 'secrets':
          return b.secretCount - a.secretCount;
        case 'repo':
          return a.repo.localeCompare(b.repo);
        case 'scan':
          return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      }
    });
    return items;
  }, [leaks, query, severityFilter, providerFilter, sourceFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paged = filtered.slice((page - 1) * perPage, page * perPage);

  const tabs: Array<{ id: TabId; label: string; icon: typeof LayoutGrid }> = [
    { id: 'overview', label: 'Overview', icon: LayoutGrid },
    { id: 'live', label: 'Live Keys', icon: Key },
    { id: 'leaderboard', label: 'Leaderboards', icon: Trophy },
  ];

  function copyKey(key: string) {
    navigator.clipboard.writeText(key).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="max-w-full px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <div className="max-w-7xl mx-auto">
        <BackLink
          to="/threatintel"
          className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
        >
          <ArrowLeft size={14} /> back to Threat Intel
        </BackLink>

        {/* Header */}
        <div className="animate-fade-in-up mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Key className="text-brand-500" size={28} />
            <h1 className="text-3xl sm:text-4xl font-display font-bold">Secret Leak Dashboard</h1>
            {data && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-[10px] font-mono uppercase">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                live
              </span>
            )}
          </div>
          <p className="text-slate-600 dark:text-slate-400 mb-2 max-w-3xl">
            Real-time monitoring of exposed API keys, tokens, and credentials in public repositories. Inspired by{' '}
            <a
              href="https://x3r0day.me/WebShame/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 dark:text-brand-400 hover:underline"
            >
              WebShame
            </a>{' '}
            &mdash; public metadata only, keys always masked.
          </p>
          {data?.generated_at && (
            <p className="text-[10px] font-mono text-slate-400">
              last scan: {new Date(data.generated_at).toLocaleString()}
            </p>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-8 border-b border-slate-200 dark:border-slate-800">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                setPage(1);
              }}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-mono border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <t.icon size={14} />
              {t.label}
            </button>
          ))}
        </div>

        <DataState
          loading={loading}
          error={error}
          empty={!loading && !error && leaks.length === 0}
          emptyLabel="No leaks detected in the latest scan"
          onRetry={() => setRefreshKey((k) => k + 1)}
        >
          {/* ── Overview Tab ────────────────────────────────────────────── */}
          {tab === 'overview' && (
            <div className="space-y-8 animate-fade-in-up">
              {/* Mission */}
              <div className="grid sm:grid-cols-2 gap-6">
                <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-brand-600 dark:text-brand-400 mb-2">
                    The Mission
                  </p>
                  <h2 className="text-xl font-display font-bold mb-3">Visibility that helps teams defend fast.</h2>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                    We surface public metadata so defenders can respond quickly without retaining code.
                  </p>
                  <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                    {[
                      'Secrets leak to public repos daily.',
                      'Attackers exploit instantly. Visibility enables defense.',
                      'No code retention. Public metadata only. Keys are always masked.',
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-2">
                        <Shield size={14} className="text-brand-500 mt-0.5 flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-display font-semibold">Leak Anatomy</h3>
                  {[
                    { label: 'Provider', desc: 'Service or API type detected.' },
                    { label: 'Redacted Key', desc: 'Masked preview only.' },
                    { label: 'Repository', desc: 'Repo and owner details when public.' },
                    { label: 'Timestamp', desc: 'Most recent scan time for context.' },
                    { label: 'Source Link', desc: 'Public link for responsible follow-up.' },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center gap-3 p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                    >
                      <span className="text-xs font-mono font-semibold text-brand-600 dark:text-brand-400 w-24 flex-shrink-0">
                        {item.label}
                      </span>
                      <span className="text-sm text-slate-600 dark:text-slate-400">{item.desc}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Leaks Found', value: stats.totalSecrets.toLocaleString(), icon: Bug },
                  { label: 'Repos Affected', value: stats.leakedRepos.toLocaleString(), icon: FileWarning },
                  { label: 'Providers', value: stats.providers.toString(), icon: Globe },
                  { label: 'Repos Scanned', value: stats.reposScanned.toLocaleString(), icon: Search },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-4"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <s.icon size={14} className="text-slate-400" />
                      <span className="text-[10px] font-mono uppercase text-slate-400">{s.label}</span>
                    </div>
                    <div className="text-2xl font-mono font-bold">{s.value}</div>
                  </div>
                ))}
              </div>

              {/* CTA to Live tab */}
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setTab('live')}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-brand-600 text-white rounded-lg font-mono text-sm hover:bg-brand-700 transition-colors"
                >
                  <Key size={16} /> View Live Leaks
                </button>
              </div>
            </div>
          )}

          {/* ── Live Keys Tab ───────────────────────────────────────────── */}
          {tab === 'live' && (
            <div className="space-y-6 animate-fade-in-up">
              {/* Filters */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-mono uppercase text-slate-400">Search</span>
                  <div className="relative">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setPage(1);
                      }}
                      placeholder="Repo, file, provider..."
                      className="w-full pl-8 pr-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded text-xs font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-brand-500"
                    />
                  </div>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-mono uppercase text-slate-400">Severity</span>
                  <select
                    value={severityFilter}
                    onChange={(e) => {
                      setSeverityFilter(e.target.value as Severity | 'all');
                      setPage(1);
                    }}
                    className="py-2 px-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-brand-500"
                  >
                    <option value="all">All levels</option>
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-mono uppercase text-slate-400">Provider</span>
                  <select
                    value={providerFilter}
                    onChange={(e) => {
                      setProviderFilter(e.target.value);
                      setPage(1);
                    }}
                    className="py-2 px-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-brand-500"
                  >
                    <option value="all">All providers</option>
                    {providers.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-mono uppercase text-slate-400">Source</span>
                  <select
                    value={sourceFilter}
                    onChange={(e) => {
                      setSourceFilter(e.target.value as 'all' | Source);
                      setPage(1);
                    }}
                    className="py-2 px-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-brand-500"
                  >
                    <option value="all">Files and commits</option>
                    <option value="file">Files only</option>
                    <option value="commit">Commit history</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-mono uppercase text-slate-400">Sort</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                    className="py-2 px-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-brand-500"
                  >
                    <option value="score">Exposure score</option>
                    <option value="secrets">Secret count</option>
                    <option value="repo">Repo name</option>
                    <option value="scan">Fastest scan</option>
                  </select>
                </label>
              </div>

              {/* Results */}
              <div className="flex items-center justify-between text-xs font-mono text-slate-500">
                <span>{filtered.length} results</span>
                <span>
                  Page {page} of {totalPages}
                </span>
              </div>

              {paged.length === 0 ? (
                <div className="text-center py-12">
                  <h3 className="text-lg font-display font-semibold text-slate-400">No matches.</h3>
                </div>
              ) : (
                <div className="space-y-3">
                  {paged.map((leak) => {
                    const sev = SEV_STYLES[leak.severity];
                    const SevIcon = sev.Icon;
                    return (
                      <div
                        key={leak.id}
                        className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-4 hover:border-brand-500/40 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold border ${sev.chip}`}
                              >
                                <SevIcon size={10} />
                                {leak.severity}
                              </span>
                              <span className="text-[10px] font-mono text-slate-400">{leak.provider}</span>
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                                {leak.source === 'file' ? 'File' : 'Commit'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-mono font-semibold text-slate-900 dark:text-slate-100">
                                {leak.owner}/{leak.repo}
                              </span>
                              <span className="text-xs text-slate-400">/</span>
                              <span className="text-xs font-mono text-slate-500">{leak.file}</span>
                            </div>
                            <div className="flex items-center gap-3 text-xs font-mono text-slate-500">
                              <span>
                                Key:{' '}
                                <code className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                  {leak.redactedKey}
                                </code>
                              </span>
                              <button
                                type="button"
                                onClick={() => copyKey(leak.redactedKey)}
                                className="inline-flex items-center gap-1 text-slate-400 hover:text-brand-500 transition-colors"
                                title="Copy redacted key"
                              >
                                <Copy size={10} />
                                {copied === leak.redactedKey ? 'Copied!' : 'Copy'}
                              </button>
                              <span>{new Date(leak.timestamp).toLocaleString()}</span>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div
                              className="text-2xl font-mono font-bold"
                              style={{
                                color:
                                  leak.exposureScore >= 80
                                    ? '#F44336'
                                    : leak.exposureScore >= 60
                                      ? '#FF9800'
                                      : leak.exposureScore >= 40
                                        ? '#FFC107'
                                        : '#66BB6A',
                              }}
                            >
                              {leak.exposureScore}
                            </div>
                            <div className="text-[10px] font-mono text-slate-400">exposure</div>
                            <div className="text-xs font-mono text-slate-500 mt-1">
                              {leak.secretCount} secret{leak.secretCount > 1 ? 's' : ''}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <span className="text-xs font-mono text-slate-500">
                    Page {page} of {totalPages}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="px-3 py-1.5 text-xs font-mono border border-slate-200 dark:border-slate-700 rounded text-slate-600 dark:text-slate-400 hover:border-brand-500/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      className="px-3 py-1.5 text-xs font-mono border border-slate-200 dark:border-slate-700 rounded text-slate-600 dark:text-slate-400 hover:border-brand-500/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Leaderboard Tab ─────────────────────────────────────────── */}
          {tab === 'leaderboard' && (
            <div className="space-y-8 animate-fade-in-up">
              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  {
                    label: 'Leaks Found',
                    value: stats.totalSecrets.toLocaleString(),
                    sub: 'Total exposed secrets',
                    icon: Bug,
                  },
                  {
                    label: 'Repos With Leaks',
                    value: stats.leakedRepos.toLocaleString(),
                    sub: 'Repositories affected',
                    icon: FileWarning,
                  },
                  {
                    label: 'Providers Detected',
                    value: stats.providers.toString(),
                    sub: 'Unique secret types',
                    icon: Globe,
                  },
                  {
                    label: 'Repos Scanned',
                    value: stats.reposScanned.toLocaleString(),
                    sub: 'Latest crawl size',
                    icon: Search,
                  },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <s.icon size={14} className="text-slate-400" />
                      <span className="text-[10px] font-mono uppercase text-slate-400">{s.label}</span>
                    </div>
                    <div className="text-3xl font-mono font-bold mb-1">{s.value}</div>
                    <div className="text-[10px] font-mono text-slate-400">{s.sub}</div>
                  </div>
                ))}
              </div>

              {/* Severity Mix */}
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-display font-semibold">Leak Mix</h3>
                    <p className="text-[10px] font-mono text-slate-400">Severity share in the latest scan</p>
                  </div>
                  <span className="text-xs font-mono px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                    {stats.totalSecrets.toLocaleString()} secrets
                  </span>
                </div>
                <div className="flex h-3 rounded-full overflow-hidden mb-3">
                  <span
                    style={{
                      width: `${((data?.severity_mix.critical ?? 0) / Math.max(1, stats.totalSecrets)) * 100}%`,
                    }}
                    className="bg-rose-500"
                  />
                  <span
                    style={{ width: `${((data?.severity_mix.high ?? 0) / Math.max(1, stats.totalSecrets)) * 100}%` }}
                    className="bg-orange-500"
                  />
                  <span
                    style={{ width: `${((data?.severity_mix.medium ?? 0) / Math.max(1, stats.totalSecrets)) * 100}%` }}
                    className="bg-amber-500"
                  />
                  <span
                    style={{ width: `${((data?.severity_mix.low ?? 0) / Math.max(1, stats.totalSecrets)) * 100}%` }}
                    className="bg-sky-500"
                  />
                </div>
                <div className="flex flex-wrap gap-4 text-xs font-mono">
                  {[
                    { label: 'Critical', count: data?.severity_mix.critical ?? 0, color: 'bg-rose-500' },
                    { label: 'High', count: data?.severity_mix.high ?? 0, color: 'bg-orange-500' },
                    { label: 'Medium', count: data?.severity_mix.medium ?? 0, color: 'bg-amber-500' },
                    { label: 'Low', count: data?.severity_mix.low ?? 0, color: 'bg-sky-500' },
                  ].map((s) => (
                    <div key={s.label} className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${s.color}`} />
                      <span className="text-slate-500">{s.label}</span>
                      <strong className="text-slate-700 dark:text-slate-300">{s.count.toLocaleString()}</strong>
                    </div>
                  ))}
                </div>
              </div>

              {/* Rankings */}
              <div className="grid sm:grid-cols-3 gap-6">
                {/* Top Providers */}
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
                  <div className="mb-4">
                    <h3 className="text-sm font-display font-semibold">Most Exposed Providers</h3>
                    <p className="text-[10px] font-mono text-slate-400">Top secret types by count</p>
                  </div>
                  <ol className="space-y-2">
                    {(data?.leaderboard.providers ?? []).map((p, i) => (
                      <li key={p.name} className="flex items-center gap-3">
                        <span className="text-xs font-mono text-slate-400 w-4 text-right">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                            {p.name}
                          </div>
                          <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full mt-1">
                            <div className="h-full bg-brand-500 rounded-full" style={{ width: `${p.pct}%` }} />
                          </div>
                        </div>
                        <span className="text-xs font-mono text-slate-500 flex-shrink-0">
                          {p.count.toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Top Repos */}
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
                  <div className="mb-4">
                    <h3 className="text-sm font-display font-semibold">Top Repos</h3>
                    <p className="text-[10px] font-mono text-slate-400">Highest number of secrets found</p>
                  </div>
                  <ol className="space-y-2">
                    {(data?.leaderboard.repos ?? []).map((r, i) => (
                      <li key={r.name} className="flex items-center gap-3">
                        <span className="text-xs font-mono text-slate-400 w-4 text-right">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                            {r.name}
                          </div>
                          <div className="text-[10px] font-mono text-slate-400">{r.owner}</div>
                        </div>
                        <span className="text-xs font-mono font-semibold text-rose-600 dark:text-rose-400">
                          {r.secrets}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Top Users */}
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
                  <div className="mb-4">
                    <h3 className="text-sm font-display font-semibold">Top Users</h3>
                    <p className="text-[10px] font-mono text-slate-400">Owners with the most leaked repos</p>
                  </div>
                  <ol className="space-y-2">
                    {(data?.leaderboard.owners ?? []).map((o, i) => (
                      <li key={o.name} className="flex items-center gap-3">
                        <span className="text-xs font-mono text-slate-400 w-4 text-right">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                            {o.name}
                          </div>
                          <div className="text-[10px] font-mono text-slate-400">{o.repos} repos</div>
                        </div>
                        <span className="text-xs font-mono font-semibold text-orange-600 dark:text-orange-400">
                          {o.totalSecrets}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </div>
          )}
        </DataState>
      </div>
    </div>
  );
}
