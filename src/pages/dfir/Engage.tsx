import { useEffect, useMemo, useState } from 'react';
import { Swords, ExternalLink, RefreshCw } from 'lucide-react';
import { DataPageLayout } from '../../components/DataPageLayout';

interface EngageApproach {
  slug: string;
  name: string;
  goal: string;
  phase: string;
  topGoal: string;
  url: string;
}

interface EngageResponse {
  count: number;
  total: number;
  approaches: EngageApproach[];
}

interface EngageStats {
  total: number;
  phases: string[];
  goals: { name: string; phase: string; topGoal: string }[];
}

export default function Engage(): JSX.Element {
  const [data, setData] = useState<EngageResponse | null>(null);
  const [stats, setStats] = useState<EngageStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [phaseFilter, setPhaseFilter] = useState<string | null>(null);
  const [goalFilter, setGoalFilter] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();

    setLoading(true);
    setError(null);
    const opts = { signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(15_000)]) };
    Promise.all([
      fetch('/api/v1/engage?limit=200', opts).then((r) =>
        r.ok ? (r.json() as Promise<EngageResponse>) : Promise.reject(new Error(`HTTP ${r.status}`))
      ),
      fetch('/api/v1/engage/stats', opts).then((r) =>
        r.ok ? (r.json() as Promise<EngageStats>) : Promise.reject(new Error(`HTTP ${r.status}`))
      ),
    ])
      .then(([approaches, s]) => {
        if (cancelled) return;
        setData(approaches);
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

  const goals = useMemo(() => {
    if (!stats) return [];
    const scope = phaseFilter ? stats.goals.filter((g) => g.phase === phaseFilter) : stats.goals;
    return scope.map((g) => g.name).sort();
  }, [stats, phaseFilter]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.approaches.filter((a) => {
      if (phaseFilter && a.phase !== phaseFilter) return false;
      if (goalFilter && a.goal !== goalFilter && a.topGoal !== goalFilter) return false;
      if (!q) return true;
      return `${a.name} ${a.goal} ${a.phase} ${a.topGoal}`.toLowerCase().includes(q);
    });
  }, [data, query, phaseFilter, goalFilter]);

  return (
    <DataPageLayout
      backTo="/dfir"
      backLabel="back to dfir"
      icon={<Swords className="h-6 w-6" />}
      title="MITRE Engage — Adversary Engagement"
      description="Denial and deception operations: 53 approaches across Prepare / Engage / Understand for making the adversary wrong instead of just keeping them out. Plan honeypots, lures, and personas by goal."
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
              {stats.total} approaches
            </span>
          )}
        </div>
      }
      loading={loading}
      error={error}
      onRetry={() => setRefreshKey((k) => k + 1)}
      empty={!loading && !data}
      emptyMessage="No Engage data available."
      maxWidthClass="max-w-6xl"
    >
      {data && stats && (
        <>
          <section className="surface-card p-4 mb-4">
            <div className="relative">
              <Swords className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${stats.total} approaches (try “lures”)…`}
                className="w-full rounded-xl border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--input-200))] py-2 pl-9 pr-3 text-sm text-heading placeholder:text-slate-400 focus:border-rose-500/60 focus:outline-none"
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {stats.phases.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    setPhaseFilter(p === phaseFilter ? null : p);
                    setGoalFilter(null);
                  }}
                  className={`text-micro font-mono rounded-full border px-2.5 py-0.5 transition-colors ${
                    phaseFilter === p
                      ? 'border-rose-500/50 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400'
                      : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-muted hover:border-rose-500/50 hover:text-rose-600 dark:hover:text-rose-400'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            {goals.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {goals.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGoalFilter(g === goalFilter ? null : g)}
                    className={`text-micro font-mono rounded border px-2 py-0.5 transition-colors ${
                      goalFilter === g
                        ? 'border-brand-500/50 bg-brand-50 dark:bg-brand-950/30 text-brand-600 dark:text-brand-400'
                        : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-muted hover:border-brand-500/50'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            )}
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
                    {a.name} <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                  <span className="shrink-0 text-micro font-mono text-muted">{a.phase}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-micro font-mono text-muted">
                  <span className="rounded border border-slate-300 dark:border-[rgb(var(--border-400))] px-1.5 py-0.5">
                    {a.goal}
                  </span>
                  {a.topGoal && a.topGoal !== a.goal && <span className="px-1">← {a.topGoal}</span>}
                </div>
              </article>
            ))}
          </section>
          {filtered.length === 0 && (
            <p className="mt-6 text-center text-sm text-muted">No approaches match the current filters.</p>
          )}
          <p className="mt-6 text-center text-micro font-mono text-muted">
            source: engage.mitre.org · names only, details link out to the matrix
          </p>
        </>
      )}
    </DataPageLayout>
  );
}
