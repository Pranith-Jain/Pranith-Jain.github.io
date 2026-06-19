import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Fingerprint, Search } from 'lucide-react';
import { DataState } from '../../components/DataState';

interface UsernameMatch {
  username: string;
  forum_count: number;
  forums: { forum: string; dead: boolean }[];
}

interface UsernameSearchResponse {
  query: string;
  generated_at: string;
  total_matches: number;
  truncated: boolean;
  results: UsernameMatch[];
  warnings: string[];
}

interface UsernameStatsResponse {
  generated_at: string;
  total_usernames: number | null;
  sources: string[];
  forums: { forum: string; dead: boolean }[];
}

type MatchMode = 'substring' | 'prefix' | 'exact';

const MODES: { id: MatchMode; label: string }[] = [
  { id: 'substring', label: 'contains' },
  { id: 'prefix', label: 'starts with' },
  { id: 'exact', label: 'exact' },
];

export default function ActorUsernames(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const [input, setInput] = useState(searchParams.get('q') ?? '');
  const [mode, setMode] = useState<MatchMode>('substring');
  const [data, setData] = useState<UsernameSearchResponse | null>(null);
  const [stats, setStats] = useState<UsernameStatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The query we actually fetched (submitted), distinct from the live input.
  const [submitted, setSubmitted] = useState(searchParams.get('q') ?? '');
  // Bumped to force a re-fetch of the same query (e.g. the retry button).
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    fetch('/api/v1/actor-usernames/stats')
      .then((r) => (r.ok ? (r.json() as Promise<UsernameStatsResponse>) : null))
      .then((d) => setStats(d))
      .catch(() => setStats(null));
  }, []);

  useEffect(() => {
    const q = submitted.trim();
    if (q.length < 2) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/v1/actor-usernames?q=${encodeURIComponent(q)}&mode=${mode}`)
      .then((r) => {
        if (!r.ok) throw new Error(`lookup failed (${r.status})`);
        return r.json() as Promise<UsernameSearchResponse>;
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
  }, [submitted, mode, refreshKey]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = input.trim();
    setSubmitted(q);
    setSearchParams(q ? { q } : {}, { replace: true });
  };

  const corpus = useMemo(() => {
    if (!stats) return null;
    const active = stats.forums.filter((f) => !f.dead).length;
    const dead = stats.forums.length - active;
    return { active, dead };
  }, [stats]);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 flex items-center gap-3">
          <Fingerprint size={28} className="text-brand-600 dark:text-brand-400" /> Actor username search
        </h1>
        <p className="text-muted mb-2 max-w-3xl leading-relaxed">
          Search ~{stats?.total_usernames?.toLocaleString() ?? '291k'} usernames scraped from cybercrime forums to see
          which boards a handle appears on. An attribution signal — a hit means the handle was seen in a forum scrape,
          not proof of identity. Sourced from{' '}
          <a
            href="https://github.com/spmedia/Threat-Actor-Usernames-Scrape"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            spmedia/Threat-Actor-Usernames-Scrape
          </a>{' '}
          (MIT).
        </p>
        {stats && corpus && (
          <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mb-6">
            {stats.forums.length} forums ({corpus.active} active · {corpus.dead} defunct)
          </p>
        )}
      </div>

      <form
        onSubmit={submit}
        className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4 mb-6"
      >
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Enter a username / handle (min 2 chars)…"
              className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-[rgb(var(--border-400))] rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
              aria-label="Search threat-actor usernames"
            />
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 text-xs font-mono px-4 py-2 rounded border border-brand-500/40 bg-brand-500/10 text-brand-700 dark:text-brand-300 hover:border-brand-500/70"
          >
            search
          </button>
        </div>
        <div className="flex items-center gap-1.5 mt-3">
          <span className="text-mini font-mono text-slate-500 mr-1">match:</span>
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={`text-mini font-mono px-2 py-1 rounded border ${
                mode === m.id
                  ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                  : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </form>

      {data && (
        <p className="text-mini font-mono text-slate-500 mb-4">
          {data.total_matches} match{data.total_matches === 1 ? '' : 'es'} for “{data.query}”
          {data.truncated && (
            <span className="text-amber-600 dark:text-amber-400"> · showing top {data.results.length}</span>
          )}
          {data.warnings.length > 0 && (
            <span className="text-amber-600 dark:text-amber-400 ml-2">
              · {data.warnings.length} forum file(s) unreachable
            </span>
          )}
        </p>
      )}

      {submitted.trim().length < 2 ? (
        <div className="rounded-lg border border-dashed border-slate-300 dark:border-[rgb(var(--border-400))] p-8 text-center text-sm font-mono text-slate-500">
          Enter at least 2 characters and hit search.
        </div>
      ) : (
        <DataState
          loading={loading}
          error={error}
          empty={!!data && data.results.length === 0}
          emptyLabel={`No forum hits for “${submitted.trim()}”.`}
          onRetry={() => setRefreshKey((k) => k + 1)}
          rows={6}
        >
          <ul className="space-y-2">
            {data?.results.map((m) => (
              <li
                key={m.username}
                className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-3"
              >
                <div className="flex items-baseline justify-between gap-2 mb-2 flex-wrap">
                  <span className="font-mono font-semibold text-sm text-slate-900 dark:text-slate-100 break-all">
                    {m.username}
                  </span>
                  <span className="text-mini font-mono text-slate-500 shrink-0">
                    {m.forum_count} forum{m.forum_count === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {m.forums.map((f) => (
                    <span
                      key={f.forum}
                      className={`text-mini font-mono px-2 py-0.5 rounded border ${
                        f.dead
                          ? 'border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-400 line-through'
                          : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                      }`}
                      title={f.dead ? 'defunct forum' : 'active forum'}
                    >
                      {f.forum}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </DataState>
      )}
    </div>
  );
}
