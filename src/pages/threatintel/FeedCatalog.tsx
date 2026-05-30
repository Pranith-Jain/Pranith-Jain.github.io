import { useState, useEffect } from 'react';
import { Search, ExternalLink, Shield, Globe, Hash, Fingerprint, FileText, AlertTriangle, Filter } from 'lucide-react';

interface FeedCatalogEntry {
  vendor: string;
  description: string;
  category: string;
  url: string;
  raw_url: string;
  status: string;
}

interface FeedCatalogResponse {
  total: number;
  active: number;
  vendors: string[];
  categories: string[];
  entries: FeedCatalogEntry[];
}

const CATEGORY_ICONS: Record<string, typeof Shield> = {
  IP: Shield,
  DNS: Globe,
  URL: Globe,
  MD5: Hash,
  SHA1: Hash,
  SHA256: Hash,
  CVEID: FileText,
  SSL: Fingerprint,
  JA3: Fingerprint,
};

const CATEGORY_COLORS: Record<string, string> = {
  IP: 'text-red-400 border-red-500/30 bg-red-500/10',
  DNS: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10',
  URL: 'text-purple-400 border-purple-500/30 bg-purple-500/10',
  MD5: 'text-orange-400 border-orange-500/30 bg-orange-500/10',
  SHA1: 'text-orange-400 border-orange-500/30 bg-orange-500/10',
  SHA256: 'text-orange-400 border-orange-500/30 bg-orange-500/10',
  CVEID: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10',
  SSL: 'text-green-400 border-green-500/30 bg-green-500/10',
  JA3: 'text-pink-400 border-pink-500/30 bg-pink-500/10',
};

export default function FeedCatalog() {
  const [data, setData] = useState<FeedCatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [vendorFilter, setVendorFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    fetch('/api/v1/feed-catalog')
      .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then((d: FeedCatalogResponse) => {
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(String(e));
        setLoading(false);
      });
  }, []);

  const filtered = data?.entries.filter((e) => {
    if (vendorFilter !== 'all' && e.vendor !== vendorFilter) return false;
    if (categoryFilter !== 'all' && e.category !== categoryFilter) return false;
    if (statusFilter !== 'all' && e.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !e.vendor.toLowerCase().includes(q) &&
        !e.description.toLowerCase().includes(q) &&
        !e.category.toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-pulse text-gray-400">Loading feed catalog...</div>
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
        <h1 className="text-3xl font-bold text-white mb-2">Open-Source Threat Intel Feed Catalog</h1>
        <p className="text-gray-400">
          {data?.active ?? 0} active feeds out of {data?.total ?? 0} total, from {data?.vendors.length ?? 0} vendors
        </p>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search vendors, descriptions, categories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>
        <select
          value={vendorFilter}
          onChange={(e) => setVendorFilter(e.target.value)}
          className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 focus:outline-none focus:border-blue-500"
        >
          <option value="all">All Vendors</option>
          {data?.vendors.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 focus:outline-none focus:border-blue-500"
        >
          <option value="all">All Types</option>
          {data?.categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 focus:outline-none focus:border-blue-500"
        >
          <option value="all">All Status</option>
          <option value="Active">Active</option>
          <option value="Offline">Offline</option>
        </select>
      </div>

      <div className="flex items-center gap-2 mb-4 text-sm text-gray-500">
        <Filter className="w-4 h-4" />
        <span>
          {filtered?.length ?? 0} feed{filtered?.length !== 1 ? 's' : ''} shown
        </span>
      </div>

      <div className="space-y-3">
        {filtered?.map((entry, i) => {
          const Icon = CATEGORY_ICONS[entry.category] ?? FileText;
          const color = CATEGORY_COLORS[entry.category] ?? 'text-gray-400 border-gray-500/30 bg-gray-500/10';
          return (
            <div
              key={`${entry.vendor}-${entry.category}-${i}`}
              className="bg-gray-900/60 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors"
            >
              <div className="flex items-start gap-4">
                <div className={`p-2.5 rounded-lg ${color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">{entry.vendor}</span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            entry.status === 'Active'
                              ? 'bg-green-900/50 text-green-400 border border-green-700'
                              : 'bg-red-900/50 text-red-400 border border-red-700'
                          }`}
                        >
                          {entry.status}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700 uppercase">
                          {entry.category}
                        </span>
                      </div>
                      <p className="text-gray-400 text-sm mt-1">{entry.description}</p>
                    </div>
                    <a
                      href={entry.raw_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-500 hover:text-gray-300 shrink-0 mt-1"
                      title="Open feed URL"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                  <div className="mt-2">
                    <code className="text-xs text-gray-600 font-mono break-all">{entry.url}</code>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
