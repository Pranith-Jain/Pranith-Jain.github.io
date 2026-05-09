import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink, RefreshCw, Plus, X, Eye, Bell, Search, Filter } from 'lucide-react';
import { motion } from 'framer-motion';
import { fetchFeedsProgressive, formatRelativeTime, type FeedItem } from '../../services/rssService';

/**
 * Curated dark-web monitoring sources. Higher-signal subset of the general
 * ThreatIntelFeed — leak sites, ransomware, breach reports, and IR writeups
 * that surface dark-web activity.
 */
const DARKWEB_FEEDS: { id: string; label: string }[] = [
  { id: 'darkwebinformer', label: 'Dark Web Informer' },
  { id: 'ransomware-live', label: 'Ransomware.live' },
  { id: 'databreaches', label: 'DataBreaches.net' },
  { id: 'dfir-report', label: 'The DFIR Report' },
  { id: 'the-record', label: 'The Record' },
  { id: 'curated-intel', label: 'Curated Intelligence' },
  // Added round 2: more breadth, all verified live
  { id: 'reddit-malware', label: 'r/Malware' },
  { id: 'reddit-blueteamsec', label: 'r/blueteamsec' },
  { id: 'reddit-threatintel', label: 'r/threatintel' },
  { id: 'reddit-netsec', label: 'r/netsec' },
  { id: 'bleepingcomputer', label: 'BleepingComputer' },
  { id: 'krebsonsecurity', label: 'Krebs on Security' },
  { id: 'malware-traffic-analysis', label: 'Malware Traffic Analysis' },
  { id: 'doublepulsar', label: 'DoublePulsar' },
  { id: 'sophos-xops', label: 'Sophos X-Ops' },
];

const ALL_FEED_IDS = DARKWEB_FEEDS.map((f) => f.id);

const STORAGE_KEY_WATCH = 'dfir.darkweb.watchlist';
const STORAGE_KEY_SOURCES = 'dfir.darkweb.activeSources';
const MAX_PER_SOURCE = 12;
const MAX_ITEMS = 200;

// Watch window is capped at 30 days. Older items are dropped on the client so
// the feed reflects current threat activity, not historical noise.
type DateWindow = '24h' | '7d' | '30d';

function loadJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveJson<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* localStorage may be disabled in private mode */
  }
}

interface MatchedItem {
  item: FeedItem;
  watchMatches: string[];
  searchMatch: boolean;
}

function findWatchMatches(item: FeedItem, watchlist: string[]): string[] {
  if (watchlist.length === 0) return [];
  const haystack = `${item.title ?? ''} ${item.description ?? ''}`.toLowerCase();
  return watchlist.filter((term) => term && haystack.includes(term.toLowerCase()));
}

/** Live search supports plain substring and regex (when wrapped in /pattern/). */
function compileSearch(query: string): ((item: FeedItem) => boolean) | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('/') && trimmed.lastIndexOf('/') > 0) {
    try {
      const lastSlash = trimmed.lastIndexOf('/');
      const pattern = trimmed.slice(1, lastSlash);
      const flags = trimmed.slice(lastSlash + 1) || 'i';
      const re = new RegExp(pattern, flags);
      return (item) => re.test(`${item.title ?? ''} ${item.description ?? ''}`);
    } catch {
      return null; // bad regex
    }
  }
  // Plain text: split on whitespace, ALL terms must appear (AND semantics)
  const tokens = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
  return (item) => {
    const hay = `${item.title ?? ''} ${item.description ?? ''}`.toLowerCase();
    return tokens.every((t) => hay.includes(t));
  };
}

function withinWindow(item: FeedItem, win: DateWindow): boolean {
  const t = new Date(item.pubDate).getTime();
  if (!t) return false;
  const ageMs = Date.now() - t;
  switch (win) {
    case '24h':
      return ageMs <= 24 * 3600_000;
    case '7d':
      return ageMs <= 7 * 86400_000;
    case '30d':
      return ageMs <= 30 * 86400_000;
  }
}

function highlightInText(text: string, query: string, watchTerms: string[]): JSX.Element {
  // Highlight all occurrences of each query token + each watchlist term
  const tokens = [...query.toLowerCase().split(/\s+/).filter(Boolean), ...watchTerms.map((t) => t.toLowerCase())];
  if (tokens.length === 0) return <>{text}</>;
  // Build a regex that matches any token, case-insensitive
  const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  let re: RegExp;
  try {
    re = new RegExp(`(${escaped})`, 'gi');
  } catch {
    return <>{text}</>;
  }
  const parts = text.split(re);
  return (
    <>
      {parts.map((part, i) =>
        re.test(part) ? (
          <mark key={i} className="bg-amber-200 dark:bg-amber-700/40 text-inherit rounded px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

export default function DarkWeb(): JSX.Element {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sourceCount, setSourceCount] = useState(0);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [newTerm, setNewTerm] = useState('');
  // Search controls
  const [search, setSearch] = useState('');
  const [activeSources, setActiveSources] = useState<Set<string>>(() => new Set(ALL_FEED_IDS));
  const [dateWindow, setDateWindow] = useState<DateWindow>('30d');

  // Hydrate from localStorage
  useEffect(() => {
    setWatchlist(loadJson<string[]>(STORAGE_KEY_WATCH, []));
    const savedSources = loadJson<string[]>(STORAGE_KEY_SOURCES, ALL_FEED_IDS);
    setActiveSources(new Set(savedSources.length > 0 ? savedSources : ALL_FEED_IDS));
  }, []);

  const fetchFeeds = useCallback(async () => {
    setLoading(true);
    setItems([]);
    setSourceCount(0);
    let active = 0;
    let firstSeen = false;

    await fetchFeedsProgressive(ALL_FEED_IDS, (_id, result) => {
      if (result.error || result.items.length === 0) return;
      active++;
      setSourceCount(active);
      setItems((prev) => {
        const merged = [...prev, ...result.items.slice(0, MAX_PER_SOURCE)];
        merged.sort((a, b) => {
          const da = new Date(a.pubDate).getTime() || 0;
          const db = new Date(b.pubDate).getTime() || 0;
          return db - da;
        });
        return merged.slice(0, MAX_ITEMS);
      });
      if (!firstSeen) {
        firstSeen = true;
        setLoading(false);
      }
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchFeeds();
  }, [fetchFeeds]);

  const addTerm = (raw: string) => {
    const term = raw.trim();
    if (!term) return;
    if (watchlist.some((w) => w.toLowerCase() === term.toLowerCase())) return;
    const next = [...watchlist, term];
    setWatchlist(next);
    saveJson(STORAGE_KEY_WATCH, next);
    setNewTerm('');
  };
  const removeTerm = (term: string) => {
    const next = watchlist.filter((w) => w !== term);
    setWatchlist(next);
    saveJson(STORAGE_KEY_WATCH, next);
  };
  const toggleSource = (id: string) => {
    setActiveSources((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveJson(STORAGE_KEY_SOURCES, Array.from(next));
      return next;
    });
  };
  const allSourcesOn = activeSources.size === ALL_FEED_IDS.length;
  const toggleAllSources = () => {
    const next = allSourcesOn ? new Set<string>() : new Set(ALL_FEED_IDS);
    setActiveSources(next);
    saveJson(STORAGE_KEY_SOURCES, Array.from(next));
  };

  const searchFn = useMemo(() => compileSearch(search), [search]);

  // Apply: source filter → date window → search → watchlist match annotation
  const matched = useMemo<MatchedItem[]>(() => {
    return items
      .filter((it) => {
        // FeedItem doesn't carry source id directly, but `source` field is the human label.
        // Find source whose label matches.
        if (allSourcesOn) return true;
        const source = DARKWEB_FEEDS.find((f) => f.label === it.source || f.id === it.source);
        return source ? activeSources.has(source.id) : true;
      })
      .filter((it) => withinWindow(it, dateWindow))
      .filter((it) => (searchFn ? searchFn(it) : true))
      .map((it) => ({
        item: it,
        watchMatches: findWatchMatches(it, watchlist),
        searchMatch: !!searchFn,
      }));
  }, [items, activeSources, allSourcesOn, dateWindow, searchFn, watchlist]);

  const matchCount = useMemo(() => matched.filter((m) => m.watchMatches.length > 0).length, [matched]);
  const perTermCount = useMemo(() => {
    const map: Record<string, number> = {};
    for (const term of watchlist) map[term] = 0;
    for (const m of matched) for (const t of m.watchMatches) map[t]++;
    return map;
  }, [matched, watchlist]);

  return (
    <div className="max-w-5xl mx-auto px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> /dfir
      </Link>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="text-4xl font-display font-bold mb-2">Dark Web Watch</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-2xl">
          Aggregated dark web, ransomware leak-site, breach, and security-research activity from
          {` ${DARKWEB_FEEDS.length} `}curated free sources. Use the search box for live filtering (regex like{' '}
          <code className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1 rounded">/lockbit|alphv/i</code>{' '}
          works), filter by source, narrow by date window, and add long-running keywords to your watchlist for
          highlighted matches across visits. Watchlist + source preferences are stored locally; nothing is uploaded.
        </p>
      </motion.div>

      {/* Search + filters */}
      <section className="mb-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Search size={14} className="text-brand-600 dark:text-brand-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Live search. Plain words = AND. /regex/i for regex."
            className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="text-xs font-mono text-slate-500 hover:text-rose-600 dark:hover:text-rose-400"
            >
              clear
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
          <Filter size={12} className="text-brand-600 dark:text-brand-400" />
          <span className="text-slate-500">Sources:</span>
          <button
            type="button"
            onClick={toggleAllSources}
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            {allSourcesOn ? 'clear all' : 'select all'}
          </button>
          {DARKWEB_FEEDS.map((f) => {
            const on = activeSources.has(f.id);
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => toggleSource(f.id)}
                className={`px-2 py-0.5 rounded border transition-colors ${
                  on
                    ? 'border-brand-500/50 text-slate-900 dark:text-slate-100 bg-brand-50 dark:bg-brand-900/20'
                    : 'border-slate-200 dark:border-slate-800 text-slate-500'
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          <span className="text-slate-500">Window:</span>
          {(['24h', '7d', '30d'] as DateWindow[]).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setDateWindow(w)}
              className={`px-2 py-0.5 rounded border transition-colors ${
                dateWindow === w
                  ? 'border-brand-500/50 text-slate-900 dark:text-slate-100 bg-brand-50 dark:bg-brand-900/20'
                  : 'border-slate-200 dark:border-slate-800 text-slate-500'
              }`}
            >
              last {w}
            </button>
          ))}
          <span className="text-slate-500">(max 30 days)</span>
        </div>
      </section>

      {/* Watchlist control */}
      <section className="mb-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Bell size={14} className="text-brand-600 dark:text-brand-400" />
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400">Watchlist</h2>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addTerm(newTerm);
          }}
          className="flex gap-2 mb-3"
        >
          <input
            type="text"
            value={newTerm}
            onChange={(e) => setNewTerm(e.target.value)}
            placeholder="company name, domain, sector, threat actor…"
            className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
          />
          <button
            type="submit"
            disabled={!newTerm.trim()}
            className="inline-flex items-center gap-1 px-3 py-2 bg-brand-600 dark:bg-brand-500 text-white text-sm font-mono font-semibold rounded-lg disabled:opacity-30 hover:bg-brand-700 dark:hover:bg-brand-400"
          >
            <Plus size={14} /> Track
          </button>
        </form>
        {watchlist.length === 0 ? (
          <p className="text-xs font-mono text-slate-500">
            Empty. Add a keyword above to highlight matching posts in the feed below.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {watchlist.map((term) => (
              <li
                key={term}
                className="inline-flex items-center gap-2 text-xs font-mono px-2 py-1 rounded-full border border-brand-500/40 bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300"
              >
                <span>{term}</span>
                <span className="text-slate-500">{perTermCount[term] ?? 0}</span>
                <button
                  type="button"
                  onClick={() => removeTerm(term)}
                  aria-label={`stop tracking ${term}`}
                  className="text-slate-500 hover:text-rose-600 dark:hover:text-rose-400"
                >
                  <X size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Stats */}
      <header className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
        <h2 className="font-display font-bold text-xl">Recent activity</h2>
        <div className="flex items-center gap-3 text-xs font-mono text-slate-600 dark:text-slate-400">
          <span>
            {sourceCount} of {DARKWEB_FEEDS.length} sources
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {matched.length} of {items.length} items
          </span>
          {watchlist.length > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-brand-600 dark:text-brand-400">
                {matchCount} watchlist match{matchCount === 1 ? '' : 'es'}
              </span>
            </>
          )}
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() => void fetchFeeds()}
            disabled={loading}
            aria-label="refresh dark web feeds"
            className="inline-flex items-center gap-1 hover:text-brand-600 dark:hover:text-brand-400 disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> refresh
          </button>
        </div>
      </header>

      {loading && items.length === 0 && (
        <p className="font-mono text-sm text-slate-600 dark:text-slate-400">Fetching…</p>
      )}

      {!loading && matched.length === 0 && items.length > 0 && (
        <p className="font-mono text-sm text-slate-500">
          No items match the current filters.{' '}
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setActiveSources(new Set(ALL_FEED_IDS));
              setDateWindow('30d');
            }}
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            reset filters
          </button>
        </p>
      )}

      {matched.length > 0 && (
        <ul className="space-y-3">
          {matched.map(({ item: it, watchMatches }) => {
            const hit = watchMatches.length > 0;
            return (
              <li
                key={it.guid ?? it.link}
                className={`rounded-lg border p-4 transition-colors ${
                  hit
                    ? 'border-amber-400 bg-amber-50/50 dark:bg-amber-900/15 dark:border-amber-700'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                }`}
              >
                <a href={it.link} target="_blank" rel="noopener noreferrer" className="group block">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                      {highlightInText(it.title, search, watchlist)}
                    </h3>
                    <ExternalLink size={12} className="text-slate-500 shrink-0 mt-1" />
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs font-mono text-slate-500">
                    {it.source && <span className="text-brand-600 dark:text-brand-400">{it.source}</span>}
                    {it.pubDate && <span>{formatRelativeTime(it.pubDate)}</span>}
                  </div>
                </a>
                {hit && (
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <Eye size={12} className="text-amber-700 dark:text-amber-400" />
                    {watchMatches.map((m) => (
                      <span
                        key={m}
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-200/60 dark:bg-amber-700/30 text-amber-900 dark:text-amber-200"
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <footer className="mt-12 text-xs font-mono text-slate-500 leading-relaxed">
        Sources: Dark Web Informer · Ransomware.live · DataBreaches.net · The DFIR Report · The Record · Curated
        Intelligence · Reddit (r/Malware, r/blueteamsec, r/threatintel, r/netsec) · BleepingComputer · Krebs · Malware
        Traffic Analysis · DoublePulsar · Sophos X-Ops. Closed-darknet content (private Telegram, paid leak sites,
        invite-only forums) is not in scope; see{' '}
        <a
          href="https://github.com/fastfire/deepdarkCTI"
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-600 dark:text-brand-400 hover:underline"
        >
          deepdarkCTI
        </a>{' '}
        for an index of those.
      </footer>
    </div>
  );
}
