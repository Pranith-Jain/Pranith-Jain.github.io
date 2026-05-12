import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Loader2, MessageSquare, RefreshCw, Search, Sparkles } from 'lucide-react';
import { useLastVisit, isNewSince } from '../../hooks';

interface RedditFeedItem {
  sub: string;
  sub_label: string;
  sub_topic: 'news' | 'research' | 'red-team' | 'blue-team' | 'osint' | 'malware' | 'help' | 'scams';
  sub_blurb: string;
  title: string;
  link: string;
  pub_date: string;
  text: string;
  author: string;
}

interface RedditFeedResponse {
  generated_at: string;
  subs: { name: string; label: string; topic: RedditFeedItem['sub_topic']; ok: boolean; count: number }[];
  items: RedditFeedItem[];
  warnings: string[];
}

const TOPIC_PILL: Record<RedditFeedItem['sub_topic'], string> = {
  news: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  research: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  'red-team': 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  'blue-team': 'border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
  osint: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  malware: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  help: 'border-slate-300 dark:border-slate-700 text-slate-500',
  scams: 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300',
};

function shortRel(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const diff = Math.max(0, Date.now() - t) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function RedditFirehose(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<RedditFeedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [subFilter, setSubFilter] = useState<Set<string>>(new Set(searchParams.get('sub')?.split(',') ?? []));
  const [newOnly, setNewOnly] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const { previous: lastVisit, markVisited } = useLastVisit('reddit-firehose');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch('/api/v1/reddit-feed')
      .then((r) => {
        if (!r.ok) throw new Error(`upstream ${r.status}`);
        return r.json() as Promise<RedditFeedResponse>;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  useEffect(() => {
    setSearchParams(
      (prev) => {
        const out = new URLSearchParams(prev);
        if (query.trim()) out.set('q', query.trim());
        else out.delete('q');
        if (subFilter.size > 0) out.set('sub', [...subFilter].join(','));
        else out.delete('sub');
        return out;
      },
      { replace: true }
    );
  }, [query, subFilter, setSearchParams]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.items.filter((it) => {
      if (subFilter.size > 0 && !subFilter.has(it.sub)) return false;
      if (newOnly && !isNewSince(it.pub_date, lastVisit)) return false;
      if (!q) return true;
      return it.title.toLowerCase().includes(q) || it.text.toLowerCase().includes(q) || it.author.includes(q);
    });
  }, [data, query, subFilter, newOnly, lastVisit]);

  const newCount = useMemo(() => {
    if (!data || !lastVisit) return 0;
    return data.items.filter((it) => isNewSince(it.pub_date, lastVisit)).length;
  }, [data, lastVisit]);

  useEffect(() => {
    if (!data) return;
    const id = window.setTimeout(markVisited, 1500);
    return () => window.clearTimeout(id);
  }, [data, markVisited]);

  const toggleSub = (sub: string) =>
    setSubFilter((prev) => {
      const next = new Set(prev);
      if (next.has(sub)) next.delete(sub);
      else next.add(sub);
      return next;
    });

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
          <MessageSquare size={28} className="text-brand-600 dark:text-brand-400" /> Cybersec Reddit firehose
        </h1>
        <p className="text-slate-600 dark:text-slate-400 font-mono mb-2 max-w-3xl">
          Curated stream from active public cybersec subreddits. Research, advisories, IR write-ups, malware analysis,
          OSINT, and CTI threads. Same shape as the Telegram firehose. Click a post title to open the Reddit thread.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-500 font-mono mb-6">
          16 subreddits aggregated. Updated frequently.
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by title, body text, or author…"
              className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
              aria-label="Filter Reddit posts"
            />
          </div>
          {newCount > 0 && (
            <button
              type="button"
              onClick={() => setNewOnly((v) => !v)}
              className={`inline-flex items-center gap-1.5 text-xs font-mono px-3 py-2 rounded border ${
                newOnly
                  ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                  : 'border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300 hover:border-emerald-500/60'
              }`}
              title={`${newCount} posts since your last visit${lastVisit ? ` (${new Date(lastVisit).toLocaleString()})` : ''}`}
            >
              <Sparkles size={12} /> {newCount} new
            </button>
          )}
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-2 rounded border border-slate-200 dark:border-slate-800 hover:border-brand-500/40"
          >
            <RefreshCw size={12} /> refresh
          </button>
        </div>
        {data && (
          <div className="flex flex-wrap items-center gap-1.5 mt-3">
            <span className="text-[11px] font-mono text-slate-500 mr-1">subreddits:</span>
            {data.subs.map((s) => {
              const active = subFilter.has(s.name);
              return (
                <button
                  key={s.name}
                  type="button"
                  onClick={() => toggleSub(s.name)}
                  title={s.ok ? `${s.count} posts` : 'feed unreachable'}
                  className={`text-[11px] font-mono px-2 py-1 rounded border ${
                    active
                      ? TOPIC_PILL[s.topic]
                      : s.ok
                        ? 'border-slate-300 dark:border-slate-700 text-slate-500'
                        : 'border-slate-300 dark:border-slate-700 text-slate-400 opacity-50'
                  }`}
                >
                  {s.label} <span className="opacity-70">· {s.count}</span>
                </button>
              );
            })}
            {subFilter.size > 0 && (
              <button
                type="button"
                onClick={() => setSubFilter(new Set())}
                className="text-[11px] font-mono text-brand-600 dark:text-brand-400 hover:underline ml-2"
              >
                clear
              </button>
            )}
          </div>
        )}
      </section>

      {data && (
        <p className="text-[11px] font-mono text-slate-500 mb-4">
          Showing {filtered.length} of {data.items.length} posts · snapshot{' '}
          <span className="text-slate-700 dark:text-slate-300">{shortRel(data.generated_at)}</span>
          {data.warnings.length > 0 && (
            <span className="text-amber-600 dark:text-amber-400 ml-2">· {data.warnings.length} feed warnings</span>
          )}
        </p>
      )}

      {loading && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 flex items-center gap-3 font-mono text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" /> loading subreddit feeds…
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/5 p-4 font-mono text-sm text-rose-600 dark:text-rose-300">
          Failed to load: {error}
        </div>
      )}

      <ul className="space-y-2">
        {filtered.map((it, i) => (
          <li
            key={`${it.link}-${i}`}
            className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3"
          >
            <a href={it.link} target="_blank" rel="noopener noreferrer" className="group block">
              <div className="flex items-baseline justify-between gap-2 mb-1 flex-wrap">
                <span className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100 group-hover:text-brand-600 dark:group-hover:text-brand-400 flex-1 min-w-0">
                  {it.title}
                </span>
                <ExternalLink size={11} className="text-slate-400 shrink-0" />
              </div>
              {it.text && (
                <p className="text-[12px] font-mono text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-2 mb-1.5">
                  {it.text}
                </p>
              )}
              <div className="text-[11px] font-mono text-slate-500 flex items-center gap-2 flex-wrap">
                <span className={`px-1.5 py-0.5 rounded border ${TOPIC_PILL[it.sub_topic]}`}>{it.sub_label}</span>
                <span>by {it.author || '—'}</span>
                <span className="ml-auto text-slate-400" title={it.pub_date}>
                  {shortRel(it.pub_date)}
                </span>
              </div>
            </a>
          </li>
        ))}
      </ul>

      {!loading && !error && filtered.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-sm font-mono text-slate-500">
          {query || subFilter.size > 0 ? 'No posts match the current filter.' : 'No posts in the upstream snapshot.'}
        </div>
      )}
    </div>
  );
}
