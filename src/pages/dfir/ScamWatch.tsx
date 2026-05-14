import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink, RefreshCw, AlertTriangle, Loader2, Search } from 'lucide-react';
import { fetchAggregatedFeed, formatRelativeTime, type AggregatedFeedItem } from '../../services/rssService';
import { rssFeeds } from '../../data/rssFeeds';

/**
 * Scam Watch — live aggregator of digital-fraud reporting.
 *
 * Sections:
 *   - Official alerts: FTC consumer alerts + FBI IC3 PSAs
 *   - Deepfake feed: Google News "deepfake scam" RSS query
 *   - Victim reports: Reddit r/Scams + r/CryptoScams + r/Romance_Scams + r/PhishingScams
 *   - Fact-checks + general scam news: Snopes + Google News "digital scam victim"
 */

const SECTIONS: { id: string; label: string; blurb: string; feedIds: string[] }[] = [
  {
    id: 'alerts',
    label: 'Official alerts',
    blurb: 'Government / regulator advisories on active scam operations.',
    feedIds: ['ftc-consumer', 'ic3-psas'],
  },
  {
    id: 'deepfake',
    label: 'Deepfake & AI voice',
    blurb: 'Synthetic-media-driven scams — voice clones, face-swaps, AI impersonation.',
    feedIds: ['gnews-deepfake', 'gnews-voice-clone'],
  },
  {
    id: 'pig-butchering',
    label: 'Pig butchering & investment',
    blurb: 'Long-con investment scams — sha zhu pan, fake brokers, romance-baiting into crypto / forex.',
    feedIds: ['gnews-pig-butcher', 'gnews-investment-scam'],
  },
  {
    id: 'crypto-nft',
    label: 'Crypto & NFT scams',
    blurb: 'Rug pulls, wallet drainers, NFT phishing, DeFi exploits — first-person + post-mortems.',
    feedIds: [
      'gnews-rug-pull',
      'gnews-nft-drainer',
      'gnews-defi-hack',
      'rekt-news',
      'web3-grift',
      'reddit-cryptoscams',
    ],
  },
  {
    id: 'job',
    label: 'Job & recruitment',
    blurb: 'Fake recruiters, fake interviews, fake offer letters — fastest-growing scam category.',
    feedIds: ['gnews-job-scam', 'reddit-jobscams'],
  },
  {
    id: 'impersonation',
    label: 'Impersonation & social engineering',
    blurb: 'Tech-support, IRS, Microsoft, SIM-swap, vishing — anyone-but-them on the phone.',
    feedIds: ['gnews-tech-support', 'gnews-sim-swap', 'reddit-scammer-payback'],
  },
  {
    id: 'victims',
    label: 'Victim reports',
    blurb: 'First-person reports posted to Reddit fraud-recovery communities.',
    feedIds: ['reddit-scams', 'reddit-phishing-scams'],
  },
  {
    id: 'news',
    label: 'Fact-checks & news',
    blurb: 'Mainstream coverage and Snopes fact-checks of viral scam claims.',
    feedIds: ['gnews-victim', 'snopes'],
  },
];

const ALL_FEED_IDS = SECTIONS.flatMap((s) => s.feedIds);

export default function ScamWatch(): JSX.Element {
  const [items, setItems] = useState<AggregatedFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [feedsReturned, setFeedsReturned] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setItems([]);
    try {
      const data = await fetchAggregatedFeed(ALL_FEED_IDS, { limit: 220, perSource: 25 });
      if (!data) throw new Error('no aggregator-eligible feeds configured');
      setItems(data.items);
      setFeedsReturned(data.feeds_returned);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Build url → section index for fast section labelling.
  const urlToSection = useMemo(() => {
    const map = new Map<string, string>();
    for (const sec of SECTIONS) {
      for (const fid of sec.feedIds) {
        const url = rssFeeds.find((r) => r.id === fid)?.url;
        if (url) map.set(url, sec.id);
      }
    }
    return map;
  }, []);

  const annotated = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .map((it) => ({ item: it, section: urlToSection.get(it.source_url) ?? 'other' }))
      .filter(({ item, section }) => {
        if (activeSection !== 'all' && section !== activeSection) return false;
        if (!q) return true;
        const hay = `${item.title ?? ''} ${item.description ?? ''}`.toLowerCase();
        return q
          .split(/\s+/)
          .filter(Boolean)
          .every((tok) => hay.includes(tok));
      });
  }, [items, urlToSection, activeSection, search]);

  const sectionCounts = useMemo(() => {
    const counts: Record<string, number> = { all: items.length };
    for (const sec of SECTIONS) counts[sec.id] = 0;
    for (const it of items) {
      const sec = urlToSection.get(it.source_url);
      if (sec) counts[sec] = (counts[sec] ?? 0) + 1;
    }
    return counts;
  }, [items, urlToSection]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> /threatintel
      </Link>

      <div className="animate-fade-in-up">
        <h1 className="text-4xl font-display font-bold mb-2 inline-flex items-center gap-3">
          <AlertTriangle size={28} className="text-brand-600 dark:text-brand-400" /> Scam Watch
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-2 max-w-2xl">
          Live aggregator of digital-scam activity — official advisories, deepfake incidents, first-person victim
          reports, and mainstream coverage. {ALL_FEED_IDS.length} sources fetched server-side, deduped, sorted by
          publication time.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-500 font-mono mb-8">
          Reddit feeds are real victim reports — context-rich but anecdotal. FTC + FBI IC3 are the authoritative source
          for U.S. fraud trends. Pairs with{' '}
          <Link to="/threatintel/darkweb" className="text-brand-600 dark:text-brand-400 hover:underline">
            Dark Web Watch
          </Link>{' '}
          (ransomware activity + breach disclosures) and{' '}
          <Link to="/dfir/dlp-scan" className="text-brand-600 dark:text-brand-400 hover:underline">
            Sensitive Data Detector
          </Link>
          .
        </p>
      </div>

      {/* Filters */}
      <section className="mb-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Search size={14} className="text-brand-600 dark:text-brand-400" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title or description — e.g. pig butchering, voice clone, romance"
            className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
            aria-label="Search Scam Watch"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="text-xs font-mono text-slate-500 hover:text-rose-600 dark:hover:text-rose-400"
            >
              clear
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setActiveSection('all')}
            className={`text-xs font-mono px-2 py-1 rounded border transition-colors ${
              activeSection === 'all'
                ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-brand-500/40'
            }`}
          >
            All <span className="opacity-60">· {sectionCounts.all ?? 0}</span>
          </button>
          {SECTIONS.map((sec) => (
            <button
              key={sec.id}
              onClick={() => setActiveSection(sec.id)}
              className={`text-xs font-mono px-2 py-1 rounded border transition-colors ${
                activeSection === sec.id
                  ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                  : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-brand-500/40'
              }`}
            >
              {sec.label} <span className="opacity-60">· {sectionCounts[sec.id] ?? 0}</span>
            </button>
          ))}
          <button
            onClick={() => void load()}
            disabled={loading}
            className="ml-auto text-xs font-mono px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:border-brand-500/40 inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {loading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
            {loading ? 'fetching' : 'refresh'}
          </button>
        </div>

        {activeSection !== 'all' && (
          <p className="text-[11px] font-mono text-slate-500 dark:text-slate-500">
            <span className="text-slate-700 dark:text-slate-300">
              {SECTIONS.find((s) => s.id === activeSection)?.label}:
            </span>{' '}
            {SECTIONS.find((s) => s.id === activeSection)?.blurb}
          </p>
        )}
      </section>

      {error && (
        <p className="text-sm font-mono text-rose-600 dark:text-rose-400 inline-flex items-center gap-1.5 mb-4">
          <AlertTriangle size={14} /> {error}
        </p>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-sm font-mono text-slate-500 dark:text-slate-500">
          No items returned from the aggregator. Try refresh; the upstream feeds may be temporarily slow.
        </div>
      )}

      <p className="text-[11px] font-mono text-slate-500 dark:text-slate-500 mb-3">
        Showing {annotated.length} of {items.length} · {feedsReturned} of {ALL_FEED_IDS.length} feeds returned data
      </p>

      <ul className="space-y-2">
        {annotated.slice(0, 200).map(({ item, section }) => (
          <li
            key={item.link ?? `${item.title}-${item.pubDate}`}
            className="rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
              <a
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100 hover:text-brand-600 dark:hover:text-brand-400 inline-flex items-center gap-1"
              >
                {item.title || '(untitled)'} <ExternalLink size={11} />
              </a>
              <span
                className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${sectionStyle(section)}`}
              >
                {section}
              </span>
            </div>
            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-500 mb-1">
              <span>{item.source || 'feed'}</span>
              {item.pubDate && <> · {formatRelativeTime(item.pubDate)}</>}
            </div>
            {item.description && (
              <p className="text-[12px] font-mono text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-3">
                {stripHtml(item.description)}
              </p>
            )}
          </li>
        ))}
      </ul>

      {annotated.length > 200 && (
        <p className="mt-4 text-[11px] font-mono text-slate-500 dark:text-slate-500">
          Showing 200 most-recent items. Tighten the search or filter to narrow.
        </p>
      )}
    </div>
  );
}

function sectionStyle(section: string): string {
  switch (section) {
    case 'alerts':
      return 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300';
    case 'deepfake':
      return 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300';
    case 'pig-butchering':
      return 'border-pink-500/30 bg-pink-500/10 text-pink-700 dark:text-pink-300';
    case 'job':
      return 'border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300';
    case 'impersonation':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
    case 'crypto-nft':
      return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300';
    case 'victims':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
    case 'news':
      return 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300';
    default:
      return 'border-slate-300 dark:border-slate-700 text-slate-500';
  }
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}
