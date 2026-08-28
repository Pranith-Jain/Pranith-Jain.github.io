import { useState, useMemo } from 'react';
import { ExternalLink, Filter, RefreshCw, Search } from 'lucide-react';
import { useDataFetch } from '../../hooks/useDataFetch';
import { DataState } from '../../components/DataState';
import { relativeAgo } from '../../lib/relativeTime';
import { AiSummaryCard } from '../../components/intel/AiSummaryCard';
import { PostAnalysisButton } from '../../components/threatintel/PostAnalysisButton';

interface NewsItem {
  title: string;
  link: string;
  description: string;
  pub_date: string;
  source: string;
  tier: number;
  image_url?: string;
}

interface NewsResult {
  last_updated: string;
  total: number;
  articles: NewsItem[];
}

const TIER_LABELS: Record<number, { label: string; color: string }> = {
  1: {
    label: 'Advisory',
    color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 border-rose-200 dark:border-rose-800',
  },
  2: {
    label: 'Exploit',
    color:
      'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200 dark:border-orange-800',
  },
  3: {
    label: 'Research',
    color: 'bg-blue-100 text-brand-700 dark:bg-blue-900/30 dark:text-brand-400 border-blue-200 dark:border-blue-800',
  },
  4: {
    label: 'Vendor',
    color:
      'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border-purple-200 dark:border-purple-800',
  },
  5: {
    label: 'Community',
    color:
      'bg-slate-100 text-slate-700 dark:bg-[rgb(var(--surface-300))] dark:text-slate-300 border-slate-200 dark:border-[rgb(var(--border-400))]',
  },
};

export default function CyberNewsFeed(): JSX.Element {
  const [activeTier, setActiveTier] = useState<number | null>(null);
  const [query, setQuery] = useState('');

  const params = new URLSearchParams({ limit: '100' });
  if (activeTier) params.set('tier', String(activeTier));
  const url = `/api/v1/cyber-news?${params}`;

  const { data, loading, error, refetch } = useDataFetch<NewsResult>({ url, ttl: 300_000 });

  const filtered = useMemo(
    () =>
      data?.articles.filter(
        (a) =>
          !query ||
          a.title.toLowerCase().includes(query.toLowerCase()) ||
          a.description.toLowerCase().includes(query.toLowerCase())
      ),
    [data, query]
  );

  // Items shaped for the AI summary card — title + body + source, capped at
  // 30 so the summariser stays inside the model context budget (matches the
  // ThreatSignalRss / AlertFeed pattern).
  const summaryItems = useMemo(
    () =>
      (filtered ?? []).slice(0, 30).map((a) => ({
        title: a.title,
        body: a.description,
        source: a.source,
      })),
    [filtered]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <input
            type="text"
            placeholder="Filter articles..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-300 dark:border-[rgb(var(--border-400))] rounded-xl text-sm"
          />
        </div>
        <button
          type="button"
          onClick={refetch}
          disabled={loading}
          className="px-3 py-2 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-300 dark:border-[rgb(var(--border-400))] rounded-xl text-sm flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-300))] transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setActiveTier(null)}
          className={`px-2.5 py-1 rounded-xl text-xs font-medium border transition-colors ${
            activeTier === null
              ? 'bg-rose-600 text-white border-rose-600'
              : 'border-slate-200 dark:border-[rgb(var(--border-400))] text-body hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-300))]'
          }`}
        >
          <Filter className="h-3 w-3 inline mr-1" />
          All Tiers
        </button>
        {Object.entries(TIER_LABELS).map(([tier, { label, color }]) => (
          <button
            type="button"
            key={tier}
            onClick={() => setActiveTier(activeTier === Number(tier) ? null : Number(tier))}
            className={`px-2.5 py-1 rounded-xl text-xs font-medium border transition-colors ${
              activeTier === Number(tier) ? 'bg-rose-600 text-white border-rose-600' : color
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <DataState
        loading={loading}
        error={error}
        empty={filtered?.length === 0}
        emptyLabel="No articles found."
        onRetry={refetch}
      >
        {data && (
          <>
            {/* AI summary of the visible news cut. Public surface so every
                visitor sees the analyst take on the prioritised articles. */}
            {summaryItems.length > 0 && (
              <AiSummaryCard surface="Cyber Security News" items={summaryItems} requireAdmin={false} className="mb-4" />
            )}
            <div className="text-xs text-muted">
              {filtered?.length ?? 0} articles - updated {relativeAgo(data.last_updated)}
            </div>
            <div className="space-y-2">
              {filtered?.map((article, i) => {
                const tier = (TIER_LABELS[article.tier] ?? TIER_LABELS[5])!;
                return (
                  <div
                    key={`${article.link}-${i}`}
                    className="block p-3 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-xl hover:border-rose-300 dark:hover:border-rose-600 transition-colors group"
                  >
                    <div className="flex items-start gap-3">
                      {article.image_url && (
                        <img
                          loading="lazy"
                          src={article.image_url}
                          alt=""
                          className="w-16 h-12 object-cover rounded-xl flex-shrink-0 hidden sm:block"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-1.5 py-0.5 text-micro font-medium rounded border ${tier.color}`}>
                            {tier.label}
                          </span>
                          <span className="text-mini text-muted">{article.source}</span>
                          {article.pub_date && (
                            <span className="text-mini text-muted">{relativeAgo(article.pub_date)}</span>
                          )}
                          <PostAnalysisButton
                            title={article.title}
                            description={article.description}
                            source={article.source}
                            link={article.link}
                            compact
                          />
                        </div>
                        <h3 className="text-sm font-medium text-slate-900 dark:text-white group-hover:text-rose-600 dark:group-hover:text-rose-400 line-clamp-2 flex items-center gap-1">
                          <a
                            href={article.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1"
                          >
                            {article.title}
                            <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 flex-shrink-0" />
                          </a>
                        </h3>
                        {article.description && (
                          <p className="text-xs text-muted mt-1 line-clamp-2">{article.description}</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </DataState>
    </div>
  );
}
