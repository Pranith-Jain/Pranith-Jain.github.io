import { memo, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Rss,
  ExternalLink,
  RefreshCw,
  Clock,
  ChevronDown,
  ChevronUp,
  Filter,
  Loader2,
  AlertCircle,
  Globe,
  ShieldAlert,
  Bug,
  Newspaper,
} from 'lucide-react';
import { rssFeeds, feedCategories, defaultFeeds, type RSSFeed } from '../data/rssFeeds';
import {
  fetchMultipleFeeds,
  sortFeedItems,
  formatRelativeTime,
  type FeedItem,
  type FeedResult,
} from '../services/rssService';

interface RSSFeedPanelProps {
  className?: string;
}

const categoryIcons: Record<string, typeof Globe> = {
  vulnerability: ShieldAlert,
  advisory: AlertCircle,
  'threat-intel': Bug,
  news: Newspaper,
  general: Globe,
};

export const RSSFeedPanel = memo(function RSSFeedPanel({ className = '' }: RSSFeedPanelProps) {
  const [feeds, setFeeds] = useState<Map<string, FeedResult>>(new Map());
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [expandedFeeds, setExpandedFeeds] = useState<Set<string>>(new Set());

  const loadFeeds = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const results = await fetchMultipleFeeds(defaultFeeds);
      setFeeds(results);
      setLastRefresh(new Date());
    } catch {
      setError('Failed to load feeds. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFeeds();
  }, [loadFeeds]);

  const toggleFeed = (feedId: string) => {
    setExpandedFeeds((prev) => {
      const next = new Set(prev);
      if (next.has(feedId)) {
        next.delete(feedId);
      } else {
        next.add(feedId);
      }
      return next;
    });
  };

  // Aggregate all items and filter
  const allItems: FeedItem[] = [];
  feeds.forEach((result) => {
    if (!result.error) {
      allItems.push(...result.items);
    }
  });

  const filteredItems = selectedCategory === 'all'
    ? allItems
    : allItems.filter((item) => item.category === selectedCategory);

  const sortedItems = sortFeedItems(filteredItems, { sortBy: 'date', limit: 50 });

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
              Aggregated threat intelligence from trusted sources
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {lastRefresh && (
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={loadFeeds}
            disabled={isLoading}
            className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Category Filter */}
      <div className="flex flex-wrap gap-2">
        {feedCategories.map((cat) => (
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
          </button>
        ))}
      </div>

      {/* Error State */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-rose-600 dark:text-rose-400">{error}</p>
            <p className="text-xs text-rose-500/70 mt-1">
              Some feeds may not be available due to CORS restrictions.
            </p>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
        </div>
      )}

      {/* Feed Items */}
      {!isLoading && (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {sortedItems.length === 0 ? (
              <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                <Rss className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>No items found for the selected category.</p>
              </div>
            ) : (
              sortedItems.map((item, index) => (
                <motion.div
                  key={`${item.source}-${index}`}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: index * 0.03 }}
                  className="p-4 rounded-xl bg-white/40 dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:border-brand-500/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                          {item.source}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {formatRelativeTime(item.pubDate)}
                        </span>
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
              ))
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Feed Sources */}
      <div className="pt-4 border-t border-slate-200 dark:border-white/10">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
          Subscribed Sources
        </h4>
        <div className="flex flex-wrap gap-2">
          {defaultFeeds.map((feedId) => {
            const feed = rssFeeds.find((f) => f.id === feedId);
            if (!feed) return null;
            
            return (
              <a
                key={feed.id}
                href={feed.url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5"
              >
                <Globe className="w-3 h-3" />
                {feed.name}
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
});