import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Loader2, Newspaper, ShieldAlert } from 'lucide-react';
import { BreachDisclosuresPanel } from '../dfir/DarkWeb';
import { BreachDatabasesPanel } from '../../components/dfir/BreachDatabasesPanel';
import { fetchAggregatedFeed, formatRelativeTime, type AggregatedFeedItem } from '../../services/rssService';

/**
 * Feed IDs — strictly breach-focused. Krebs / BleepingComputer cover
 * general security news; they're included on /threatintel/threat-feeds
 * already, so we keep them OUT of this page so the feed stays clean
 * "incident disclosure" signal.
 */
const BREACH_NEWS_FEED_IDS = [
  'databreaches',
  'databreachtoday',
  'bleepingcomputer-breaches',
  'hackread-breaches',
  'securityweek-breaches',
  'cyberscoop-breaches',
  'vpnmentor-research',
  'grcsolutions-breaches',
  'comparitech-breaches',
  'troyhunt-blog',
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

  useEffect(() => {
    let cancelled = false;
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
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </Link>

      <div className="animate-fade-in-up">
        <h1 className="text-4xl font-display font-bold mb-2 inline-flex items-center gap-3">
          <ShieldAlert size={28} className="text-brand-600 dark:text-brand-400" /> Live breach disclosures
        </h1>
        <p className="text-slate-600 dark:text-slate-400 font-mono mb-2 max-w-3xl">
          Disclosed breaches from the{' '}
          <a
            href="https://haveibeenpwned.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            Have I Been Pwned
          </a>{' '}
          public corpus, with verification flags, sensitivity markers, and exposed data classes. Reference for
          incident-response triage; verify in your environment before acting.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-500 font-mono mb-8">
          Public breach disclosure corpus via Have I Been Pwned.
        </p>
      </div>

      <BreachDisclosuresPanel />

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
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 inline-flex items-center gap-2 font-mono text-sm text-slate-500">
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
            {news.map((item, i) => (
              <li
                key={`${item.link}-${i}`}
                className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 hover:border-brand-500/40 transition-colors"
              >
                <a
                  href={item.link}
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
                  <div className="text-[11px] font-mono text-slate-500 flex items-center gap-2 flex-wrap">
                    {item.source && <span className="text-brand-600 dark:text-brand-400">{item.source}</span>}
                    {item.pubDate && <span className="text-slate-400">{formatRelativeTime(item.pubDate)}</span>}
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <BreachDatabasesPanel />
    </div>
  );
}
