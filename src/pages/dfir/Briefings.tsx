import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, Rss, ChevronRight, ChevronLeft, Search } from 'lucide-react';
import { AiSummaryCard } from '../../components/intel/AiSummaryCard';
import { LiveFreshnessPill } from '../../components/LiveFreshnessPill';

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

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/v1/briefings/list?limit=${activeLimit}&offset=${offset}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = (await r.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `${r.status}`);
        }
        return (await r.json()) as { items: ListItem[]; total: number };
      })
      .then((d) => {
        setItems(d.items);
        setTotal(d.total);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [reloadKey, offset, activeLimit]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((b) => filter === 'all' || b.metadata.type === filter)
      .filter((b) => {
        if (!q) return true;
        return (
          b.slug.toLowerCase().includes(q) ||
          b.metadata.title.toLowerCase().includes(q) ||
          b.metadata.date_range.toLowerCase().includes(q)
        );
      })
      .slice()
      .sort((a, b) => {
        // Sort by end-of-period so weeklies and dailies interleave correctly.
        const ak = a.metadata.range_end ?? a.metadata.date ?? '';
        const bk = b.metadata.range_end ?? b.metadata.date ?? '';
        return bk.localeCompare(ak);
      });
  }, [items, filter, query]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 sm:py-16 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-10 font-mono transition-colors"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <header className="animate-fade-in-up mb-12">
        <span className="inline-block text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 mb-3">
          Intel Briefings
        </span>
        <h1 className="text-4xl sm:text-5xl font-display font-bold mb-4 leading-tight flex items-center gap-3 flex-wrap">
          Threat Intel Briefings
          <LiveFreshnessPill tone="live" />
        </h1>
        <p className="text-base text-slate-600 dark:text-slate-400 max-w-2xl leading-relaxed">
          Auto-generated daily and weekly summaries of threat-intelligence activity, drawn from CISA KEV, NVD, and
          abuse.ch / OpenPhish feeds. Daily briefings publish at 00:05 UTC; weekly at 00:15 UTC Monday. Reference only —
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
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by title, slug, or date (e.g. 2026-05)…"
            aria-label="Filter briefings"
            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
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
                  setSearchParams(id === 'all' ? {} : { type: id }, { replace: true });
                }}
                className={`px-3 py-2 sm:py-1 min-h-[44px] sm:min-h-0 rounded-full text-xs font-mono uppercase tracking-wider border transition-colors inline-flex items-center ${
                  isActive
                    ? 'bg-brand-500/15 dark:bg-brand-400/15 text-brand-600 dark:text-brand-400 border-brand-500/40'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-brand-500/30'
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
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 animate-pulse"
              >
                <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/2 mb-2" />
                <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-1/4 mb-4" />
                <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-3/4" />
              </div>
            ))}
          </div>
        )}
        {error && (
          <div
            role="alert"
            className="rounded-2xl border border-rose-300 dark:border-rose-800 bg-rose-50/50 dark:bg-rose-900/15 p-6 flex items-start justify-between gap-3"
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
            {items.length === 0
              ? 'No briefings indexed. Dailies publish 00:05 UTC; weeklies 00:15 UTC Monday.'
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
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 disabled:opacity-30 hover:border-brand-500/40 transition-colors"
            >
              <ChevronLeft size={12} /> Prev
            </button>
            <button
              type="button"
              disabled={offset + activeLimit >= total}
              onClick={() => setOffset(offset + activeLimit)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 disabled:opacity-30 hover:border-brand-500/40 transition-colors"
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
              className="block rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 hover:border-brand-500/40 transition-colors"
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
            </Link>
          ))}
        </div>
      </section>

      <div className="mt-16 flex items-center gap-3 p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
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
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(`${window.location.origin}/api/v1/briefings/rss`);
          }}
          className="text-[11px] font-mono text-brand-600 dark:text-brand-400 hover:underline shrink-0"
          title="Copy feed URL"
        >
          copy URL
        </button>
      </div>
    </div>
  );
}
