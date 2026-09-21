import { useEffect, useMemo, useState } from 'react';
import { Globe, ExternalLink, RefreshCw } from 'lucide-react';
import { DataPageLayout } from '../../components/DataPageLayout';

interface LotsSite {
  slug: string;
  website: string;
  provider: string;
  tags: string[];
  description: string;
  url: string;
}

interface LotsResponse {
  count: number;
  total: number;
  sites: LotsSite[];
}

const TAG_BADGE: Record<string, string> = {
  Phishing: 'bg-rose-100 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-300 dark:border-rose-700',
  'C&C':
    'bg-purple-100 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-300 dark:border-purple-700',
  Download: 'bg-blue-100 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400 border-brand-300 dark:border-blue-700',
  Exfiltration:
    'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700',
};

export default function Lots(): JSX.Element {
  const [data, setData] = useState<LotsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();

    setLoading(true);
    setError(null);
    fetch('/api/v1/lots?limit=500', { signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(15_000)]) })
      .then((r) => (r.ok ? (r.json() as Promise<LotsResponse>) : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        if (cancelled) return;
        setData(d);
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

  const tags = useMemo(() => {
    if (!data?.sites) return [];
    return Array.from(new Set(data.sites.flatMap((s) => s.tags))).sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.sites.filter((s) => {
      if (tagFilter && !s.tags.includes(tagFilter)) return false;
      if (!q) return true;
      const hay = `${s.website} ${s.provider} ${s.description} ${s.tags.join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  }, [data, query, tagFilter]);

  return (
    <DataPageLayout
      backTo="/dfir"
      backLabel="back to dfir"
      icon={<Globe className="h-6 w-6" />}
      title="Living Off Trusted Sites"
      description="175 legitimate domains attackers abuse for phishing, C2, exfiltration, and downloads (LOTS Project). Use this when triaging URLs: a trusted domain is not a clean verdict — check what the site is abused for."
      headerExtra={
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            className="inline-flex items-center gap-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] px-2 py-1 text-muted hover:border-rose-500/50 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" /> refresh
          </button>
          {data && (
            <span className="rounded border border-slate-300 dark:border-[rgb(var(--border-400))] px-2 py-1 text-muted font-mono">
              {data.total} sites
            </span>
          )}
        </div>
      }
      loading={loading}
      error={error}
      onRetry={() => setRefreshKey((k) => k + 1)}
      empty={!loading && !data}
      emptyMessage="No LOTS data available."
      maxWidthClass="max-w-6xl"
    >
      {data && (
        <>
          <section className="surface-card p-4 mb-4">
            <div className="relative">
              <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${data.total} trusted sites…`}
                className="w-full rounded-xl border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--input-200))] py-2 pl-9 pr-3 text-sm text-heading placeholder:text-slate-400 focus:border-rose-500/60 focus:outline-none"
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setTagFilter(tag === tagFilter ? null : tag)}
                  className={`text-micro font-mono rounded-full border px-2.5 py-0.5 transition-colors ${
                    tagFilter === tag
                      ? 'border-rose-500/50 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400'
                      : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-muted hover:border-rose-500/50 hover:text-rose-600 dark:hover:text-rose-400'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            {filtered.map((s) => (
              <article key={s.slug} className="surface-card p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono font-medium text-heading hover:text-rose-500 text-sm inline-flex items-center gap-1"
                  >
                    {s.website} <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                  <span className="shrink-0 text-micro font-mono text-muted">{s.provider}</span>
                </div>
                {s.description && <p className="mt-1 text-xs text-muted">{s.description}</p>}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {s.tags.map((t) => (
                    <span
                      key={t}
                      className={`text-micro font-mono rounded-full border px-2 py-0.5 ${TAG_BADGE[t] ?? 'border-slate-300 dark:border-slate-700 text-muted'}`}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </section>
          {filtered.length === 0 && (
            <p className="mt-6 text-center text-sm text-muted">No sites match the current filters.</p>
          )}
          <p className="mt-6 text-center text-micro font-mono text-muted">
            source: lots-project.com · links + summaries only, no vendored content
          </p>
        </>
      )}
    </DataPageLayout>
  );
}
