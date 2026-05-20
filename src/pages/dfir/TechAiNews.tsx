import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, ExternalLink, RefreshCw, Sparkles, Loader2, Search } from 'lucide-react';
import { fetchAggregatedFeed, formatRelativeTime, type AggregatedFeedItem } from '../../services/rssService';
import { rssFeeds } from '../../data/rssFeeds';

/**
 * Tech & AI News — sectioned aggregator for the non-threat half of "what's
 * happening." Threat-intel content lives in /threatintel/darkweb and /threatintel/scam-watch
 * and stays out of this surface deliberately.
 */

interface Section {
  id: string;
  label: string;
  blurb: string;
  feedIds: string[];
}

const SECTIONS: Section[] = [
  {
    id: 'ai',
    label: 'AI',
    blurb: 'Model releases, AI funding, agentic-AI products, AI-system security incidents.',
    feedIds: [
      'techcrunch-ai',
      'verge-ai',
      'openai-news',
      'google-ai',
      'gnews-ai-security',
      'gnews-ai-funding',
      'gnews-genai-enterprise',
      'huggingface-blog',
      'the-decoder',
      'import-ai',
      'deepmind-blog',
    ],
  },
  {
    id: 'funding',
    label: 'Cybersecurity funding & M&A',
    blurb: 'Series A-D rounds, acquisitions, IPOs, vendor consolidation in the security industry.',
    feedIds: [
      'techcrunch-security',
      'venturebeat-security',
      'gnews-cybersec-funding',
      'gnews-cybersec-acquisition',
      'gnews-infosec-startup',
    ],
  },
  {
    id: 'general',
    label: 'General tech',
    blurb: 'Broader infrastructure, OS, networking, devices, and the security crossover.',
    feedIds: ['ars-tech', 'mit-tech-review'],
  },
  {
    id: 'yc',
    label: 'YC & startups',
    blurb: 'Y Combinator essays and announcements, plus the Hacker News front page.',
    feedIds: ['yc-blog', 'hn-frontpage'],
  },
];

const ALL_FEED_IDS = SECTIONS.flatMap((s) => s.feedIds);

const SECTION_STYLES: Record<string, string> = {
  ai: 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  funding: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  general: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
};

export default function TechAiNews(): JSX.Element {
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
      const data = await fetchAggregatedFeed(ALL_FEED_IDS, { limit: 250, perSource: 20 });
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
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 inline-flex items-center gap-3">
          <Sparkles size={28} className="text-brand-600 dark:text-brand-400" /> Tech &amp; AI News
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-2 max-w-2xl">
          Live aggregator of AI lab announcements, cybersecurity vendor funding, and broader tech-industry signal.{' '}
          {ALL_FEED_IDS.length} sources fetched server-side, deduped, sorted by publication time.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-500 font-mono mb-8">
          Threat-intel content (ransomware activity, breach disclosures, scam victim reports) lives separately in{' '}
          <Link to="/threatintel/darkweb" className="text-brand-600 dark:text-brand-400 hover:underline">
            Dark Web Watch
          </Link>{' '}
          and{' '}
          <Link to="/threatintel/scam-watch" className="text-brand-600 dark:text-brand-400 hover:underline">
            Scam Watch
          </Link>
          . This page is the "what's the industry building / paying for" surface.
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
            placeholder="Search title or description — e.g. wiz, snyk, gpt-5, $100m, anthropic"
            className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
            aria-label="Search Tech & AI News"
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
        <p role="alert" className="text-sm font-mono text-rose-600 dark:text-rose-400 mb-4">
          Could not load: {error}
        </p>
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
                className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${SECTION_STYLES[section] ?? 'border-slate-300 dark:border-slate-700 text-slate-500'}`}
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
    </div>
  );
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
