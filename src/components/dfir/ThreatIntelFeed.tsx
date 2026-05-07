import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { fetchMultipleFeeds, formatRelativeTime, type FeedItem } from '../../services/rssService';
import { defaultFeeds } from '../../data/rssFeeds';

const MAX_ITEMS = 12;
const MAX_PER_SOURCE = 2;

export function ThreatIntelFeed(): JSX.Element {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceCount, setSourceCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resultsMap = await fetchMultipleFeeds(defaultFeeds);
        if (cancelled) return;

        // Group by source, cap each, then flatten
        const all: FeedItem[] = [];
        let activeSources = 0;
        resultsMap.forEach((result) => {
          if (!result.error && result.items.length > 0) {
            activeSources++;
            all.push(...result.items.slice(0, MAX_PER_SOURCE));
          }
        });
        setSourceCount(activeSources);

        all.sort((a, b) => {
          const dateA = new Date(a.pubDate).getTime() || 0;
          const dateB = new Date(b.pubDate).getTime() || 0;
          return dateB - dateA;
        });

        setItems(all.slice(0, MAX_ITEMS));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'feed unavailable');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
      <header className="flex items-baseline justify-between mb-4">
        <h2 className="font-display font-bold text-xl text-slate-900 dark:text-slate-100">Threat Intel</h2>
        <span className="text-xs font-mono text-slate-600 dark:text-slate-400">{sourceCount} sources · live</span>
      </header>

      {loading && <p className="font-mono text-sm text-slate-600 dark:text-slate-400">Fetching…</p>}
      {error && <p className="font-mono text-sm text-rose-600 dark:text-rose-400">error: {error}</p>}

      {!loading && !error && (
        <ul className="space-y-3">
          {items.map((it) => (
            <li
              key={it.guid ?? it.link}
              className="border-t border-slate-200 dark:border-slate-800 pt-3 first:border-t-0 first:pt-0"
            >
              <a href={it.link} target="_blank" rel="noopener noreferrer" className="group block">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100 group-hover:text-brand-600 dark:text-brand-400 transition-colors">
                    {it.title}
                  </h3>
                  <ExternalLink size={12} className="text-slate-500 shrink-0 mt-1" />
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs font-mono text-slate-500">
                  {it.source && <span className="text-brand-600 dark:text-brand-400">{it.source}</span>}
                  {it.pubDate && <span>{formatRelativeTime(it.pubDate)}</span>}
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
