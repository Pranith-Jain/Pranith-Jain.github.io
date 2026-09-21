import { useEffect, useMemo, useState } from 'react';
import { Library, ExternalLink, RefreshCw } from 'lucide-react';
import { DataPageLayout } from '../../components/DataPageLayout';

interface HijacklibEntry {
  slug: string;
  dll: string;
  vendor: string;
  cve: string | null;
  hijackTypes: string[];
  executableCount: number;
  description: string;
  url: string;
}

interface HijacklibsResponse {
  count: number;
  total: number;
  dlls: HijacklibEntry[];
}

export default function Hijacklibs(): JSX.Element {
  const [data, setData] = useState<HijacklibsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [cveOnly, setCveOnly] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();

    setLoading(true);
    setError(null);
    fetch('/api/v1/hijacklibs?limit=500', { signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(15_000)]) })
      .then((r) => (r.ok ? (r.json() as Promise<HijacklibsResponse>) : Promise.reject(new Error(`HTTP ${r.status}`))))
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

  const types = useMemo(() => {
    if (!data?.dlls) return [];
    return Array.from(new Set(data.dlls.flatMap((d) => d.hijackTypes))).sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.dlls.filter((d) => {
      if (typeFilter && !d.hijackTypes.includes(typeFilter)) return false;
      if (cveOnly && !d.cve) return false;
      if (!q) return true;
      const hay = `${d.dll} ${d.vendor} ${d.cve ?? ''} ${d.description}`.toLowerCase();
      return hay.includes(q);
    });
  }, [data, query, typeFilter, cveOnly]);

  return (
    <DataPageLayout
      backTo="/dfir"
      backLabel="back to dfir"
      icon={<Library className="h-6 w-6" />}
      title="HijackLibs — DLL Hijacking Candidates"
      description="608 DLLs known to be abusable for DLL hijacking (T1574.001): sideloading, phantom, search-order, and environment-variable types. Pivot from a suspicious DLL load to its known vulnerable executables."
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
              {data.total} DLLs
            </span>
          )}
        </div>
      }
      loading={loading}
      error={error}
      onRetry={() => setRefreshKey((k) => k + 1)}
      empty={!loading && !data}
      emptyMessage="No HijackLibs data available."
      maxWidthClass="max-w-6xl"
    >
      {data && (
        <>
          <section className="surface-card p-4 mb-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1">
                <Library className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Search ${data.total} DLLs…`}
                  className="w-full rounded-xl border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--input-200))] py-2 pl-9 pr-3 text-sm text-heading placeholder:text-slate-400 focus:border-rose-500/60 focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => setCveOnly((v) => !v)}
                className={`text-mini font-mono rounded border px-2.5 py-1 transition-colors ${
                  cveOnly
                    ? 'border-rose-500/50 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400'
                    : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-muted hover:border-rose-500/50 hover:text-rose-600 dark:hover:text-rose-400'
                }`}
              >
                has CVE
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {types.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTypeFilter(t === typeFilter ? null : t)}
                  className={`text-micro font-mono rounded-full border px-2.5 py-0.5 transition-colors ${
                    typeFilter === t
                      ? 'border-rose-500/50 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400'
                      : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-muted hover:border-rose-500/50 hover:text-rose-600 dark:hover:text-rose-400'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            {filtered.map((d) => (
              <article key={d.slug} className="surface-card p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono font-medium text-heading hover:text-rose-500 text-sm inline-flex items-center gap-1"
                  >
                    {d.dll} <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                  <span className="shrink-0 text-micro font-mono text-muted">{d.vendor}</span>
                </div>
                {d.description && <p className="mt-1 text-xs text-muted">{d.description}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-micro font-mono text-muted">
                  {d.hijackTypes.map((t) => (
                    <span
                      key={t}
                      className="rounded border border-slate-300 dark:border-[rgb(var(--border-400))] px-1.5 py-0.5"
                    >
                      {t}
                    </span>
                  ))}
                  {d.cve && <span className="text-rose-600 dark:text-rose-400">{d.cve}</span>}
                </div>
              </article>
            ))}
          </section>
          {filtered.length === 0 && (
            <p className="mt-6 text-center text-sm text-muted">No DLLs match the current filters.</p>
          )}
          <p className="mt-6 text-center text-micro font-mono text-muted">
            source: hijacklibs.net · summaries only, no vendored content
          </p>
        </>
      )}
    </DataPageLayout>
  );
}
