import { useState, useEffect } from 'react';
import { Search, ExternalLink, Shield, Globe, Hash, Fingerprint, FileText, Filter } from 'lucide-react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { sanitizeUrl } from '../../lib/sanitize-url';

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
  IP: 'text-red-600 dark:text-red-400 border-red-500/30 bg-red-100 dark:bg-red-500/10',
  DNS: 'text-cyan-600 dark:text-cyan-400 border-cyan-500/30 bg-cyan-100 dark:bg-cyan-500/10',
  URL: 'text-purple-600 dark:text-purple-400 border-purple-500/30 bg-purple-100 dark:bg-purple-500/10',
  MD5: 'text-orange-600 dark:text-orange-400 border-orange-500/30 bg-orange-100 dark:bg-orange-500/10',
  SHA1: 'text-orange-600 dark:text-orange-400 border-orange-500/30 bg-orange-100 dark:bg-orange-500/10',
  SHA256: 'text-orange-600 dark:text-orange-400 border-orange-500/30 bg-orange-100 dark:bg-orange-500/10',
  CVEID: 'text-yellow-600 dark:text-yellow-400 border-yellow-500/30 bg-yellow-100 dark:bg-yellow-500/10',
  SSL: 'text-green-600 dark:text-green-400 border-green-500/30 bg-green-100 dark:bg-green-500/10',
  JA3: 'text-pink-600 dark:text-pink-400 border-pink-500/30 bg-pink-100 dark:bg-pink-500/10',
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

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Shield size={28} />}
      title="Open-Source Threat Intel Feed Catalog"
      description={
        <>
          {data?.active ?? 0} active feeds out of {data?.total ?? 0} total, from {data?.vendors.length ?? 0} vendors
        </>
      }
      maxWidthClass="max-w-6xl"
      loading={loading}
      error={error}
      headerExtra={
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Search vendors, descriptions, categories..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-brand-500"
            />
          </div>
          <select
            value={vendorFilter}
            onChange={(e) => setVendorFilter(e.target.value)}
            className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-200 focus:outline-none focus:border-brand-500"
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
            className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-200 focus:outline-none focus:border-brand-500"
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
            className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-200 focus:outline-none focus:border-brand-500"
          >
            <option value="all">All Status</option>
            <option value="Active">Active</option>
            <option value="Offline">Offline</option>
          </select>
        </div>
      }
    >
      <div className="flex items-center gap-2 mb-4 text-sm text-slate-500">
        <Filter className="w-4 h-4" />
        <span>
          {filtered?.length ?? 0} feed{filtered?.length !== 1 ? 's' : ''} shown
        </span>
      </div>

      <div className="space-y-3">
        {filtered?.map((entry, i) => {
          const Icon = CATEGORY_ICONS[entry.category] ?? FileText;
          const color =
            CATEGORY_COLORS[entry.category] ??
            'text-slate-500 dark:text-slate-400 border-slate-500/30 bg-slate-100 dark:bg-slate-500/10';
          return (
            <div
              key={`${entry.vendor}-${entry.category}-${i}`}
              className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl p-4 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
            >
              <div className="flex items-start gap-4">
                <div className={`p-2.5 rounded-lg ${color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{entry.vendor}</span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            entry.status === 'Active'
                              ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400 border border-green-300 dark:border-green-700'
                              : 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400 border border-red-300 dark:border-red-700'
                          }`}
                        >
                          {entry.status}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-muted border border-slate-200 dark:border-slate-700 uppercase">
                          {entry.category}
                        </span>
                      </div>
                      <p className="text-muted text-sm mt-1">{entry.description}</p>
                    </div>
                    <a
                      href={sanitizeUrl(entry.raw_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 shrink-0 mt-1"
                      title="Open feed URL"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                  <div className="mt-2">
                    <code className="text-xs text-slate-400 dark:text-slate-600 font-mono break-all">{entry.url}</code>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </DataPageLayout>
  );
}
