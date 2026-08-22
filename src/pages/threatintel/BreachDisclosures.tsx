import { useEffect, useState } from 'react';
import { sanitizeUrl } from '../../lib/sanitize-url';
import { ExternalLink, Loader2, Newspaper, RefreshCw, ShieldAlert } from 'lucide-react';
import { BreachDisclosuresPanel } from '../dfir/DarkWeb';
import { BreachDatabasesPanel } from '../../components/dfir/BreachDatabasesPanel';
import { MtiLeaksPanel } from '../../components/threatintel/MtiLeaksPanel';
import { fetchAggregatedFeed, formatRelativeTime, type AggregatedFeedItem } from '../../services/rssService';
import { LiveFreshnessPill } from '../../components/LiveFreshnessPill';
import { DataPageLayout } from '../../components/DataPageLayout';
import { PostAnalysisButton } from '../../components/threatintel/PostAnalysisButton';
import { AiSummaryCard } from '../../components/intel/AiSummaryCard';

/**
 * Feed IDs - strictly breach-focused. Krebs / BleepingComputer cover
 * general security news; they're included on /threatintel/threat-feeds
 * already, so we keep them OUT of this page so the feed stays clean
 * "incident disclosure" signal.
 */
const BREACH_NEWS_FEED_IDS = [
  'databreaches',
  'bleepingcomputer-breaches',
  'grahamcluley',
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
 * /threatintel/darkweb view - same data (Have I Been Pwned public breach
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
              className="text-rose-600 dark:text-rose-400 hover:underline transition-colors"
            >
              MyThreatIntel
            </a>{' '}
            (rawer firehose, what's currently being shopped or scraped). Below, the canonical{' '}
            <a
              href="https://haveibeenpwned.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-rose-600 dark:text-rose-400 hover:underline transition-colors"
            >
              Have I Been Pwned
            </a>{' '}
            corpus with verification flags, sensitivity markers, and exposed data classes.
          </span>
          <span className="block text-xs text-muted font-mono mt-2">
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
            className="text-mini font-mono px-2.5 py-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] hover:border-rose-500/40 inline-flex items-center gap-1"
            aria-label="Refresh breach disclosures"
          >
            <RefreshCw size={11} /> refresh
          </button>
        </div>
      }
    >
      {/* MTI leaks panel - the active firehose. Sits above HIBP because
          this is the timeliness-first signal; HIBP carries the depth and
          the data-class breakdown but lags weeks behind a fresh dump. */}
      <MtiLeaksPanel />

      <BreachDisclosuresPanel key={refreshKey} />

      {/* Breach-news section - RSS aggregate from breach-reporting blogs +
          research labs. Complements the HIBP corpus above (which is exhaustive
          but lags) with timely write-ups of incidents in the wild. */}
      <section className="mt-10">
        <div className="mb-3">
          <h2 className="font-display font-bold text-xl inline-flex items-center gap-2">
            <Newspaper size={18} className="text-rose-600 dark:text-rose-400" /> Recent breach news
          </h2>
        </div>

        {newsLoading && (
          <div className="surface-card p-4 inline-flex items-center gap-2 font-mono text-sm text-slate-500">
            <Loader2 size={14} className="animate-spin" /> loading breach-news feeds…
          </div>
        )}

        {newsError && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/5 p-3 font-mono text-sm text-rose-600 dark:text-rose-300">
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
                  <li key={`${item.link}-${i}`} className="surface-card p-3 hover:border-rose-500/40 transition-colors">
                    <a
                      href={sanitizeUrl(item.link) || undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block group"
                      title={item.title ?? item.link}
                    >
                      <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                        <span className="font-display font-semibold text-sm text-heading group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors flex-1 min-w-0">
                          {item.title ?? '(untitled)'}
                        </span>
                        <ExternalLink size={11} className="text-muted shrink-0" aria-hidden="true" />
                      </div>
                      <div className="text-mini font-mono text-slate-500 flex items-center gap-2 flex-wrap">
                        {item.source && <span className="text-rose-600 dark:text-rose-400">{item.source}</span>}
                        {item.pubDate && <span className="text-muted">{formatRelativeTime(item.pubDate)}</span>}
                      </div>
                    </a>
                    <div className="mt-2">
                      <PostAnalysisButton
                        title={item.title ?? item.link}
                        description={item.description}
                        source={item.source}
                        link={item.link}
                        compact
                      />
                    </div>
                  </li>
                ));
            })()}
          </ul>
        )}

        {news && news.length > 0 && (
          <AiSummaryCard
            surface="Breach Disclosures"
            items={news
              .filter((item) => item.title)
              .slice(0, 30)
              .map((item) => ({
                title: item.title as string,
                body: stripHtml(item.description ?? ''),
                source: item.source,
              }))}
            requireAdmin={false}
          />
        )}
      </section>

      <BreachDatabasesPanel />
    </DataPageLayout>
  );
}

function stripHtml(s: string): string {
  return (
    s
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim() || ''
  );
}
