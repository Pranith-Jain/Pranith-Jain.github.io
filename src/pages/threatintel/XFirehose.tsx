import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, AtSign, Cloud, ExternalLink, Loader2, RefreshCw, Search, Sparkles } from 'lucide-react';
import { useLastVisit, isNewSince } from '../../hooks';

type Platform = 'bluesky' | 'mastodon';

interface XFeedItem {
  handle: string;
  handle_name: string;
  handle_topic: 'research' | 'news' | 'vendor' | 'gov' | 'malware';
  handle_blurb: string;
  platform: Platform;
  text: string;
  link: string;
  pub_date: string;
}

interface XFeedResponse {
  generated_at: string;
  handles: {
    handle: string;
    name: string;
    platform: Platform;
    topic: XFeedItem['handle_topic'];
    ok: boolean;
    count: number;
  }[];
  items: XFeedItem[];
  warnings: string[];
}

const TOPIC_PILL: Record<XFeedItem['handle_topic'], string> = {
  research: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  news: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  vendor: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  gov: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  malware: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
};

function shortRel(rfc822: string): string {
  const t = Date.parse(rfc822);
  if (Number.isNaN(t)) return '';
  const diff = Math.max(0, Date.now() - t) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function XFirehose(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<XFeedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [handleFilter, setHandleFilter] = useState<Set<string>>(new Set(searchParams.get('h')?.split(',') ?? []));
  const [newOnly, setNewOnly] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const { previous: lastVisit, markVisited } = useLastVisit('x-firehose');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch('/api/v1/x-feed')
      .then((r) => {
        if (!r.ok) throw new Error(`upstream ${r.status}`);
        return r.json() as Promise<XFeedResponse>;
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
        if (handleFilter.size > 0) out.set('h', [...handleFilter].join(','));
        else out.delete('h');
        return out;
      },
      { replace: true }
    );
  }, [query, handleFilter, setSearchParams]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.items.filter((it) => {
      if (handleFilter.size > 0 && !handleFilter.has(it.handle)) return false;
      if (newOnly && !isNewSince(it.pub_date, lastVisit)) return false;
      if (!q) return true;
      return it.text.toLowerCase().includes(q) || it.handle.toLowerCase().includes(q);
    });
  }, [data, query, handleFilter, newOnly, lastVisit]);

  const newCount = useMemo(() => {
    if (!data || !lastVisit) return 0;
    return data.items.filter((it) => isNewSince(it.pub_date, lastVisit)).length;
  }, [data, lastVisit]);

  useEffect(() => {
    if (!data) return;
    const id = window.setTimeout(markVisited, 1500);
    return () => window.clearTimeout(id);
  }, [data, markVisited]);

  const toggleHandle = (h: string) =>
    setHandleFilter((prev) => {
      const next = new Set(prev);
      if (next.has(h)) next.delete(h);
      else next.add(h);
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
          <Cloud size={28} className="text-brand-600 dark:text-brand-400" /> Cybersec social firehose
        </h1>
        <p className="text-slate-600 dark:text-slate-400 font-mono mb-2 max-w-3xl">
          Curated stream from cybersec researchers and vendor labs on <strong>Bluesky</strong> and{' '}
          <strong>Mastodon (infosec.exchange)</strong>. X killed its free read API in 2023 and the available Nitter
          mirrors are unreliable, so most of these accounts have a mirror on Bluesky or Mastodon. Both expose proper
          keyless RSS. Click any post to open the original.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-500 font-mono mb-6">
          {data ? `${data.handles.length} accounts indexed.` : '~16 accounts indexed.'}
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
              placeholder="Filter by tweet text or handle…"
              className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
              aria-label="Filter X posts"
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
            <span className="text-[11px] font-mono text-slate-500 mr-1">handles:</span>
            {data.handles.map((h) => {
              const active = handleFilter.has(h.handle);
              const platformGlyph = h.platform === 'bluesky' ? '🦋' : '🐘';
              return (
                <button
                  key={h.handle}
                  type="button"
                  onClick={() => toggleHandle(h.handle)}
                  title={
                    h.ok
                      ? `${h.count} posts · ${h.platform} · ${h.name}`
                      : `${h.platform} fetch failed. See warning count.`
                  }
                  className={`text-[11px] font-mono px-2 py-1 rounded border ${
                    active
                      ? TOPIC_PILL[h.topic]
                      : h.ok
                        ? 'border-slate-300 dark:border-slate-700 text-slate-500'
                        : 'border-slate-300 dark:border-slate-700 text-slate-400 opacity-50'
                  }`}
                >
                  {platformGlyph} {h.name.length > 18 ? h.name.slice(0, 18) + '…' : h.name}{' '}
                  <span className="opacity-70">· {h.count}</span>
                </button>
              );
            })}
            {handleFilter.size > 0 && (
              <button
                type="button"
                onClick={() => setHandleFilter(new Set())}
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
          Showing {filtered.length} of {data.items.length} tweets · snapshot{' '}
          <span className="text-slate-700 dark:text-slate-300">{shortRel(data.generated_at)}</span>
          {data.warnings.length > 0 && (
            <span className="text-amber-600 dark:text-amber-400 ml-2">· {data.warnings.length} handle warnings</span>
          )}
        </p>
      )}

      {loading && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 flex items-center gap-3 font-mono text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" /> loading via Nitter mirrors…
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
                <span className="font-mono text-[12px] text-brand-600 dark:text-brand-400 inline-flex items-center gap-1">
                  <span aria-hidden="true">{it.platform === 'bluesky' ? '🦋' : '🐘'}</span>
                  {it.handle_name}{' '}
                  <span
                    className={`px-1.5 py-0.5 rounded border text-[9px] uppercase tracking-wider ${TOPIC_PILL[it.handle_topic]}`}
                  >
                    {it.handle_topic}
                  </span>
                </span>
                <ExternalLink size={11} className="text-slate-400 shrink-0" />
              </div>
              <p className="text-[13px] text-slate-900 dark:text-slate-100 group-hover:text-brand-600 dark:group-hover:text-brand-400 leading-relaxed mb-1.5 whitespace-pre-line">
                {it.text}
              </p>
              <div className="text-[10px] font-mono text-slate-500 flex items-center gap-2 flex-wrap">
                <AtSign size={9} className="text-slate-400" />
                <span>{it.handle}</span>
                <span className="ml-auto text-slate-400" title={it.pub_date}>
                  {shortRel(it.pub_date)}
                </span>
              </div>
            </a>
          </li>
        ))}
      </ul>

      {!loading && !error && filtered.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-6 text-sm font-mono text-slate-500">
          {query || handleFilter.size > 0 ? (
            <p className="text-center">No posts match the current filter.</p>
          ) : (
            <>
              <p className="mb-3 text-center">
                No posts in the upstream snapshot. Bluesky or Mastodon may have returned empty for the curated handle
                set this hour. Try refresh, or follow the accounts directly:
              </p>
              <ul className="flex flex-wrap justify-center gap-2 mt-3">
                {(data?.handles ?? []).map((h) => {
                  const url =
                    h.platform === 'bluesky'
                      ? `https://bsky.app/profile/${h.handle}`
                      : `https://infosec.exchange/@${h.handle}`;
                  return (
                    <li key={`${h.platform}-${h.handle}`}>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-flex items-center gap-1 text-[11px] font-mono px-2 py-1 rounded border ${TOPIC_PILL[h.topic]} hover:opacity-90`}
                      >
                        {h.platform === 'bluesky' ? '🦋' : '🐘'} {h.name} <ExternalLink size={10} />
                      </a>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
