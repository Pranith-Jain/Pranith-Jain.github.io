import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Users } from 'lucide-react';
import { DataPageLayout } from '../../components/DataPageLayout';

interface ForumRef {
  forum: string;
  logo_url?: string;
}
interface HandleMatch {
  username: string;
  forum_count: number;
  forums: ForumRef[];
}
interface SearchResponse {
  query: string;
  generated_at: string;
  found: boolean;
  total_matches: number;
  truncated: boolean;
  results: HandleMatch[];
  source: string;
  source_url: string;
  stale?: boolean;
  rate_limited?: boolean;
  warning?: string;
}

export default function ScrapedIntelUsernames(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const [input, setInput] = useState(searchParams.get('q') ?? '');
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The query we actually fetched (submitted), distinct from the live input.
  const [submitted, setSubmitted] = useState(searchParams.get('q') ?? '');
  // Bumped to force a re-fetch of the same query (retry button).
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const qv = submitted.trim();
    if (qv.length < 2) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/v1/scrapedintel-usernames?q=${encodeURIComponent(qv)}`)
      .then(async (r) => {
        const body = (await r.json().catch(() => null)) as SearchResponse | { error?: string } | null;
        if (r.status === 429) throw new Error('Rate limited by the upstream source — try again in a minute.');
        if (r.status === 502 || r.status === 503)
          throw new Error('Source temporarily unavailable — try again shortly.');
        if (!r.ok || !body || !('results' in body)) {
          throw new Error((body as { error?: string } | null)?.error ?? `lookup failed (${r.status})`);
        }
        return body as SearchResponse;
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
  }, [submitted, refreshKey]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const qv = input.trim();
    setSubmitted(qv);
    setSearchParams(qv ? { q: qv } : {}, { replace: true });
  };

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Users size={28} />}
      title="Forum handle search"
      description={
        <>
          Search 2M+ usernames indexed across cybercrime forums and open sources to see where a handle appears. An
          attribution signal — a hit means the handle was seen in a scrape, not proof of identity or intent (the corpus
          also holds researchers, journalists, LE, and scraper accounts). Live source via{' '}
          <a
            href="https://threatactorusernames.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            threatactorusernames.com
          </a>{' '}
          (ScrapedIntel) — rate-limited, so results are edge-cached.
        </>
      }
      loading={loading}
      error={error}
      onRetry={() => setRefreshKey((k) => k + 1)}
      empty={!!data && data.results.length === 0}
      emptyMessage={`No forum hits for "${submitted.trim()}".`}
      maxWidthClass="max-w-4xl"
    >
      <form onSubmit={submit} className="surface-card p-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Enter a username / handle (min 2 chars)…"
              className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
              aria-label="Search ScrapedIntel forum handles"
              maxLength={80}
            />
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 text-xs font-mono px-4 py-2 rounded border border-brand-500/40 bg-brand-500/10 text-brand-700 dark:text-brand-300 hover:border-brand-500/70"
          >
            search
          </button>
        </div>
      </form>

      {data && (
        <p className="text-mini font-mono text-slate-500 mb-4">
          {data.total_matches} match{data.total_matches === 1 ? '' : 'es'} for "{data.query}"
          {data.truncated && (
            <span className="text-amber-600 dark:text-amber-400"> · showing top {data.results.length}</span>
          )}
          {data.stale && (
            <span className="text-amber-600 dark:text-amber-400 ml-2" title="served from last-good cache">
              · cached (upstream busy)
            </span>
          )}
        </p>
      )}

      {submitted.trim().length < 2 ? (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-[rgb(var(--border-400))] p-8 text-center text-sm font-mono text-slate-500">
          Enter at least 2 characters and hit search.
        </div>
      ) : (
        <ul className="space-y-2">
          {data?.results.map((m) => (
            <li key={m.username} className="surface-card p-3">
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
                    className="text-mini font-mono px-2 py-0.5 rounded border border-brand-500/40 bg-brand-500/10 text-brand-700 dark:text-brand-300"
                  >
                    {f.forum}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </DataPageLayout>
  );
}
