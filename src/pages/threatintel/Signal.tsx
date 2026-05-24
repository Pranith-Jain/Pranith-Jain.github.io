import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Radio, ExternalLink, RefreshCw, Search } from 'lucide-react';
import { BackLink } from '../../components/BackLink';
import { DataState } from '../../components/DataState';
import { FeedAggregateCard } from '../../components/intel/FeedAggregateCard';
import { XLivePanel } from '../../components/threatintel/XLivePanel';

/**
 * /threatintel/signal — the high-signal subset of /threatintel/writeups.
 *
 * The writeups endpoint aggregates ~30 RSS feeds across vendor labs,
 * independent researchers, and the Medium long-tail. That's the firehose.
 * This page asks for `?tier=signal`, which the server filters down to a
 * tight curated set (ThreatSignal, DFIR Report, SentinelLabs, Unit 42,
 * Check Point, Huntress, Eye, Exodus, OpenAnalysis, BushidoToken,
 * DoublePulsar). Low-volume sources, high-depth pieces — the kind of
 * source an analyst reads every time it ships.
 *
 * Same API contract as /writeups; tier filter is a server-side filter on
 * the already-cached firehose response so flipping between tiers doesn't
 * re-fetch upstream.
 */

interface Writeup {
  title: string;
  url: string;
  source: string;
  published?: string;
  description?: string;
  tags?: string[];
  author?: string;
  kind: 'medium' | 'devto' | 'hashnode' | 'rss' | 'manual';
}

interface SignalResponse {
  generated_at: string;
  sources: Array<{ kind: string; label: string; ok: boolean; count: number; error?: string }>;
  total: number;
  items: Writeup[];
}

function formatDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function shortRel(iso?: string): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const diff = Math.max(0, Date.now() - t) / 1000;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / (86400 * 7))}w ago`;
  return `${Math.floor(diff / (86400 * 30))}mo ago`;
}

export default function Signal(): JSX.Element {
  const [data, setData] = useState<SignalResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<Set<string>>(new Set());
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch('/api/v1/writeups?tier=signal')
      .then((r) => {
        if (!r.ok) throw new Error(`upstream ${r.status}`);
        return r.json() as Promise<SignalResponse>;
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

  const filtered = useMemo(() => {
    if (!data) return [] as Writeup[];
    const q = query.trim().toLowerCase();
    return data.items.filter((it) => {
      if (sourceFilter.size > 0 && !sourceFilter.has(it.source)) return false;
      if (!q) return true;
      return (
        it.title.toLowerCase().includes(q) ||
        (it.description ?? '').toLowerCase().includes(q) ||
        it.source.toLowerCase().includes(q) ||
        (it.tags ?? []).some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [data, query, sourceFilter]);

  const sourceCounts = useMemo(() => {
    const m = new Map<string, number>();
    if (!data) return m;
    for (const it of data.items) m.set(it.source, (m.get(it.source) ?? 0) + 1);
    return m;
  }, [data]);

  const toggleSource = (s: string) =>
    setSourceFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-6 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-6 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 flex items-center gap-3">
        <Radio size={28} className="text-brand-600 dark:text-brand-400" /> Research Signal
      </h1>
      <p className="text-slate-600 dark:text-slate-400 mb-1 max-w-3xl leading-relaxed">
        Curated set of vendor labs and independent research outlets. ThreatSignal Research, The DFIR Report,
        SentinelLabs, Unit 42, Check Point Research, Huntress, Eye Security, Exodus, OpenAnalysis, BushidoToken,
        DoublePulsar. Low-volume sources, longer-form pieces.
      </p>
      <p className="text-[12px] text-slate-500 dark:text-slate-400 font-mono mb-6">
        For the full ecosystem cut (including Medium tag feeds and the long tail), see{' '}
        <Link to="/threatintel/writeups" className="text-brand-600 dark:text-brand-400 hover:underline">
          /threatintel/writeups
        </Link>
        .
      </p>

      {/* Aggregate STIX 2.1 intel card for the current curated cut. Pools
          titles + descriptions from the filtered set into one bundle so the
          page surfaces today's actors / malware / CVEs / IoCs at a glance. */}
      {filtered.length > 0 && (
        <FeedAggregateCard
          sourceId="rss:signal"
          sourceName="Research Signal"
          title="Research Signal · today"
          items={filtered.map((it) => ({
            title: it.title,
            body: `${it.source} · ${it.description ?? ''}`,
          }))}
        />
      )}

      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by title, source, tag, or summary…"
              className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
              aria-label="Filter research signal"
            />
          </div>
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            className="text-[11px] font-mono px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 hover:border-brand-500/40 inline-flex items-center gap-1"
          >
            <RefreshCw size={11} /> refresh
          </button>
        </div>
        {sourceCounts.size > 1 && (
          <div className="flex flex-wrap items-center gap-1.5 mt-3">
            <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-slate-500 mr-1">sources:</span>
            {Array.from(sourceCounts.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([src, count]) => {
                const active = sourceFilter.has(src);
                return (
                  <button
                    key={src}
                    type="button"
                    onClick={() => toggleSource(src)}
                    className={`text-[11px] font-mono px-2 py-1 rounded border ${
                      active
                        ? 'border-brand-500/60 bg-brand-500/10 text-brand-700 dark:text-brand-300'
                        : 'border-slate-300 dark:border-slate-700 text-slate-500 hover:border-brand-500/40'
                    }`}
                  >
                    {src} <span className="opacity-70">· {count}</span>
                  </button>
                );
              })}
            {(sourceFilter.size > 0 || query.trim()) && (
              <button
                type="button"
                onClick={() => {
                  setSourceFilter(new Set());
                  setQuery('');
                }}
                className="text-[11px] font-mono text-brand-600 dark:text-brand-400 hover:underline ml-1"
              >
                clear
              </button>
            )}
          </div>
        )}
        {data && (
          <p className="text-[11px] font-mono text-slate-500 mt-3">
            Showing <span className="text-slate-700 dark:text-slate-300">{filtered.length}</span> of{' '}
            <span className="text-slate-700 dark:text-slate-300">{data.total}</span> · {data.sources.length} sources ·
            snapshot {new Date(data.generated_at).toLocaleString()}
          </p>
        )}
      </section>

      <DataState
        loading={loading}
        error={error}
        empty={filtered.length === 0}
        emptyLabel={
          query.trim() || sourceFilter.size > 0
            ? 'No items match the current filter.'
            : 'No items in the snapshot. Feed refreshes hourly — click refresh to re-pull.'
        }
        onRetry={() => setRefreshKey((k) => k + 1)}
        rows={6}
      >
        <ul className="space-y-3">
          {filtered.map((it) => (
            <li
              key={it.url}
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4"
            >
              <a href={it.url} target="_blank" rel="noopener noreferrer" className="group block">
                <div className="flex items-baseline justify-between gap-3 mb-1.5">
                  <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400">
                    {it.source}
                  </span>
                  <span className="text-[10px] font-mono text-slate-500 shrink-0" title={formatDate(it.published)}>
                    {shortRel(it.published)}
                  </span>
                </div>
                <h2 className="font-display font-semibold text-base text-slate-900 dark:text-white leading-snug group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                  {it.title}
                  <ExternalLink size={12} className="inline-block ml-1 opacity-50" aria-hidden="true" />
                </h2>
                {it.description && (
                  <p className="text-[13px] text-slate-600 dark:text-slate-400 leading-relaxed mt-1.5 line-clamp-2">
                    {it.description}
                  </p>
                )}
              </a>
              {(it.tags?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {it.tags!.slice(0, 6).map((t) => (
                    <span
                      key={t}
                      className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-800 text-slate-500"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      </DataState>

      <div className="mt-8">
        <XLivePanel sinceHours={24} limit={10} title="X firehose · cybersec (last 24h)" />
      </div>
    </div>
  );
}
