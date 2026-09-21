import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, ExternalLink, RefreshCw } from 'lucide-react';
import { DataPageLayout } from '../../components/DataPageLayout';

interface VerisField {
  slug: string;
  path: string;
  section: string;
  category: string;
  field: string;
  values: { value: string; label: string }[];
}

interface VerisResponse {
  count: number;
  total: number;
  fields: VerisField[];
}

interface VerisStats {
  total: number;
  sections: { section: string; fieldCount: number; valueCount: number }[];
  license: string;
}

export default function Veris(): JSX.Element {
  const [data, setData] = useState<VerisResponse | null>(null);
  const [stats, setStats] = useState<VerisStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [sectionFilter, setSectionFilter] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();

    setLoading(true);
    setError(null);
    const opts = { signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(15_000)]) };
    Promise.all([
      fetch('/api/v1/veris?limit=200', opts).then((r) =>
        r.ok ? (r.json() as Promise<VerisResponse>) : Promise.reject(new Error(`HTTP ${r.status}`))
      ),
      fetch('/api/v1/veris/stats', opts).then((r) =>
        r.ok ? (r.json() as Promise<VerisStats>) : Promise.reject(new Error(`HTTP ${r.status}`))
      ),
    ])
      .then(([fields, s]) => {
        if (cancelled) return;
        setData(fields);
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

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.fields.filter((f) => {
      if (sectionFilter && f.section !== sectionFilter) return false;
      if (!q) return true;
      const hay = `${f.path} ${f.values.map((v) => `${v.value} ${v.label}`).join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  }, [data, query, sectionFilter]);

  return (
    <DataPageLayout
      backTo="/dfir"
      backLabel="back to dfir"
      icon={<ClipboardList className="h-6 w-6" />}
      title="VERIS — Incident Taxonomy"
      description="The Vocabulary for Event Recording and Incident Sharing: the standard 4-A vocabulary (Actor, Action, Asset, Attribute) for coding security incidents consistently. Use this when writing incident reports or structuring DBIR-style analysis."
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
            <span className="rounded border border-slate-300 dark:border-[rgb(var(--border-400))] px-2 py-1 text-muted font-mono">
              {stats.total} fields
            </span>
          )}
        </div>
      }
      loading={loading}
      error={error}
      onRetry={() => setRefreshKey((k) => k + 1)}
      empty={!loading && !data}
      emptyMessage="No VERIS data available."
      maxWidthClass="max-w-6xl"
    >
      {data && stats && (
        <>
          <section className="surface-card p-4 mb-4">
            <div className="relative">
              <ClipboardList className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${stats.total} taxonomy fields (try “ransomware”)…`}
                className="w-full rounded-xl border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--input-200))] py-2 pl-9 pr-3 text-sm text-heading placeholder:text-slate-400 focus:border-rose-500/60 focus:outline-none"
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {stats.sections.map((s) => (
                <button
                  key={s.section}
                  type="button"
                  onClick={() => setSectionFilter(s.section === sectionFilter ? null : s.section)}
                  className={`text-micro font-mono rounded-full border px-2.5 py-0.5 transition-colors ${
                    sectionFilter === s.section
                      ? 'border-rose-500/50 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400'
                      : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-muted hover:border-rose-500/50 hover:text-rose-600 dark:hover:text-rose-400'
                  }`}
                >
                  {s.section} · {s.fieldCount}
                </button>
              ))}
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            {filtered.map((f) => (
              <article key={f.slug} className="surface-card p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono font-medium text-heading text-sm">{f.path}</span>
                  <span className="shrink-0 text-micro font-mono text-muted">{f.values.length} values</span>
                </div>
                <ul className="mt-2 space-y-1">
                  {f.values.slice(0, 8).map((v) => (
                    <li key={v.value} className="text-xs text-muted">
                      <span className="font-medium text-heading">{v.value}</span>
                      {v.label && v.label !== `${v.value}.` && <span> — {v.label}</span>}
                    </li>
                  ))}
                  {f.values.length > 8 && (
                    <li className="text-micro font-mono text-muted">+{f.values.length - 8} more via API</li>
                  )}
                </ul>
              </article>
            ))}
          </section>
          {filtered.length === 0 && (
            <p className="mt-6 text-center text-sm text-muted">No fields match the current filters.</p>
          )}
          <p className="mt-6 text-center text-micro font-mono text-muted">
            source: github.com/vz-risk/VERIS ({stats.license}) ·{' '}
            <a
              className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-0.5"
              href="https://verisframework.org/"
              target="_blank"
              rel="noreferrer"
            >
              verisframework.org <ExternalLink className="h-3 w-3" />
            </a>
          </p>
        </>
      )}
    </DataPageLayout>
  );
}
