import { useEffect, useMemo, useState } from 'react';
import { Cpu, ExternalLink, RefreshCw } from 'lucide-react';
import { DataPageLayout } from '../../components/DataPageLayout';

interface MalapiEntry {
  slug: string;
  name: string;
  library: string;
  categories: string[];
  associatedAttacks: string[];
  description: string;
  documentation: string;
  url: string;
}

interface MalapiResponse {
  count: number;
  total: number;
  apis: MalapiEntry[];
}

export default function Malapi(): JSX.Element {
  const [data, setData] = useState<MalapiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();

    setLoading(true);
    setError(null);
    fetch('/api/v1/malapi?limit=500', { signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(15_000)]) })
      .then((r) => (r.ok ? (r.json() as Promise<MalapiResponse>) : Promise.reject(new Error(`HTTP ${r.status}`))))
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

  const categories = useMemo(() => {
    if (!data?.apis) return [];
    return Array.from(new Set(data.apis.flatMap((a) => a.categories))).sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.apis.filter((a) => {
      if (categoryFilter && !a.categories.includes(categoryFilter)) return false;
      if (!q) return true;
      const hay =
        `${a.name} ${a.library} ${a.description} ${a.categories.join(' ')} ${a.associatedAttacks.join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  }, [data, query, categoryFilter]);

  return (
    <DataPageLayout
      backTo="/dfir"
      backLabel="back to dfir"
      icon={<Cpu className="h-6 w-6" />}
      title="MalAPI — Windows APIs Abused by Attackers"
      description="370 Windows APIs mapped to attacker use (enumeration, injection, evasion, ransomware…). Use this when triaging imports, capability reports, or YARA hits: look up what an API is abused for and which library it lives in."
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
              {data.total} APIs
            </span>
          )}
        </div>
      }
      loading={loading}
      error={error}
      onRetry={() => setRefreshKey((k) => k + 1)}
      empty={!loading && !data}
      emptyMessage="No MalAPI data available."
      maxWidthClass="max-w-6xl"
    >
      {data && (
        <>
          <section className="surface-card p-4 mb-4">
            <div className="relative">
              <Cpu className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${data.total} APIs (try “CreateRemoteThread”)…`}
                className="w-full rounded-xl border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--input-200))] py-2 pl-9 pr-3 text-sm text-heading placeholder:text-slate-400 focus:border-rose-500/60 focus:outline-none"
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat === categoryFilter ? null : cat)}
                  className={`text-micro font-mono rounded-full border px-2.5 py-0.5 transition-colors ${
                    categoryFilter === cat
                      ? 'border-rose-500/50 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400'
                      : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-muted hover:border-rose-500/50 hover:text-rose-600 dark:hover:text-rose-400'
                  }`}
                >
                  {cat}
                </button>
              ))}
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
                    className="font-mono font-medium text-heading hover:text-rose-500 text-sm inline-flex items-center gap-1"
                  >
                    {a.name} <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                  {a.library && <span className="shrink-0 text-micro font-mono text-muted">{a.library}</span>}
                </div>
                {a.description && <p className="mt-1 text-xs text-muted">{a.description}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-micro font-mono text-muted">
                  {a.categories.map((c) => (
                    <span
                      key={c}
                      className="rounded border border-slate-300 dark:border-[rgb(var(--border-400))] px-1.5 py-0.5"
                    >
                      {c}
                    </span>
                  ))}
                  {a.documentation && (
                    <a
                      href={a.documentation}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand-600 dark:text-brand-400 hover:underline"
                    >
                      MS docs
                    </a>
                  )}
                </div>
              </article>
            ))}
          </section>
          {filtered.length === 0 && (
            <p className="mt-6 text-center text-sm text-muted">No APIs match the current filters.</p>
          )}
          <p className="mt-6 text-center text-micro font-mono text-muted">
            source: malapi.io · summaries only, no vendored content
          </p>
        </>
      )}
    </DataPageLayout>
  );
}
