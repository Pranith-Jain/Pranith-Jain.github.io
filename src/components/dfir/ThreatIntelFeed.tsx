import { useEffect, useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { fetchMultipleFeeds, formatRelativeTime, type FeedItem } from '../../services/rssService';
import { defaultFeeds } from '../../data/rssFeeds';
import { extractIndicators, type ExtractedIndicator } from '../../lib/dfir/indicator-client';

const MAX_ITEMS = 12;
const MAX_PER_SOURCE = 2;
const MAX_IOCS_PER_ITEM = 4;

function IocChip({ iocs }: { iocs: ExtractedIndicator[] }): JSX.Element | null {
  if (iocs.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {iocs.map(({ type, value }) => (
        <Link
          key={`${type}:${value}`}
          to={`/dfir/ioc-check?indicator=${encodeURIComponent(value)}`}
          onClick={(e) => e.stopPropagation()}
          title={`Check ${type}: ${value}`}
          className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-brand-500/10 dark:bg-brand-400/10 text-brand-700 dark:text-brand-300 border border-brand-500/30 hover:border-brand-500/60 hover:bg-brand-500/15 transition-colors"
        >
          <span className="uppercase tracking-wider opacity-60">{type}</span>
          <span className="truncate max-w-[180px]">{value}</span>
        </Link>
      ))}
    </div>
  );
}

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

  const itemsWithIocs = useMemo(
    () =>
      items.map((it) => ({
        item: it,
        iocs: extractIndicators(`${it.title} ${it.description ?? ''}`, MAX_IOCS_PER_ITEM),
      })),
    [items]
  );

  const totalIocs = useMemo(() => itemsWithIocs.reduce((sum, x) => sum + x.iocs.length, 0), [itemsWithIocs]);

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
      <header className="flex items-baseline justify-between mb-4">
        <h2 className="font-display font-bold text-xl text-slate-900 dark:text-slate-100">Threat Intel</h2>
        <span className="text-xs font-mono text-slate-600 dark:text-slate-400">
          {sourceCount} sources · {totalIocs > 0 ? `${totalIocs} IOCs found · ` : ''}live
        </span>
      </header>

      {loading && <p className="font-mono text-sm text-slate-600 dark:text-slate-400">Fetching…</p>}
      {error && <p className="font-mono text-sm text-rose-600 dark:text-rose-400">error: {error}</p>}

      {!loading && !error && (
        <ul className="space-y-3">
          {itemsWithIocs.map(({ item: it, iocs }) => (
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
              <IocChip iocs={iocs} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
