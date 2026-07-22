import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Database,
  ExternalLink,
  Filter,
  Globe,
  Hash,
  Link2,
  Mail,
  RefreshCw,
  Search,
  Server,
  Shield,
  Wallet,
  X,
} from 'lucide-react';
import { PageMeta } from '../../components/PageMeta';

type IocKind = 'ip' | 'domain' | 'url' | 'hash' | 'email' | 'wallet';

interface LiveIoc {
  value: string;
  kind: IocKind;
  source: string;
  reporter?: string;
  context?: string;
  reference_url?: string;
  observed_at?: string;
  confidence?: number;
  confidence_band?: 'high' | 'medium' | 'low';
  tags?: string[];
}

interface LiveSource {
  id: string;
  ok: boolean;
  count: number;
  newest_observation?: string;
}

interface LiveIocsResponse {
  generated_at: string;
  sources: LiveSource[];
  registered_sources?: LiveSource[];
  total: number;
  items: LiveIoc[];
}

const KIND_FILTERS: Array<{ id: IocKind | 'all'; label: string; icon: typeof Globe }> = [
  { id: 'all', label: 'All Types', icon: Shield },
  { id: 'ip', label: 'IPs', icon: Server },
  { id: 'domain', label: 'Domains', icon: Globe },
  { id: 'url', label: 'URLs', icon: Link2 },
  { id: 'hash', label: 'Hashes', icon: Hash },
  { id: 'email', label: 'Emails', icon: Mail },
  { id: 'wallet', label: 'Wallets', icon: Wallet },
];

const KIND_PILL: Record<string, string> = {
  ip: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  domain: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  url: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  hash: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  email: 'border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-300',
  wallet: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
};

const CONFIDENCE_PILL: Record<string, string> = {
  high: 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40',
  medium: 'text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40',
  low: 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40',
};

const KIND_ICONS: Record<string, typeof Globe> = {
  ip: Server,
  domain: Globe,
  url: Link2,
  hash: Hash,
  email: Mail,
  wallet: Wallet,
};

const PAGE_SIZE = 50;

export default function IocBrowser() {
  const [data, setData] = useState<LiveIocsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<IocKind | 'all'>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [page, setPage] = useState(0);
  const [selectedIoc, setSelectedIoc] = useState<LiveIoc | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/data/threat-intel/index.json');
      if (res.ok) {
        const data = await res.json();
        if (data.iocIndex) {
          const items = data.iocIndex.map((i: Record<string, unknown>) => ({
            value: (i.value as string) || '',
            kind: (i.type as string) || 'unknown',
            source: (i.source as string) || 'unknown',
            context: (i.context as string) || '',
            observed_at: (i.observed_at as string) || '',
            confidence: i.confidence as number | undefined,
            tags: (i.tags as string[]) || [],
          }));
          setData({ generated_at: new Date().toISOString(), sources: [], total: items.length, items });
        }
      }
    } catch (e) {
      console.error('IoC fetch failed:', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = useMemo(() => {
    if (!data?.items) return [];
    let items = data.items;

    if (typeFilter !== 'all') {
      items = items.filter((i) => i.kind === typeFilter);
    }

    if (sourceFilter !== 'all') {
      items = items.filter((i) => i.source === sourceFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      items = items.filter(
        (i) =>
          i.value.toLowerCase().includes(q) ||
          i.source.toLowerCase().includes(q) ||
          i.context?.toLowerCase().includes(q) ||
          i.tags?.some((t) => t.toLowerCase().includes(q))
      );
    }

    return items;
  }, [data, typeFilter, sourceFilter, search]);

  const paged = useMemo(() => {
    const start = page * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const sourceList = useMemo(() => {
    if (!data?.registered_sources) return data?.sources || [];
    return data.registered_sources;
  }, [data]);

  const stats = useMemo(() => {
    if (!data?.items) return { total: 0, byType: {}, bySource: {} };
    const byType: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    for (const i of data.items) {
      byType[i.kind] = (byType[i.kind] || 0) + 1;
      bySource[i.source] = (bySource[i.source] || 0) + 1;
    }
    return { total: data.total, byType, bySource };
  }, [data]);

  const handleSearch = (q: string) => {
    setSearch(q);
    setPage(0);
  };

  const handleTypeFilter = (t: IocKind | 'all') => {
    setTypeFilter(t);
    setPage(0);
  };

  const handleSourceFilter = (s: string) => {
    setSourceFilter(s);
    setPage(0);
  };

  return (
    <>
      <PageMeta
        title="IoC Database — Threat Intelligence Platform"
        description="Browse and search 1.6M+ indicators of compromise from 30+ threat intelligence feeds."
        canonicalPath="/cti/iocs"
      />

      <div className="min-h-screen bg-[rgb(var(--surface-100))] dark:bg-[rgb(var(--surface-100))]">
        {/* Header */}
        <div className="border-b border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
            <div className="flex items-center gap-3 mb-4">
              <Link
                to="/cti"
                className="p-2 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-300))] transition-colors"
              >
                <ArrowLeft size={16} className="text-slate-600 dark:text-slate-400" />
              </Link>
              <div className="w-10 h-10 rounded-lg bg-sky-600 flex items-center justify-center">
                <Database size={20} className="text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">Indicators of Compromise</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {stats.total.toLocaleString()} IoCs · {sourceList.length} sources
                </p>
              </div>
            </div>

            {/* Search Bar */}
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search IPs, domains, URLs, hashes, emails, wallets..."
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-100))] text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 dark:focus:ring-brand-400/40 dark:focus:border-brand-400"
              />
              {search && (
                <button
                  onClick={() => handleSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))]"
                >
                  <X size={14} className="text-slate-400" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <div className="grid lg:grid-cols-4 gap-6">
            {/* Sidebar — Filters */}
            <div className="lg:col-span-1 space-y-4">
              {/* Type Filter */}
              <div className="rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-4">
                <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
                  <Filter size={12} /> Type
                </h3>
                <div className="space-y-1">
                  {KIND_FILTERS.map((f) => {
                    const count = f.id === 'all' ? stats.total : stats.byType[f.id] || 0;
                    return (
                      <button
                        key={f.id}
                        onClick={() => handleTypeFilter(f.id)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                          typeFilter === f.id
                            ? 'bg-brand-50 dark:bg-brand-950/30 text-brand-700 dark:text-brand-300 font-medium'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-300))]'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <f.icon size={14} />
                          {f.label}
                        </span>
                        <span className="text-xs font-mono">{count.toLocaleString()}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Source Filter */}
              <div className="rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-4">
                <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                  Source
                </h3>
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  <button
                    onClick={() => handleSourceFilter('all')}
                    className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      sourceFilter === 'all'
                        ? 'bg-brand-50 dark:bg-brand-950/30 text-brand-700 dark:text-brand-300 font-medium'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-300))]'
                    }`}
                  >
                    <span>All Sources</span>
                    <span className="text-xs font-mono">{stats.total.toLocaleString()}</span>
                  </button>
                  {sourceList
                    .filter((s) => s.count > 0)
                    .sort((a, b) => b.count - a.count)
                    .map((s) => (
                      <button
                        key={s.id}
                        onClick={() => handleSourceFilter(s.id)}
                        className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-sm transition-colors ${
                          sourceFilter === s.id
                            ? 'bg-brand-50 dark:bg-brand-950/30 text-brand-700 dark:text-brand-300 font-medium'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-300))]'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span className={`w-1.5 h-1.5 rounded-full ${s.ok ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                          <span className="truncate">{s.id}</span>
                        </span>
                        <span className="text-xs font-mono">{s.count.toLocaleString()}</span>
                      </button>
                    ))}
                </div>
              </div>

              {/* Quick Stats */}
              <div className="rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-4">
                <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                  Quick Stats
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Total IoCs</span>
                    <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                      {stats.total.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Filtered</span>
                    <span className="font-mono font-semibold text-brand-600 dark:text-brand-400">
                      {filtered.length.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Last Sync</span>
                    <span className="font-mono text-xs text-slate-400">
                      {data?.generated_at ? new Date(data.generated_at).toLocaleTimeString() : '—'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Main Content — IoC Table */}
            <div className="lg:col-span-3">
              <div className="rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))]">
                {/* Table Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-[rgb(var(--border-400))]">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      {filtered.length.toLocaleString()} results
                    </span>
                    {(typeFilter !== 'all' || sourceFilter !== 'all' || search) && (
                      <button
                        onClick={() => {
                          setTypeFilter('all');
                          setSourceFilter('all');
                          setSearch('');
                          setPage(0);
                        }}
                        className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                  <button
                    onClick={fetchData}
                    disabled={loading}
                    className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))] transition-colors"
                    title="Refresh"
                  >
                    <RefreshCw size={14} className={loading ? 'animate-spin text-slate-400' : 'text-slate-500'} />
                  </button>
                </div>

                {/* Loading State */}
                {loading && !data ? (
                  <div className="p-12 text-center">
                    <RefreshCw size={24} className="animate-spin text-slate-400 mx-auto mb-3" />
                    <p className="text-sm text-slate-500 dark:text-slate-400">Loading IoCs...</p>
                  </div>
                ) : paged.length === 0 ? (
                  <div className="p-12 text-center">
                    <Database size={32} className="text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                    <p className="text-sm text-slate-500 dark:text-slate-400">No IoCs match your filters.</p>
                  </div>
                ) : (
                  <>
                    {/* Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-[rgb(var(--border-400))]">
                            <th className="px-4 py-2.5 font-semibold">Type</th>
                            <th className="px-4 py-2.5 font-semibold">Value / Enrichment</th>
                            <th className="px-4 py-2.5 font-semibold">Confidence</th>
                            <th className="px-4 py-2.5 font-semibold">Source</th>
                            <th className="px-4 py-2.5 font-semibold">Tags</th>
                            <th className="px-4 py-2.5 font-semibold">Seen</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paged.map((ioc, idx) => {
                            const Icon = KIND_ICONS[ioc.kind] || Hash;
                            const confBand =
                              ioc.confidence_band ||
                              (ioc.confidence && ioc.confidence >= 0.8
                                ? 'high'
                                : ioc.confidence && ioc.confidence >= 0.5
                                  ? 'medium'
                                  : 'low');
                            return (
                              <tr
                                key={`${ioc.value}-${idx}`}
                                className="border-b border-slate-100 dark:border-[rgb(var(--border-400))] last:border-0 hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-300))] cursor-pointer transition-colors"
                                onClick={() => setSelectedIoc(selectedIoc?.value === ioc.value ? null : ioc)}
                              >
                                <td className="px-4 py-2.5">
                                  <span
                                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono border ${KIND_PILL[ioc.kind] || 'border-slate-300 bg-slate-100 text-slate-600'}`}
                                  >
                                    <Icon size={10} />
                                    {ioc.kind}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5">
                                  <div className="font-mono text-xs text-slate-800 dark:text-slate-200 truncate max-w-md">
                                    {ioc.value}
                                  </div>
                                  {ioc.context && (
                                    <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate max-w-md mt-0.5">
                                      {ioc.context}
                                    </div>
                                  )}
                                </td>
                                <td className="px-4 py-2.5">
                                  {confBand && (
                                    <span
                                      className={`px-2 py-0.5 rounded text-[10px] font-mono ${CONFIDENCE_PILL[confBand]}`}
                                    >
                                      {confBand}
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5">
                                  <span className="text-xs text-slate-500 dark:text-slate-400">{ioc.source}</span>
                                </td>
                                <td className="px-4 py-2.5">
                                  {ioc.tags && ioc.tags.length > 0 ? (
                                    <div className="flex flex-wrap gap-1">
                                      {ioc.tags.slice(0, 2).map((t) => (
                                        <span
                                          key={t}
                                          className="px-1.5 py-0.5 text-[9px] font-mono bg-slate-100 dark:bg-[rgb(var(--surface-300))] text-slate-500 rounded"
                                        >
                                          {t}
                                        </span>
                                      ))}
                                      {ioc.tags.length > 2 && (
                                        <span className="text-[9px] text-slate-400">+{ioc.tags.length - 2}</span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-slate-300 dark:text-slate-600">—</span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5">
                                  <span className="text-[11px] font-mono text-slate-400">
                                    {ioc.observed_at ? new Date(ioc.observed_at).toLocaleDateString() : '—'}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-[rgb(var(--border-400))]">
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          Page {page + 1} of {totalPages}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setPage((p) => Math.max(0, p - 1))}
                            disabled={page === 0}
                            className="p-1.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-300))] disabled:opacity-30 transition-colors"
                          >
                            <ChevronLeft size={14} className="text-slate-600 dark:text-slate-400" />
                          </button>
                          <button
                            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                            disabled={page >= totalPages - 1}
                            className="p-1.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-300))] disabled:opacity-30 transition-colors"
                          >
                            <ChevronRight size={14} className="text-slate-600 dark:text-slate-400" />
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Selected IoC Detail Panel */}
              {selectedIoc && (
                <div className="mt-4 rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      <Shield size={14} /> IoC Details
                    </h3>
                    <button onClick={() => setSelectedIoc(null)} className="text-slate-400 hover:text-slate-600">
                      <X size={14} />
                    </button>
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-mono uppercase text-slate-400">Value</label>
                      <p className="font-mono text-sm text-slate-800 dark:text-slate-200 break-all">
                        {selectedIoc.value}
                      </p>
                    </div>
                    <div>
                      <label className="text-[10px] font-mono uppercase text-slate-400">Type</label>
                      <p className="text-sm text-slate-700 dark:text-slate-300 capitalize">{selectedIoc.kind}</p>
                    </div>
                    <div>
                      <label className="text-[10px] font-mono uppercase text-slate-400">Source</label>
                      <p className="text-sm text-slate-700 dark:text-slate-300">{selectedIoc.source}</p>
                    </div>
                    <div>
                      <label className="text-[10px] font-mono uppercase text-slate-400">Confidence</label>
                      <p className="text-sm text-slate-700 dark:text-slate-300">
                        {selectedIoc.confidence
                          ? `${(selectedIoc.confidence * 100).toFixed(0)}%`
                          : selectedIoc.confidence_band || '—'}
                      </p>
                    </div>
                    {selectedIoc.context && (
                      <div className="md:col-span-2">
                        <label className="text-[10px] font-mono uppercase text-slate-400">Context</label>
                        <p className="text-sm text-slate-700 dark:text-slate-300">{selectedIoc.context}</p>
                      </div>
                    )}
                    {selectedIoc.tags && selectedIoc.tags.length > 0 && (
                      <div className="md:col-span-2">
                        <label className="text-[10px] font-mono uppercase text-slate-400">Tags</label>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {selectedIoc.tags.map((t) => (
                            <span
                              key={t}
                              className="px-2 py-0.5 text-xs font-mono bg-slate-100 dark:bg-[rgb(var(--surface-300))] text-slate-600 dark:text-slate-400 rounded"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 mt-4">
                    <Link
                      to={`/cti/check?q=${encodeURIComponent(selectedIoc.value)}`}
                      className="px-3 py-1.5 text-xs font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
                    >
                      Check Reputation
                    </Link>
                    {selectedIoc.reference_url && (
                      <a
                        href={selectedIoc.reference_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-600 dark:text-slate-400 rounded-lg hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-300))] flex items-center gap-1"
                      >
                        Reference <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
