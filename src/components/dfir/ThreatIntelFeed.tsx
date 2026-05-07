import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { fetchMultipleFeeds, formatRelativeTime, type FeedItem } from '../../services/rssService';
import { defaultFeeds } from '../../data/rssFeeds';

const MAX_ITEMS = 8;

export function ThreatIntelFeed(): JSX.Element {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // fetchMultipleFeeds takes feed IDs; use a curated subset
        const feedIds = defaultFeeds.slice(0, 5);
        const resultsMap = await fetchMultipleFeeds(feedIds);
        if (cancelled) return;

        // Flatten all items from the Map, sort by date, cap at MAX_ITEMS
        const all: FeedItem[] = [];
        resultsMap.forEach((result) => {
          if (!result.error) {
            all.push(...result.items);
          }
        });

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
    <section className="rounded-2xl border border-[#1f1f23] bg-[#111113] p-6">
      <header className="flex items-baseline justify-between mb-4">
        <h2 className="font-display font-bold text-xl text-[#fafafa]">Threat Intel</h2>
        <span className="text-xs font-mono text-[#a1a1aa]">live · curated feeds</span>
      </header>

      {loading && <p className="font-mono text-sm text-[#a1a1aa]">Fetching…</p>}
      {error && <p className="font-mono text-sm text-[#ef4444]">error: {error}</p>}

      {!loading && !error && (
        <ul className="space-y-3">
          {items.map((it) => (
            <li key={it.guid ?? it.link} className="border-t border-[#1f1f23] pt-3 first:border-t-0 first:pt-0">
              <a href={it.link} target="_blank" rel="noopener noreferrer" className="group block">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-semibold text-[#fafafa] group-hover:text-[#00fff9] transition-colors">
                    {it.title}
                  </h3>
                  <ExternalLink size={12} className="text-[#71717a] shrink-0 mt-1" />
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs font-mono text-[#71717a]">
                  {it.source && <span>{it.source}</span>}
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
