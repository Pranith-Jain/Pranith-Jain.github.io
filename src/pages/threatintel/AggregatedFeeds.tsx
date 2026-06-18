import { useState, useEffect, useCallback } from 'react';
import { Shield, Server, Search, Bug, Globe, Database, ExternalLink } from 'lucide-react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { sanitizeUrl } from '../../lib/sanitize-url';

interface AggregatedFeed {
  id: string;
  name: string;
  url: string;
  category: 'c2' | 'blocklist' | 'scanner' | 'malware' | 'tor' | 'collected';
  description: string;
  size_bytes: number | null;
  ioc_count: number | null;
  sample_entries: string[];
  fetch_ok: boolean;
}

interface AggregatedFeedsResponse {
  total_feeds: number;
  feeds_ok: number;
  categories: Record<string, number>;
  feeds: AggregatedFeed[];
}

const CATEGORY_META: Record<string, { label: string; icon: typeof Shield; color: string }> = {
  c2: {
    label: 'C2 Infrastructure',
    icon: Server,
    color: 'text-red-600 dark:text-red-500 border-red-500/30 bg-red-100 dark:bg-red-500/10',
  },
  blocklist: {
    label: 'IP Blocklists',
    icon: Shield,
    color: 'text-orange-600 dark:text-orange-500 border-orange-500/30 bg-orange-100 dark:bg-orange-500/10',
  },
  scanner: {
    label: 'Scanners',
    icon: Search,
    color: 'text-yellow-600 dark:text-yellow-500 border-yellow-500/30 bg-yellow-100 dark:bg-yellow-500/10',
  },
  malware: {
    label: 'Malware IOCs',
    icon: Bug,
    color: 'text-purple-600 dark:text-purple-500 border-purple-500/30 bg-purple-100 dark:bg-purple-500/10',
  },
  tor: {
    label: 'Tor Network',
    icon: Globe,
    color: 'text-cyan-600 dark:text-cyan-500 border-cyan-500/30 bg-cyan-100 dark:bg-cyan-500/10',
  },
  collected: {
    label: 'Collected IOCs',
    icon: Database,
    color: 'text-blue-600 dark:text-blue-500 border-blue-500/30 bg-blue-100 dark:bg-blue-500/10',
  },
};

function formatBytes(b: number | null): string {
  if (b === null) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function formatCount(n: number | null): string {
  if (n === null) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export default function AggregatedFeeds() {
  const [data, setData] = useState<AggregatedFeedsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch('/api/v1/aggregated-feeds')
      .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then((d: AggregatedFeedsResponse) => {
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(String(e));
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredFeeds = data?.feeds.filter((f) => {
    if (categoryFilter !== 'all' && f.category !== categoryFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!f.name.toLowerCase().includes(q) && !f.description.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const headerExtra = (
    <div className="flex flex-wrap gap-3">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
        <input
          type="text"
          placeholder="Search feeds..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-brand-500"
        />
      </div>
      <select
        value={categoryFilter}
        onChange={(e) => setCategoryFilter(e.target.value)}
        className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-200 focus:outline-none focus:border-brand-500"
      >
        <option value="all">All Categories</option>
        {Object.entries(CATEGORY_META).map(([key, meta]) => (
          <option key={key} value={key}>
            {meta.label} ({data?.categories[key] ?? 0})
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Database className="w-7 h-7" />}
      title="Aggregated Intelligence Feeds"
      description={`Live feed data from CriticalPathSecurity Public-Intelligence-Feeds — ${data?.feeds_ok ?? 0} of ${data?.total_feeds ?? 0} feeds available`}
      headerExtra={data ? headerExtra : undefined}
      loading={loading}
      error={error ? `Failed to load: ${error}` : null}
      onRetry={load}
      empty={!loading && !error && (filteredFeeds?.length ?? 0) === 0}
      emptyMessage="No feeds match the current filters."
      maxWidthClass="max-w-6xl"
    >
      <div className="grid gap-4">
        {filteredFeeds?.map((feed) => {
          const meta = CATEGORY_META[feed.category] ?? CATEGORY_META.collected;
          const Icon = meta.icon;
          return (
            <div
              key={feed.id}
              className={`rounded-xl border p-5 transition-colors ${
                feed.fetch_ok
                  ? 'bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  : 'bg-slate-50 dark:bg-slate-900/30 border-red-200 dark:border-red-900/30 opacity-60'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-lg ${meta.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-semibold text-lg">{feed.name}</h3>
                      <p className="text-muted text-sm mt-0.5">{feed.description}</p>
                    </div>
                    <a
                      href={sanitizeUrl(feed.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 shrink-0 mt-1"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>

                  <div className="flex flex-wrap gap-4 mt-3 text-sm">
                    <span
                      className={
                        feed.fetch_ok ? 'text-slate-700 dark:text-slate-300' : 'text-red-600 dark:text-red-400'
                      }
                    >
                      <span className="text-slate-400 dark:text-slate-500">IOCs:</span>{' '}
                      <strong>{feed.fetch_ok ? formatCount(feed.ioc_count) : 'unreachable'}</strong>
                    </span>
                    <span className="text-slate-700 dark:text-slate-300">
                      <span className="text-slate-400 dark:text-slate-500">Size:</span>{' '}
                      <strong>{formatBytes(feed.size_bytes)}</strong>
                    </span>
                    <span className="text-muted text-xs capitalize px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                      {meta.label}
                    </span>
                  </div>

                  {feed.fetch_ok && feed.sample_entries.length > 0 && (
                    <div className="mt-3">
                      <details className="text-sm">
                        <summary className="text-slate-400 dark:text-slate-500 cursor-pointer hover:text-slate-600 dark:hover:text-slate-300">
                          Sample entries ({feed.sample_entries.length})
                        </summary>
                        <div className="mt-2 space-y-1">
                          {feed.sample_entries.map((entry, i) => (
                            <code
                              key={i}
                              className="block px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded text-slate-700 dark:text-slate-300 text-xs font-mono"
                            >
                              {entry}
                            </code>
                          ))}
                        </div>
                      </details>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </DataPageLayout>
  );
}
