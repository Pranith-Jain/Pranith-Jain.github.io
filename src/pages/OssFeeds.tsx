import { useState } from 'react';
import { useDataFetch } from '../hooks/useDataFetch';
import { DataPageLayout } from '../components/DataPageLayout';
import { Search as SearchIcon, Globe, Database, ExternalLink, Activity } from 'lucide-react';

interface OssFeedsIndex {
  counts: { total: number; byCategory: Record<string, number>; byStatus: Record<string, number> };
  categories: Array<{ category: string; count: number; slug: string }>;
  source: string;
  lastSyncedAt: string | null;
}

interface FeedEntry {
  vendor: string;
  description: string;
  category: string;
  feedStatus: string;
}

interface CategoryBody {
  category: string;
  count: number;
  feeds: Array<{
    vendor: string;
    description: string;
    category: string;
    url: string;
    feedStatus: string;
  }>;
}

const CATEGORY_COLORS: Record<string, string> = {
  IP: 'text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800',
  DNS: 'text-sky-600 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40 border-sky-300 dark:border-sky-800',
  URL: 'text-violet-600 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/40 border-violet-300 dark:border-violet-800',
  MD5: 'text-amber-600 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800',
  SHA1: 'text-orange-600 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/40 border-orange-300 dark:border-orange-800',
  SHA256:
    'text-orange-600 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/40 border-orange-300 dark:border-orange-800',
  CVEID:
    'text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-800',
};

function catColor(category: string): string {
  return (
    CATEGORY_COLORS[category] ??
    'text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-950/40 border-slate-300 dark:border-slate-700'
  );
}

export default function OssFeeds() {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const { data: index, loading, error } = useDataFetch<OssFeedsIndex>({ url: '/api/v1/oss-feeds/', ttl: 120_000 });

  const { data: feedsData } = useDataFetch<{ total: number; returned: number; feeds: FeedEntry[] }>({
    url: `/api/v1/oss-feeds/feeds?${new URLSearchParams({
      ...(searchTerm ? { q: searchTerm } : {}),
      ...(categoryFilter ? { category: categoryFilter } : {}),
      limit: '200',
    }).toString()}`,
    ttl: 30_000,
  });

  const { data: categoryDetail } = useDataFetch<CategoryBody>({
    url: selectedCategory ? `/api/v1/oss-feeds/categories/${encodeURIComponent(selectedCategory)}` : null,
    ttl: 120_000,
  });

  const feeds = feedsData?.feeds ?? [];

  return (
    <DataPageLayout
      backTo="/dfir"
      backLabel="DFIR"
      icon={<Database />}
      title="OSS Feed Registry"
      description="Curated catalog of free open-source threat intel feeds"
    >
      <div className="mb-6 space-y-4">
        {loading && (
          <div className="grid grid-cols-3 gap-4">
            {['Total Feeds', 'Categories', 'Active'].map((label) => (
              <div key={label} className="h-20 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
            ))}
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            Failed to load OSS Feed Registry: <span className="font-mono">{error}</span>
          </div>
        )}
        {!loading && !error && index && (
          <div className="grid grid-cols-4 gap-4">
            <div className="rounded-lg border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white/60 dark:bg-[rgb(var(--card-bg))]/60 px-4 py-3">
              <div className="text-xs font-medium uppercase tracking-wider text-muted">Total Feeds</div>
              <div className="mt-1 text-2xl font-semibold">{index.counts.total}</div>
            </div>
            <div className="rounded-lg border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white/60 dark:bg-[rgb(var(--card-bg))]/60 px-4 py-3">
              <div className="text-xs font-medium uppercase tracking-wider text-muted">Categories</div>
              <div className="mt-1 text-2xl font-semibold">{index.categories.length}</div>
            </div>
            <div className="rounded-lg border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white/60 dark:bg-[rgb(var(--card-bg))]/60 px-4 py-3">
              <div className="text-xs font-medium uppercase tracking-wider text-muted">Active</div>
              <div className="mt-1 text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
                {index.counts.byStatus.Active ?? 0}
              </div>
            </div>
            <div className="rounded-lg border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white/60 dark:bg-[rgb(var(--card-bg))]/60 px-4 py-3">
              <div className="text-xs font-medium uppercase tracking-wider text-muted">Offline</div>
              <div className="mt-1 text-2xl font-semibold text-rose-600 dark:text-rose-400">
                {index.counts.byStatus.Offline ?? 0}
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search feeds by vendor, description, category..."
              className="w-full rounded-lg border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white/60 dark:bg-[rgb(var(--card-bg))]/60 py-2 pl-9 pr-3 text-sm"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-lg border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white/60 dark:bg-[rgb(var(--card-bg))]/60 px-3 py-2 text-sm"
          >
            <option value="">All Categories</option>
            {index?.categories
              .sort((a, b) => b.count - a.count)
              .map((c) => (
                <option key={c.category} value={c.category}>
                  {c.category} ({c.count})
                </option>
              ))}
          </select>
        </div>

        {index && (
          <div className="flex flex-wrap gap-2">
            {index.categories
              .sort((a, b) => b.count - a.count)
              .map((cat) => (
                <button
                  key={cat.category}
                  onClick={() => setSelectedCategory(selectedCategory === cat.slug ? null : cat.slug)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${catColor(cat.category)} ${selectedCategory === cat.slug ? 'ring-2 ring-offset-1' : ''}`}
                >
                  {cat.category} ({cat.count})
                </button>
              ))}
          </div>
        )}
      </div>

      {selectedCategory && categoryDetail && (
        <div className="mb-6 rounded-lg border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white/60 dark:bg-[rgb(var(--card-bg))]/60 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold">
              {categoryDetail.category} Feeds ({categoryDetail.count})
            </span>
            <button onClick={() => setSelectedCategory(null)} className="text-xs text-muted hover:text-foreground">
              Close
            </button>
          </div>
          <div className="space-y-2">
            {categoryDetail.feeds.map((feed, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg bg-slate-50 dark:bg-slate-900/50 p-2.5 text-xs">
                <Globe size={12} className="mt-0.5 shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{feed.vendor}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-micro font-medium ${feed.feedStatus === 'Active' ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40' : 'text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40'}`}
                    >
                      {feed.feedStatus}
                    </span>
                  </div>
                  <p className="mt-0.5 text-muted line-clamp-1">{feed.description}</p>
                  <a
                    href={feed.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-0.5 inline-flex items-center gap-1 font-mono text-micro text-brand-600 dark:text-brand-400 hover:underline break-all"
                  >
                    {feed.url}
                    <ExternalLink size={10} />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {feeds.length === 0 && !loading && (
          <div className="rounded-lg border border-dashed border-slate-300 dark:border-[rgb(var(--border-400))] p-8 text-center text-sm text-muted">
            {searchTerm || categoryFilter ? 'No feeds match your filters.' : 'No feeds found. Ensure data is built.'}
          </div>
        )}

        {feeds.map((feed, i) => (
          <div
            key={i}
            className="rounded-lg border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white/60 dark:bg-[rgb(var(--card-bg))]/60 px-4 py-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{feed.vendor}</span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-micro font-medium uppercase tracking-wider ${catColor(feed.category)}`}
                  >
                    {feed.category}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-micro font-medium ${feed.feedStatus === 'Active' ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40' : 'text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40'}`}
                  >
                    {feed.feedStatus}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted line-clamp-2">{feed.description}</p>
              </div>
              <Activity
                size={14}
                className={`mt-1 shrink-0 ${feed.feedStatus === 'Active' ? 'text-emerald-400' : 'text-rose-400'}`}
              />
            </div>
          </div>
        ))}
      </div>
    </DataPageLayout>
  );
}
