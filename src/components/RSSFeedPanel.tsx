import { memo, useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Rss,
  ExternalLink,
  RefreshCw,
  Clock,
  Loader2,
  AlertCircle,
  Globe,
  ShieldAlert,
  Bug,
  Newspaper,
  Filter,
  Info,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { rssFeeds, feedCategories, defaultFeeds, getFeedStats, type RSSFeed } from '../data/rssFeeds';
import {
  fetchMultipleFeeds,
  sortFeedItems,
  formatRelativeTime,
  clearFeedCache,
  type FeedItem,
  type FeedResult,
} from '../services/rssService';

interface RSSFeedPanelProps {
  className?: string;
  maxItems?: number;
  showSourceInfo?: boolean;
}

const categoryIcons: Record<string, typeof Globe> = {
  vulnerability: ShieldAlert,
  advisory: AlertCircle,
  'ics-cert': Bug,
  'threat-intel': Bug,
  news: Newspaper,
  general: Globe,
};

const categoryColors: Record<string, string> = {
  vulnerability: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
  advisory: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  'ics-cert': 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
  'threat-intel': 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
  news: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  general: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20',
};

export const RSSFeedPanel = memo(function RSSFeedPanel({
  className = '',
  maxItems = 50,
  showSourceInfo = true,
}: RSSFeedPanelProps) {
  const [feeds, setFeeds] = useState<Map<string, FeedResult>>(new Map());
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set(defaultFeeds));
  const [showSourceManager, setShowSourceManager] = useState(false);

  const feedStats = useMemo(() => getFeedStats(), []);

  const loadFeeds = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const results = await fetchMultipleFeeds(Array.from(selectedSources));
      setFeeds(results);
      setLastRefresh(new Date());
    } catch {
      setError('Failed to load feeds. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedSources]);

  useEffect(() => {
    loadFeeds();
  }, [loadFeeds]);

  const handleRefresh = useCallback(() => {
    clearFeedCache();
    loadFeeds();
  }, [loadFeeds]);

  const toggleSource = (sourceId: string) => {
    setSelectedSources((prev) => {
      const next = new Set(prev);
      if (next.has(sourceId)) {
        next.delete(sourceId);
      } else {
        next.add(sourceId);
      }
      return next;
    });
  };

  // Aggregate all items and filter
  const allItems: FeedItem[] = useMemo(() => {
    const items: FeedItem[] = [];
    feeds.forEach((result) => {
      if (!result.error && selectedSources.has(result.feed.id)) {
        items.push(...result.items);
      }
    });
    return items;
  }, [feeds, selectedSources]);

  const filteredItems = useMemo(() => {
    const items = selectedCategory === 'all' ? allItems : allItems.filter((item) => item.category === selectedCategory);

    return sortFeedItems(items, { sortBy: 'date', limit: maxItems });
  }, [allItems, selectedCategory, maxItems]);

  // Get feed success/error stats
  const feedStatus = useMemo(() => {
    let success = 0;
    let errors = 0;
    feeds.forEach((result) => {
      if (result.error) {
        errors++;
      } else {
        success++;
      }
    });
    return { success, errors, total: feeds.size };
  }, [feeds]);

  // Group feeds by source for the manager
  const feedsBySource = useMemo(() => {
    const grouped: Record<string, RSSFeed[]> = {};
    feedCategories.slice(1).forEach((cat) => {
      grouped[cat.id] = rssFeeds.filter((f) => f.category === cat.id);
    });
    return grouped;
  }, []);

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-brand-500/10">
            <Rss className="w-5 h-5 text-brand-600 dark:text-brand-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Security RSS Feeds</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Aggregated threat intelligence • {feedStats.total} sources available
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Feed Status */}
          <div className="hidden sm:flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-3 h-3" />
              {feedStatus.success}
            </span>
            {feedStatus.errors > 0 && (
              <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400">
                <XCircle className="w-3 h-3" />
                {feedStatus.errors}
              </span>
            )}
          </div>

          {lastRefresh && (
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {lastRefresh.toLocaleTimeString()}
            </span>
          )}

          <button
            onClick={() => setShowSourceManager(!showSourceManager)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
              showSourceManager
                ? 'bg-brand-600 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            Sources
          </button>

          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Source Manager Panel */}
      <AnimatePresence>
        {showSourceManager && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 rounded-xl bg-white/40 dark:bg-white/5 border border-slate-200 dark:border-white/10">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Manage Feed Sources ({selectedSources.size} selected)
                </h4>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedSources(new Set(defaultFeeds))}
                    className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
                  >
                    Reset to Default
                  </button>
                  <button
                    onClick={() => setSelectedSources(new Set(rssFeeds.map((f) => f.id)))}
                    className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
                  >
                    Select All
                  </button>
                </div>
              </div>

              <div className="space-y-4 max-h-64 overflow-y-auto">
                {Object.entries(feedsBySource).map(([category, feeds]) => (
                  <div key={category}>
                    <h5 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                      {categoryIcons[category] && (
                        <span className="w-4 h-4">
                          {(() => {
                            const Icon = categoryIcons[category];
                            return <Icon className="w-4 h-4" />;
                          })()}
                        </span>
                      )}
                      {feedCategories.find((c) => c.id === category)?.label || category}
                      <span className="text-slate-400 font-normal">
                        ({feeds.filter((f) => selectedSources.has(f.id)).length}/{feeds.length})
                      </span>
                    </h5>
                    <div className="flex flex-wrap gap-2">
                      {feeds.map((feed) => (
                        <button
                          key={feed.id}
                          onClick={() => toggleSource(feed.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 ${
                            selectedSources.has(feed.id)
                              ? 'bg-brand-500/20 text-brand-600 dark:text-brand-400 border border-brand-500/30'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-transparent'
                          }`}
                        >
                          {selectedSources.has(feed.id) ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : (
                            <Globe className="w-3 h-3" />
                          )}
                          {feed.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Category Filter */}
      <div className="flex flex-wrap gap-2">
        {feedCategories.map((cat) => {
          const count =
            cat.id === 'all'
              ? selectedSources.size
              : rssFeeds.filter((f) => f.category === cat.id && selectedSources.has(f.id)).length;

          return (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                selectedCategory === cat.id
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {cat.id !== 'all' && categoryIcons[cat.id] && (
                <span className="w-4 h-4">
                  {(() => {
                    const Icon = categoryIcons[cat.id];
                    return <Icon className="w-3.5 h-3.5" />;
                  })()}
                </span>
              )}
              {cat.label}
              <span
                className={`ml-1 px-1.5 py-0.5 rounded text-[10px] ${
                  selectedCategory === cat.id ? 'bg-white/20' : 'bg-slate-200 dark:bg-slate-700'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Error State */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-rose-600 dark:text-rose-400">{error}</p>
            <p className="text-xs text-rose-500/70 mt-1">
              Some feeds may not be available due to CORS restrictions. Check the console for details.
            </p>
          </div>
        </div>
      )}

      {/* Info Banner */}
      {selectedSources.size > 15 && (
        <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/30 flex items-start gap-2">
          <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700 dark:text-blue-300">
            Loading {selectedSources.size} feeds may take a moment. CORS proxy limitations may affect some sources.
          </p>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-brand-500 animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-500 dark:text-slate-400">Loading security feeds...</p>
          </div>
        </div>
      )}

      {/* Feed Items */}
      {!isLoading && (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {filteredItems.length === 0 ? (
              <div className="text-center py-12 text-slate-500 dark:text-slate-400">
                <Rss className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">No items found</p>
                <p className="text-xs mt-1">
                  {selectedSources.size === 0
                    ? 'Select at least one feed source to see items'
                    : 'Try selecting a different category or refresh the feeds'}
                </p>
              </div>
            ) : (
              <>
                <div className="text-xs text-slate-400 mb-2">
                  Showing {filteredItems.length} of {allItems.length} items
                </div>
                {filteredItems.map((item, index) => (
                  <motion.div
                    key={`${item.source}-${index}`}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: Math.min(index * 0.02, 0.5) }}
                    className="p-4 rounded-xl bg-white/40 dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:border-brand-500/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${categoryColors[item.category] || categoryColors.general}`}
                          >
                            {item.source}
                          </span>
                          <span className="text-[10px] text-slate-400">{formatRelativeTime(item.pubDate)}</span>
                        </div>
                        <a
                          href={item.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-semibold text-slate-900 dark:text-white hover:text-brand-600 dark:hover:text-brand-400 transition-colors line-clamp-2"
                        >
                          {item.title}
                        </a>
                        {item.description && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                            {item.description}
                          </p>
                        )}
                      </div>
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                        aria-label="Open article"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  </motion.div>
                ))}
              </>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Feed Sources */}
      {showSourceInfo && (
        <div className="pt-4 border-t border-slate-200 dark:border-white/10">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
            <Globe className="w-3 h-3" />
            Active Sources ({selectedSources.size})
          </h4>
          <div className="flex flex-wrap gap-2">
            {Array.from(selectedSources).map((feedId) => {
              const feed = rssFeeds.find((f) => f.id === feedId);
              if (!feed) return null;

              const result = feeds.get(feedId);
              const hasError = result?.error;

              return (
                <a
                  key={feed.id}
                  href={feed.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                    hasError
                      ? 'bg-rose-100 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 hover:bg-rose-200 dark:hover:bg-rose-900/30'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                  title={hasError ? `Error: ${result?.error}` : feed.description}
                >
                  {hasError ? <XCircle className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
                  {feed.name}
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});
