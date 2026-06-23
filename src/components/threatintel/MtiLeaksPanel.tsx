import { useEffect, useMemo, useState } from 'react';
import { Database, ExternalLink, Loader2, Search, RefreshCw } from 'lucide-react';

/**
 * MyThreatIntel leaks panel for /threatintel/breach-disclosures.
 *
 * Different signal from HIBP: HIBP catalogues canonical, dedupped public
 * breach disclosures with the data classes that were exposed. MTI leaks
 * is the rawer firehose of actively-traded leak listings (think:
 * forum-posted dumps, scraped databases, sale listings), with size and
 * first-seen date but no DataClasses or pwn_count. Side by side, the
 * two answer different IR questions:
 *
 *   HIBP        : "is THIS organisation's breach already publicly known?"
 *   MTI leaks   : "what's being actively shopped this week?"
 *
 * Fetches 200 records (the proxy's default cap; upstream carries ~5,500
 * historical records). Search is local; sort toggles between date and
 * size. Failure mode: panel collapses to a one-line error and the rest
 * of the page (HIBP + breach news) still renders.
 */

interface MtiLeakRow {
  name?: string;
  url?: string;
  size?: string;
  date?: string;
  type?: string;
  ingested_at?: string;
}

interface MtiResp {
  generated_at?: string;
  total?: number;
  count?: number;
  items?: MtiLeakRow[];
}

/**
 * Parse upstream's free-text size string (e.g. "348.69 M", "2.3 G",
 * "412 K") into bytes. Used only for the size-sort ordering — the
 * display always renders the upstream string verbatim. Unknown
 * formats return -1 so they sink to the bottom of the size sort.
 */
function parseSize(s?: string): number {
  if (!s) return -1;
  const m = /([0-9]*\.?[0-9]+)\s*([KMGT])?B?/i.exec(s.trim());
  if (!m) return -1;
  const n = parseFloat(m[1]!);
  if (!Number.isFinite(n)) return -1;
  const unit = (m[2] ?? '').toUpperCase();
  switch (unit) {
    case 'K':
      return n * 1024;
    case 'M':
      return n * 1024 ** 2;
    case 'G':
      return n * 1024 ** 3;
    case 'T':
      return n * 1024 ** 4;
    default:
      return n;
  }
}

function shortRel(iso?: string): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso ?? '';
  const diff = Math.max(0, Date.now() - t) / 1000;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 86400 * 365) return `${Math.floor(diff / (86400 * 30))}mo ago`;
  return `${Math.floor(diff / (86400 * 365))}y ago`;
}

type SortMode = 'date' | 'size';

export function MtiLeaksPanel(): JSX.Element {
  const [data, setData] = useState<MtiResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortMode>('date');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch('/api/v1/mti?source=leaks&limit=200')
      .then((r) => {
        if (!r.ok) throw new Error(`upstream ${r.status}`);
        return r.json() as Promise<MtiResp>;
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
    const items = data?.items ?? [];
    const q = query.trim().toLowerCase();
    const matches = q
      ? items.filter(
          (i) =>
            (i.name ?? '').toLowerCase().includes(q) ||
            (i.url ?? '').toLowerCase().includes(q) ||
            (i.type ?? '').toLowerCase().includes(q)
        )
      : items;
    return [...matches].sort((a, b) => {
      if (sortBy === 'size') {
        return parseSize(b.size) - parseSize(a.size);
      }
      const at = Date.parse(a.date ?? a.ingested_at ?? '') || 0;
      const bt = Date.parse(b.date ?? b.ingested_at ?? '') || 0;
      return bt - at;
    });
  }, [data, query, sortBy]);

  return (
    <section className="mb-10 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
        <h2 className="font-display font-bold text-xl inline-flex items-center gap-2">
          <Database size={20} className="text-brand-600 dark:text-brand-400" /> Active leak listings
          <span className="text-mini font-mono uppercase tracking-[0.18em] text-slate-500">via MyThreatIntel</span>
        </h2>
        <span className="text-mini font-mono text-slate-500">
          {loading
            ? 'loading…'
            : data
              ? `${filtered.length} of ${data.count?.toLocaleString() ?? '0'} shown · ${data.total?.toLocaleString() ?? '0'} indexed upstream`
              : ''}
        </span>
      </div>
      <p className="text-tool text-muted leading-relaxed mb-4 max-w-3xl">
        What's actively being shopped or scraped this week. Different signal from the HIBP corpus below: this catches
        listings before they get canonicalised into "official" breach records, with the data dump size and first-seen
        timestamp. Records here may turn into HIBP entries later, or never (if the dump is fake, retired, or re-claimed
        under a different name).
      </p>

      <div className="flex flex-wrap gap-2 items-center mb-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name, URL, or type…"
            className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
            aria-label="Filter MTI leaks"
          />
        </div>
        <div
          role="group"
          aria-label="Sort mode"
          className="inline-flex rounded border border-slate-200 dark:border-[rgb(var(--border-400))] overflow-hidden text-mini font-mono"
        >
          {(['date', 'size'] as SortMode[]).map((m) => {
            const active = m === sortBy;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setSortBy(m)}
                aria-pressed={active}
                className={`px-2.5 py-1.5 transition-colors ${
                  active
                    ? 'bg-brand-500/15 text-brand-700 dark:text-brand-300'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {m === 'date' ? 'newest' : 'biggest'}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setRefreshKey((k) => k + 1)}
          className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-2 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40"
        >
          <RefreshCw size={11} /> refresh
        </button>
      </div>

      {loading && (
        <div className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-3 inline-flex items-center gap-2 font-mono text-sm text-slate-500">
          <Loader2 size={14} className="animate-spin" /> loading MyThreatIntel leaks feed…
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/5 p-3 font-mono text-sm text-rose-600 dark:text-rose-300">
          Error loading MTI leaks: {error}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <p className="text-sm font-mono text-slate-500 italic">
          {query ? 'No leaks match the current filter.' : 'No leaks returned from upstream.'}
        </p>
      )}

      {!loading && !error && filtered.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {filtered.slice(0, 60).map((it, i) => {
            const date = it.date ?? it.ingested_at;
            const safeUrl = (() => {
              const u = it.url ?? '';
              if (!u || u === 'N/D') return null;
              if (!/^https?:\/\//i.test(u)) return `https://${u}`;
              return u;
            })();
            return (
              <li
                key={`${it.name ?? 'unknown'}-${i}`}
                className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50/40 dark:bg-[rgb(var(--input-200)/0.4)] p-3"
              >
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <span className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100 truncate flex-1">
                    {it.name ?? '(no name)'}
                  </span>
                  {it.size && it.size !== 'N/D' && (
                    <span className="font-mono text-mini text-brand-600 dark:text-brand-400 shrink-0">{it.size}</span>
                  )}
                </div>
                <div className="text-mini font-mono text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  {it.type && it.type !== 'leak' && it.type !== 'N/D' && (
                    <span className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))]">
                      {it.type}
                    </span>
                  )}
                  {date && <span>first seen {shortRel(date)}</span>}
                  {safeUrl && (
                    <a
                      href={safeUrl}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
                      title={safeUrl}
                    >
                      source <ExternalLink size={9} aria-hidden="true" />
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {!loading && !error && filtered.length > 60 && (
        <p className="mt-3 text-mini font-mono text-slate-500">
          Showing first 60 of {filtered.length} matches. Narrow the filter to see deeper.
        </p>
      )}
    </section>
  );
}
