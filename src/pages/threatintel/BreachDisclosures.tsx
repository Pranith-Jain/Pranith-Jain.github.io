import { useEffect, useState } from 'react';
import { sanitizeUrl } from '../../lib/sanitize-url';
import { ExternalLink, Loader2, Newspaper, RefreshCw, ShieldAlert } from 'lucide-react';
import { BreachDisclosuresPanel } from '../dfir/DarkWeb';
import { BreachDatabasesPanel } from '../../components/dfir/BreachDatabasesPanel';
import { MtiLeaksPanel } from '../../components/threatintel/MtiLeaksPanel';
import { fetchAggregatedFeed, formatRelativeTime, type AggregatedFeedItem } from '../../services/rssService';
import { LiveFreshnessPill } from '../../components/LiveFreshnessPill';
import { DataPageLayout } from '../../components/DataPageLayout';

/**
 * Feed IDs — strictly breach-focused. Krebs / BleepingComputer cover
 * general security news; they're included on /threatintel/threat-feeds
 * already, so we keep them OUT of this page so the feed stays clean
 * "incident disclosure" signal.
 */
const BREACH_NEWS_FEED_IDS = [
  'databreaches',
  'threatpost',
  'cybernews',
  'grahamcluley',
  'bleepingcomputer-breaches',
  'hackread-breaches',
  'securityweek-breaches',
  'cyberscoop-breaches',
  'vpnmentor-research',
  'grcsolutions-breaches',
  'comparitech-breaches',
  'idtheftcenter',
];

/**
 * Live breach disclosures page. Thin wrapper around the
 * `BreachDisclosuresPanel` widget that also lives on the unified
 * /threatintel/darkweb view — same data (Have I Been Pwned public breach
 * corpus via /api/v1/breach-disclosures), presented standalone so each
 * surface has its own focused entry point.
 */
export default function BreachDisclosures(): JSX.Element {
  const [news, setNews] = useState<AggregatedFeedItem[] | null>(null);
  const [newsLoading, setNewsLoading] = useState(true);
  const [newsError, setNewsError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setNewsLoading(true);
    setNewsError(null);
    fetchAggregatedFeed(BREACH_NEWS_FEED_IDS, { limit: 40, perSource: 8 })
      .then((res) => {
        if (cancelled) return;
        if (!res) {
          setNewsError('upstream returned no data');
          return;
        }
        setNews(res.items);
      })
      .catch((e: Error) => {
        if (!cancelled) setNewsError(e.message);
      })
      .finally(() => {
        if (!cancelled) setNewsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return (
    <DataPageLayout
      backTo="/threatintel"
      maxWidthClass="max-w-5xl"
      icon={<ShieldAlert size={28} />}
      title="Live breach disclosures"
      description={
        <>
          <span className="block">
            Two complementary surfaces. Up top, active leak listings from{' '}
            <a
              href="https://mythreatintel.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 dark:text-brand-400 hover:underline"
            >
              MyThreatIntel
            </a>{' '}
            (rawer firehose, what's currently being shopped or scraped). Below, the canonical{' '}
            <a
              href="https://haveibeenpwned.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 dark:text-brand-400 hover:underline"
            >
              Have I Been Pwned
            </a>{' '}
            corpus with verification flags, sensitivity markers, and exposed data classes.
          </span>
          <span className="block text-xs text-slate-500 dark:text-slate-400 font-mono mt-2">
            MyThreatIntel leaks (active) + HIBP public corpus (canonical) + breach-news feeds (timely commentary).
          </span>
        </>
      }
      headerExtra={
        <div className="flex items-center gap-3">
          <LiveFreshnessPill tone="live" />
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            className="text-mini font-mono px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 hover:border-brand-500/40 inline-flex items-center gap-1"
            aria-label="Refresh breach disclosures"
          >
            <RefreshCw size={11} /> refresh
          </button>
        </div>
      }
    >
      {/* MTI leaks panel — the active firehose. Sits above HIBP because
          this is the timeliness-first signal; HIBP carries the depth and
          the data-class breakdown but lags weeks behind a fresh dump. */}
      <MtiLeaksPanel />

      <BreachDisclosuresPanel key={refreshKey} />

      {/* Breach-news section — RSS aggregate from breach-reporting blogs +
          research labs. Complements the HIBP corpus above (which is exhaustive
          but lags) with timely write-ups of incidents in the wild. */}
      <section className="mt-10">
        <div className="mb-3">
          <h2 className="font-display font-bold text-xl inline-flex items-center gap-2">
            <Newspaper size={18} className="text-brand-600 dark:text-brand-400" /> Recent breach news
          </h2>
        </div>

        {newsLoading && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 p-4 inline-flex items-center gap-2 font-mono text-sm text-slate-500">
            <Loader2 size={14} className="animate-spin" /> loading breach-news feeds…
          </div>
        )}

        {newsError && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/5 p-3 font-mono text-sm text-rose-600 dark:text-rose-300">
            Error loading breach news: {newsError}
          </div>
        )}

        {news && news.length === 0 && !newsLoading && (
          <p className="text-sm font-mono text-slate-500 italic">No items returned from upstream feeds.</p>
        )}

        {news && news.length > 0 && (
          <ul className="grid gap-2">
            {(() => {
              const seen = new Set<string>();
              return news
                .filter((item) => {
                  const normalized = (item.title ?? '')
                    .toLowerCase()
                    .replace(/^(breach\s*|data\s+breach\s*|disclosed\s*)/i, '')
                    .replace(/[^a-z0-9]/g, '')
                    .trim();
                  if (!normalized || seen.has(normalized)) return false;
                  seen.add(normalized);
                  return true;
                })
                .map((item, i) => (
                  <li
                    key={`${item.link}-${i}`}
                    className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 p-3 hover:border-brand-500/40 transition-colors"
                  >
                    <a
                      href={sanitizeUrl(item.link) || undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block group"
                      title={item.title ?? item.link}
                    >
                      <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                        <span className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors flex-1 min-w-0">
                          {item.title ?? '(untitled)'}
                        </span>
                        <ExternalLink size={11} className="text-slate-400 shrink-0" aria-hidden="true" />
                      </div>
                      <div className="text-mini font-mono text-slate-500 flex items-center gap-2 flex-wrap">
                        {item.source && <span className="text-brand-600 dark:text-brand-400">{item.source}</span>}
                        {item.pubDate && <span className="text-slate-400">{formatRelativeTime(item.pubDate)}</span>}
                      </div>
                    </a>
                  </li>
                ));
            })()}
          </ul>
        )}
      </section>

      <BreachDatabasesPanel />
    </DataPageLayout>
  );
}
