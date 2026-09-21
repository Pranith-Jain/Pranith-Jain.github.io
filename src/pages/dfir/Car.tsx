import { useEffect, useMemo, useState } from 'react';
import { FlaskConical, ExternalLink, RefreshCw } from 'lucide-react';
import { DataPageLayout } from '../../components/DataPageLayout';

interface CarAnalytic {
  slug: string;
  carId: string;
  title: string;
  description: string;
  domain: string;
  platforms: string[];
  analyticTypes: string[];
  techniques: { technique: string; tactics: string[]; subtechniques: string[]; coverage: string }[];
  techniqueIds: string[];
  d3fend: { id: string; label: string }[];
  implementations: string[];
  url: string;
}

interface CarResponse {
  count: number;
  total: number;
  analytics: CarAnalytic[];
}

export default function Car(): JSX.Element {
  const [data, setData] = useState<CarResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();

    setLoading(true);
    setError(null);
    fetch('/api/v1/car?limit=200', { signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(15_000)]) })
      .then((r) => (r.ok ? (r.json() as Promise<CarResponse>) : Promise.reject(new Error(`HTTP ${r.status}`))))
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

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    if (!q) return data.analytics;
    return data.analytics.filter((a) => {
      const hay =
        `${a.carId} ${a.title} ${a.description} ${a.techniqueIds.join(' ')} ${a.implementations.join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  }, [data, query]);

  return (
    <DataPageLayout
      backTo="/dfir"
      backLabel="back to dfir"
      icon={<FlaskConical className="h-6 w-6" />}
      title="MITRE CAR — Cyber Analytics Repository"
      description="102 validated detection analytics mapped to ATT&CK techniques, with D3FEND countermeasure links. Search by technique ID (e.g. T1059) when building or gap-assessing detections."
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
              {data.total} analytics
            </span>
          )}
        </div>
      }
      loading={loading}
      error={error}
      onRetry={() => setRefreshKey((k) => k + 1)}
      empty={!loading && !data}
      emptyMessage="No CAR data available."
      maxWidthClass="max-w-6xl"
    >
      {data && (
        <>
          <section className="surface-card p-4 mb-4">
            <div className="relative">
              <FlaskConical className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${data.total} analytics (try “T1059”)…`}
                className="w-full rounded-xl border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--input-200))] py-2 pl-9 pr-3 text-sm text-heading placeholder:text-slate-400 focus:border-rose-500/60 focus:outline-none"
              />
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            {filtered.map((a) => (
              <article key={a.slug} className="surface-card p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-heading hover:text-rose-500 text-sm inline-flex items-center gap-1"
                  >
                    {a.carId} — {a.title} <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                </div>
                {a.description && <p className="mt-1 text-xs text-muted">{a.description}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-micro font-mono text-muted">
                  {a.techniqueIds.slice(0, 8).map((t) => (
                    <span
                      key={t}
                      className="rounded border border-slate-300 dark:border-[rgb(var(--border-400))] px-1.5 py-0.5"
                    >
                      {t}
                    </span>
                  ))}
                  {a.d3fend.slice(0, 2).map((d) => (
                    <span key={d.id} className="text-emerald-600 dark:text-emerald-400">
                      {d.id}
                    </span>
                  ))}
                  <span className="px-1">{a.platforms.join(' · ')}</span>
                </div>
              </article>
            ))}
          </section>
          {filtered.length === 0 && (
            <p className="mt-6 text-center text-sm text-muted">No analytics match the current filters.</p>
          )}
          <p className="mt-6 text-center text-micro font-mono text-muted">
            source: github.com/mitre-attack/car (Apache-2.0) · summaries only
          </p>
        </>
      )}
    </DataPageLayout>
  );
}
