import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import { Rss, ChevronRight, ChevronLeft, Search } from 'lucide-react';
import { CopyButton } from '../../components/ui/CopyButton';
import { AiSummaryCard } from '../../components/intel/AiSummaryCard';
import { LiveFreshnessPill } from '../../components/LiveFreshnessPill';
import { useDebounce } from '../../hooks/useDebounce';

type Filter = 'all' | 'daily' | 'weekly' | 'landscape';

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'landscape', label: 'Landscape' },
];

const VALID_FILTERS: ReadonlySet<Filter> = new Set(FILTERS.map((f) => f.id));

interface BriefingMeta {
  type: 'daily' | 'weekly' | 'landscape';
  title: string;
  date: string;
  range_end?: string;
  date_range: string;
  stats: {
    findings: number;
    sections: number;
    cves: number;
    kevs: number;
    iocs: number;
    critical: number;
    high: number;
  };
  sources: string[];
}

interface ListItem {
  slug: string;
  metadata: BriefingMeta;
}

const PAGE_SIZE = 30;

export default function Briefings(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialFilter = (() => {
    const t = searchParams.get('type');
    return t && VALID_FILTERS.has(t as Filter) ? (t as Filter) : 'all';
  })();
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<ListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const activeLimit = Math.min(PAGE_SIZE, 100);
  // Debounce the search so we hit the server on a pause, not per keystroke.
  const debouncedQuery = useDebounce(query, 300);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    // Filter + search server-side so `total` and the page are the same
    // (filtered) universe — the old client-side filter over one 30-row page
    // made the "N of total" pager lie and search miss later pages.
    const params = new URLSearchParams({ limit: String(activeLimit), offset: String(offset) });
    if (filter !== 'all') params.set('type', filter);
    const q = debouncedQuery.trim();
    if (q) params.set('q', q);
    fetch(`/api/v1/briefings/list?${params.toString()}`, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) {
          const body = (await r.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `${r.status}`);
        }
        return (await r.json()) as { items: ListItem[]; total: number };
      })
      .then((d) => {
        if (!mountedRef.current || ctrl.signal.aborted) return;
        setItems(d.items);
        setTotal(d.total);
      })
      .catch((err: Error) => {
        if (err.name === 'AbortError' || !mountedRef.current) return;
        setError(err.message);
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });
    return () => {
      mountedRef.current = false;
      ctrl.abort();
    };
  }, [reloadKey, offset, activeLimit, filter, debouncedQuery]);

  // The server now filters, searches, and sorts (range_end DESC); render the
  // page as-is so the rows and the "N of total" pager agree.
  const filtered = items;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 sm:py-16 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-10 font-mono transition-colors"
      >
        back
      </BackLink>

      <header className="animate-fade-in-up mb-12">
        <span className="inline-block text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-3">
          Intel Briefings
        </span>
        <h1 className="text-4xl sm:text-5xl font-display font-bold mb-4 leading-tight flex items-center gap-3 flex-wrap">
          Threat Intel Briefings
          <LiveFreshnessPill tone="live" />
        </h1>
        <p className="text-base text-muted max-w-2xl leading-relaxed">
          Auto-generated daily and weekly summaries of threat-intelligence activity, drawn from CISA KEV, NVD, and
          abuse.ch / OpenPhish feeds. Daily briefings publish at 00:30 UTC; weekly at 00:45 UTC Monday. Reference only —
          verify all indicators in your own environment. For real-time activity, see the live snapshot on{' '}
          <BackLink to="/threatintel" className="text-brand-600 dark:text-brand-400 hover:underline">
            /threatintel
          </BackLink>
          .
        </p>
      </header>

      {filtered.length > 0 && (
        <AiSummaryCard
          surface="Threat Intel Briefings"
          items={filtered.slice(0, 14).map((b) => ({
            title: b.metadata.title,
            body: `${b.metadata.date_range} · ${b.metadata.stats.findings} findings · ${b.metadata.stats.cves} CVEs · ${b.metadata.stats.kevs} KEVs · ${b.metadata.stats.iocs} IoCs. Sources: ${b.metadata.sources.join(', ')}`,
          }))}
          className="mb-8"
        />
      )}

      {/* Briefings list */}
      <section className="animate-fade-in-up">
        <div className="flex items-baseline justify-between mb-6">
          <h2 className="font-display font-bold text-xl">Briefings</h2>
        </div>

        {/* Search input — wires into the same filtered useMemo as the type
            chips so "lockbit" + Daily narrows by both. Slug, title, and
            date_range are searched so a date fragment ("2026-05") matches. */}
        <div className="relative mb-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOffset(0); // new search → back to page 1 so offset stays valid
            }}
            placeholder="Filter by title, slug, or date (e.g. 2026-05)…"
            aria-label="Filter briefings"
            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
          />
        </div>

        <div className="flex flex-wrap gap-2 mb-8">
          {FILTERS.map(({ id, label }) => {
            const isActive = id === filter;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setFilter(id);
                  setOffset(0); // new filter → back to page 1
                  setSearchParams(id === 'all' ? {} : { type: id }, { replace: true });
                }}
                className={`px-3 py-2 sm:py-1 min-h-[44px] sm:min-h-0 rounded-full text-xs font-mono uppercase tracking-wider border transition-colors inline-flex items-center ${
                  isActive
                    ? 'bg-brand-500/15 dark:bg-brand-400/15 text-brand-600 dark:text-brand-400 border-brand-500/40'
                    : 'bg-white dark:bg-[rgb(var(--surface-200))] text-muted border-slate-200 dark:border-[rgb(var(--border-400))] hover:border-brand-500/30'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {loading && (
          <div className="space-y-4" aria-busy="true" aria-label="Loading briefings">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-6 animate-pulse"
              >
                <div className="h-4 bg-slate-200 dark:bg-[rgb(var(--surface-300))] rounded w-1/2 mb-2" />
                <div className="h-3 bg-slate-200 dark:bg-[rgb(var(--surface-300))] rounded w-1/4 mb-4" />
                <div className="h-3 bg-slate-200 dark:bg-[rgb(var(--surface-300))] rounded w-3/4" />
              </div>
            ))}
          </div>
        )}
        {error && (
          <div
            role="alert"
            className="rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50/50 dark:bg-rose-900/15 p-6 flex items-start justify-between gap-3"
          >
            <div className="text-sm font-mono text-rose-700 dark:text-rose-300">
              <span className="font-semibold">error:</span> {error}
            </div>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="shrink-0 text-xs font-mono px-3 py-1.5 rounded border border-rose-400/60 text-rose-700 dark:text-rose-300 hover:bg-rose-500/10"
            >
              retry
            </button>
          </div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <p className="text-sm font-mono text-slate-500 py-10 text-center">
            {filter === 'all' && !debouncedQuery.trim()
              ? 'No briefings indexed. Dailies publish 00:30 UTC; weeklies 00:45 UTC Monday.'
              : 'No briefings match the current filter.'}
          </p>
        )}

        <div className="flex items-center justify-between py-3 text-xs font-mono text-slate-500">
          <span>{total > 0 ? `${offset + 1}–${Math.min(offset + activeLimit, total)} of ${total}` : '—'}</span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - activeLimit))}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] disabled:opacity-30 hover:border-brand-500/40 transition-colors"
            >
              <ChevronLeft size={12} /> Prev
            </button>
            <button
              type="button"
              disabled={offset + activeLimit >= total}
              onClick={() => setOffset(offset + activeLimit)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] disabled:opacity-30 hover:border-brand-500/40 transition-colors"
            >
              Next <ChevronRight size={12} />
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {filtered.map((item) => (
            <Link
              key={item.slug}
              to={`/threatintel/briefings/${item.slug}`}
              className="block rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-6 hover:border-brand-500/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-4 mb-2">
                <div className="min-w-0">
                  <h3 className="font-display font-bold text-lg leading-snug">{item.metadata.title}</h3>
                  <p className="text-xs font-mono text-slate-500 mt-0.5">{item.metadata.date_range}</p>
                </div>
                <span
                  className={`text-xs font-mono px-2 py-0.5 rounded border shrink-0 ${
                    item.metadata.type === 'daily'
                      ? 'bg-brand-500/15 dark:bg-brand-400/15 text-brand-600 dark:text-brand-400 border-brand-500/40'
                      : item.metadata.type === 'weekly'
                        ? 'bg-violet-500/15 dark:bg-violet-400/15 text-violet-600 dark:text-violet-400 border-violet-500/40'
                        : 'bg-amber-500/15 dark:bg-amber-400/15 text-amber-700 dark:text-amber-300 border-amber-500/40'
                  }`}
                >
                  {item.metadata.type}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono text-slate-500 min-w-0 flex-1">
                  <span>
                    <span className="text-slate-800 dark:text-slate-200 font-semibold">
                      {item.metadata.stats.findings}
                    </span>{' '}
                    findings
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    <span className="text-slate-800 dark:text-slate-200 font-semibold">{item.metadata.stats.cves}</span>{' '}
                    CVEs
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    <span className="text-brand-600 dark:text-brand-400 font-semibold">
                      {item.metadata.stats.iocs ?? 0}
                    </span>{' '}
                    IOCs
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    <span className="text-rose-600 dark:text-rose-400 font-semibold">
                      {item.metadata.stats.critical}
                    </span>{' '}
                    critical
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    <span className="text-orange-600 dark:text-orange-400 font-semibold">
                      {item.metadata.stats.high}
                    </span>{' '}
                    high
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="text-slate-500 truncate w-full sm:w-auto sm:max-w-md">
                    {(item.metadata.sources ?? []).join(', ')}
                  </span>
                </div>
                <ChevronRight size={14} className="text-slate-400 shrink-0" />
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                <a
                  href={`https://x.com/intent/tweet?text=${encodeURIComponent(item.metadata.title)}&url=${encodeURIComponent(`${window.location.origin}/threatintel/briefings/${item.slug}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] px-2 py-0.5 text-micro text-slate-500 hover:text-brand-600 dark:hover:text-brand-400 hover:border-brand-500/40 transition-colors"
                  title="Share on X"
                >
                  <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor" aria-hidden="true">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  <span className="sr-only">Share on X</span>
                </a>
                <a
                  href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(`${window.location.origin}/threatintel/briefings/${item.slug}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] px-2 py-0.5 text-micro text-slate-500 hover:text-brand-600 dark:hover:text-brand-400 hover:border-brand-500/40 transition-colors"
                  title="Share on LinkedIn"
                >
                  <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor" aria-hidden="true">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                  </svg>
                  <span className="sr-only">Share on LinkedIn</span>
                </a>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <div className="mt-16 flex items-center gap-3 p-4 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--surface-200))]/60">
        <Rss size={16} className="text-slate-400 shrink-0" />
        <p className="text-sm font-mono text-slate-500 flex-1">
          Subscribe in your reader.{' '}
          <a
            href="/api/v1/briefings/rss"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            RSS 2.0 feed
          </a>{' '}
          — last 10 briefings.
        </p>
        <CopyButton
          text={`${window.location.origin}/api/v1/briefings/rss`}
          variant="ghost"
          size="sm"
          label="Copy feed URL"
          className="shrink-0"
        />
      </div>
    </div>
  );
}
