import { useState, useEffect } from 'react';
import { Shield, Server, Search, Bug, Globe, Database, ExternalLink, AlertTriangle } from 'lucide-react';

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
  c2: { label: 'C2 Infrastructure', icon: Server, color: 'text-red-500 border-red-500/30 bg-red-500/10' },
  blocklist: { label: 'IP Blocklists', icon: Shield, color: 'text-orange-500 border-orange-500/30 bg-orange-500/10' },
  scanner: { label: 'Scanners', icon: Search, color: 'text-yellow-500 border-yellow-500/30 bg-yellow-500/10' },
  malware: { label: 'Malware IOCs', icon: Bug, color: 'text-purple-500 border-purple-500/30 bg-purple-500/10' },
  tor: { label: 'Tor Network', icon: Globe, color: 'text-cyan-500 border-cyan-500/30 bg-cyan-500/10' },
  collected: { label: 'Collected IOCs', icon: Database, color: 'text-blue-500 border-blue-500/30 bg-blue-500/10' },
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

  useEffect(() => {
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

  const filteredFeeds = data?.feeds.filter((f) => {
    if (categoryFilter !== 'all' && f.category !== categoryFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!f.name.toLowerCase().includes(q) && !f.description.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-pulse text-gray-400">Loading feeds...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center gap-3 text-red-400">
        <AlertTriangle className="w-6 h-6" />
        <span>Failed to load: {error}</span>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Aggregated Intelligence Feeds</h1>
        <p className="text-gray-400">
          Live feed data from CriticalPathSecurity Public-Intelligence-Feeds — {data?.feeds_ok ?? 0} of{' '}
          {data?.total_feeds ?? 0} feeds available
        </p>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search feeds..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 focus:outline-none focus:border-blue-500"
        >
          <option value="all">All Categories</option>
          {Object.entries(CATEGORY_META).map(([key, meta]) => (
            <option key={key} value={key}>
              {meta.label} ({data?.categories[key] ?? 0})
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4">
        {filteredFeeds?.map((feed) => {
          const meta = CATEGORY_META[feed.category] ?? CATEGORY_META.collected;
          const Icon = meta.icon;
          return (
            <div
              key={feed.id}
              className={`rounded-xl border p-5 transition-colors ${
                feed.fetch_ok
                  ? 'bg-gray-900/60 border-gray-800 hover:border-gray-700'
                  : 'bg-gray-900/30 border-red-900/30 opacity-60'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-lg ${meta.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-semibold text-white text-lg">{feed.name}</h3>
                      <p className="text-gray-400 text-sm mt-0.5">{feed.description}</p>
                    </div>
                    <a
                      href={feed.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-500 hover:text-gray-300 shrink-0 mt-1"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>

                  <div className="flex flex-wrap gap-4 mt-3 text-sm">
                    <span className={feed.fetch_ok ? 'text-gray-300' : 'text-red-400'}>
                      <span className="text-gray-500">IOCs:</span>{' '}
                      <strong>{feed.fetch_ok ? formatCount(feed.ioc_count) : 'unreachable'}</strong>
                    </span>
                    <span className="text-gray-300">
                      <span className="text-gray-500">Size:</span> <strong>{formatBytes(feed.size_bytes)}</strong>
                    </span>
                    <span className="text-gray-400 text-xs capitalize px-2 py-0.5 rounded-full bg-gray-800 border border-gray-700">
                      {meta.label}
                    </span>
                  </div>

                  {feed.fetch_ok && feed.sample_entries.length > 0 && (
                    <div className="mt-3">
                      <details className="text-sm">
                        <summary className="text-gray-500 cursor-pointer hover:text-gray-300">
                          Sample entries ({feed.sample_entries.length})
                        </summary>
                        <div className="mt-2 space-y-1">
                          {feed.sample_entries.map((entry, i) => (
                            <code
                              key={i}
                              className="block px-3 py-1 bg-gray-800 rounded text-gray-300 text-xs font-mono"
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
    </div>
  );
}
