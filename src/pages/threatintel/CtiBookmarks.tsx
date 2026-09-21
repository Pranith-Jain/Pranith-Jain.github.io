import { useEffect, useMemo, useState } from 'react';
import { BookMarked, ExternalLink, RefreshCw } from 'lucide-react';
import { DataPageLayout } from '../../components/DataPageLayout';

interface CtiBookmark {
  slug: string;
  name: string;
  url: string;
  host: string;
  level: string;
  category: string;
  description: string;
  status: 'live' | 'reference' | 'missing';
  platformRef: string | null;
  tags: string[];
}

interface CtiBookmarksResponse {
  count: number;
  total: number;
  bookmarks: CtiBookmark[];
}

interface CtiStats {
  total: number;
  levels: string[];
  statusCounts: Record<string, number>;
  source: string;
  replicatedAt: string;
}

const STATUS_BADGE: Record<string, string> = {
  live: 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700',
  reference:
    'bg-slate-100 dark:bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700',
  missing:
    'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700',
};

export default function CtiBookmarks(): JSX.Element {
  const [data, setData] = useState<CtiBookmarksResponse | null>(null);
  const [stats, setStats] = useState<CtiStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'live' | 'reference' | 'missing'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();

    setLoading(true);
    setError(null);
    const opts = { signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(15_000)]) };
    Promise.all([
      fetch('/api/v1/cti-bookmarks?limit=500', opts).then((r) =>
        r.ok ? (r.json() as Promise<CtiBookmarksResponse>) : Promise.reject(new Error(`HTTP ${r.status}`))
      ),
      fetch('/api/v1/cti-bookmarks/stats', opts).then((r) =>
        r.ok ? (r.json() as Promise<CtiStats>) : Promise.reject(new Error(`HTTP ${r.status}`))
      ),
    ])
      .then(([bookmarks, s]) => {
        if (cancelled) return;
        setData(bookmarks);
        setStats(s);
      })
      .catch((e: { name?: string; message?: string }) => {
        if (cancelled || e.name === 'AbortError') return;
        setError(e.message ?? 'fetch failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [refreshKey]);

  const levels = useMemo(() => {
    if (!data?.bookmarks) return [];
    return Array.from(new Set(data.bookmarks.map((b) => b.level))).sort();
  }, [data]);

  const categories = useMemo(() => {
    if (!data?.bookmarks) return [];
    const scope = levelFilter ? data.bookmarks.filter((b) => b.level === levelFilter) : data.bookmarks;
    return Array.from(new Set(scope.map((b) => b.category))).sort();
  }, [data, levelFilter]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.bookmarks.filter((b) => {
      if (levelFilter && b.level !== levelFilter) return false;
      if (categoryFilter && b.category !== categoryFilter) return false;
      if (statusFilter !== 'all' && b.status !== statusFilter) return false;
      if (!q) return true;
      const hay = `${b.name} ${b.description} ${b.category} ${b.host} ${b.tags.join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  }, [data, query, levelFilter, categoryFilter, statusFilter]);

  return (
    <DataPageLayout
      backTo="/threatintel"
      backLabel="back to threat intel"
      icon={<BookMarked className="h-6 w-6" />}
      title="CTI Bookmarks"
      description="387 curated open-source CTI links (Operational / Tactical / Strategic / Tools) from Chick3nHawk01/Open_Source-CTI-Tooling. Green = live platform integration, amber = missing integration (gap tracker), grey = reference link."
      headerExtra={
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            className="inline-flex items-center gap-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] px-2 py-1 text-muted hover:border-rose-500/50 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" /> refresh
          </button>
          {stats && (
            <>
              <span className="rounded border border-slate-300 dark:border-[rgb(var(--border-400))] px-2 py-1 text-muted font-mono">
                {stats.total} links
              </span>
              <span className="rounded border border-emerald-300 dark:border-emerald-700 px-2 py-1 font-mono text-emerald-700 dark:text-emerald-400">
                live {stats.statusCounts.live ?? 0}
              </span>
              <span className="rounded border border-amber-300 dark:border-amber-700 px-2 py-1 font-mono text-amber-700 dark:text-amber-400">
                missing {stats.statusCounts.missing ?? 0}
              </span>
            </>
          )}
        </div>
      }
      loading={loading}
      error={error}
      onRetry={() => setRefreshKey((k) => k + 1)}
      empty={!loading && !data}
      emptyMessage="No bookmark data available."
      maxWidthClass="max-w-6xl"
    >
      {data && (
        <>
          <section className="surface-card p-4 mb-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1">
                <BookMarked className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Search ${data.total} bookmarks…`}
                  className="w-full rounded-xl border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--input-200))] py-2 pl-9 pr-3 text-sm text-heading placeholder:text-slate-400 focus:border-rose-500/60 focus:outline-none"
                />
              </div>
              <div className="flex gap-2">
                {(['all', 'live', 'missing', 'reference'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setStatusFilter(v)}
                    className={`text-mini font-mono rounded border px-2.5 py-1 transition-colors ${
                      statusFilter === v
                        ? 'border-rose-500/50 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400'
                        : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-muted hover:border-rose-500/50 hover:text-rose-600 dark:hover:text-rose-400'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {levels.map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => {
                    setLevelFilter(lvl === levelFilter ? null : lvl);
                    setCategoryFilter(null);
                  }}
                  className={`text-micro font-mono rounded-full border px-2.5 py-0.5 transition-colors ${
                    levelFilter === lvl
                      ? 'border-rose-500/50 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400'
                      : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-muted hover:border-rose-500/50 hover:text-rose-600 dark:hover:text-rose-400'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
            {categories.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(cat === categoryFilter ? null : cat)}
                    className={`text-micro font-mono rounded border px-2 py-0.5 transition-colors ${
                      categoryFilter === cat
                        ? 'border-brand-500/50 bg-brand-50 dark:bg-brand-950/30 text-brand-600 dark:text-brand-400'
                        : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-muted hover:border-brand-500/50'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            {filtered.map((b) => (
              <article key={b.slug} className="surface-card p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <a
                    href={b.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-heading hover:text-rose-500 text-sm inline-flex items-center gap-1"
                  >
                    {b.name} <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                  <span
                    className={`shrink-0 text-micro font-mono rounded-full border px-2 py-0.5 ${STATUS_BADGE[b.status]}`}
                  >
                    {b.status}
                  </span>
                </div>
                {b.description && <p className="mt-1 text-xs text-muted">{b.description}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-micro font-mono text-muted">
                  <span className="rounded border border-slate-300 dark:border-[rgb(var(--border-400))] px-1.5 py-0.5">
                    {b.level}
                  </span>
                  <span className="rounded border border-slate-300 dark:border-[rgb(var(--border-400))] px-1.5 py-0.5">
                    {b.category}
                  </span>
                  <span className="px-1">{b.host}</span>
                  {b.platformRef && <span className="text-emerald-600 dark:text-emerald-400">→ {b.platformRef}</span>}
                </div>
              </article>
            ))}
          </section>
          {filtered.length === 0 && (
            <p className="mt-6 text-center text-sm text-muted">No bookmarks match the current filters.</p>
          )}
          {stats && (
            <p className="mt-6 text-center text-micro font-mono text-muted">
              source: {stats.source} · replicated {stats.replicatedAt} · links only, no vendored content
            </p>
          )}
        </>
      )}
    </DataPageLayout>
  );
}
