import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Users, ExternalLink, Download, Bot, Loader2, Shield, Globe, X } from 'lucide-react';
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

const QUICK_SEARCHES = [
  'apt28',
  'apt29',
  'lazarus',
  'lockbit',
  'blackcat',
  'cl0p',
  'ransomexx',
  'phantom',
  'scattered-spider',
];

const FORUM_COLORS: Record<string, string> = {
  breached: 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400',
  breachforumsst: 'border-orange-500/40 bg-orange-500/10 text-orange-600 dark:text-orange-400',
  cracked: 'border-violet-500/40 bg-violet-500/10 text-violet-600 dark:text-violet-400',
  hackforums: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
  dread: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  telegram: 'border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400',
  raidforums: 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  nulled: 'border-slate-500/40 bg-slate-500/10 text-slate-600 dark:text-slate-400',
};

function getForumColor(forum: string): string {
  const key = forum.toLowerCase().replace(/\s+/g, '');
  return FORUM_COLORS[key] ?? 'border-slate-500/40 bg-slate-500/10 text-slate-600 dark:text-slate-400';
}

function ForumLogo({ logoUrl, forum }: { logoUrl?: string; forum: string }) {
  if (!logoUrl) return null;
  return (
    <img
      src={logoUrl}
      alt={`${forum} logo`}
      className="w-4 h-4 rounded object-contain shrink-0"
      loading="lazy"
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = 'none';
      }}
    />
  );
}

function downloadFile(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ScrapedIntelUsernames(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const [input, setInput] = useState(searchParams.get('q') ?? '');
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(searchParams.get('q') ?? '');
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchData = useCallback(async (query: string) => {
    if (query.length < 2) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/scrapedintel-usernames?q=${encodeURIComponent(query)}`);
      const body = (await res.json().catch(() => null)) as SearchResponse | { error?: string } | null;
      if (res.status === 429) throw new Error('Rate limited — try again in a minute.');
      if (res.status === 502 || res.status === 503) throw new Error('Source temporarily unavailable.');
      if (!res.ok || !body || !('results' in body)) {
        throw new Error((body as { error?: string } | null)?.error ?? `lookup failed (${res.status})`);
      }
      setData(body as SearchResponse);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(submitted);
  }, [submitted, refreshKey, fetchData]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const qv = input.trim();
    setSubmitted(qv);
    setSearchParams(qv ? { q: qv } : {}, { replace: true });
  };

  const exportCsv = () => {
    if (!data) return;
    const rows = [['Username', 'Forum', 'Logo URL']];
    for (const m of data.results) {
      for (const f of m.forums) {
        rows.push([m.username, f.forum, f.logo_url ?? '']);
      }
    }
    downloadFile(`scrapedintel-${data.query}.csv`, rows.map((r) => r.join(',')).join('\n'), 'text/csv');
  };

  const exportJson = () => {
    if (!data) return;
    downloadFile(`scrapedintel-${data.query}.json`, JSON.stringify(data, null, 2), 'application/json');
  };

  // Aggregate forum stats
  const forumStats =
    data?.results.reduce(
      (acc, m) => {
        for (const f of m.forums) {
          acc[f.forum] = (acc[f.forum] ?? 0) + 1;
        }
        return acc;
      },
      {} as Record<string, number>
    ) ?? {};
  const topForums = Object.entries(forumStats)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Users size={28} />}
      title="Threat Actor Username Search"
      description={
        <>
          Search 3M+ usernames indexed across 35 cybercrime forums and open sources. A hit is an attribution signal —
          not proof of identity (corpus includes researchers, journalists, LE).{' '}
          <a
            href="https://threatactorusernames.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            ScrapedIntel
          </a>{' '}
          — rate-limited, results edge-cached.
        </>
      }
      loading={loading}
      error={error}
      onRetry={() => setRefreshKey((k) => k + 1)}
      empty={!!data && data.results.length === 0}
      emptyMessage={`No forum hits for "${submitted.trim()}".`}
      maxWidthClass="max-w-5xl"
    >
      {/* Search form */}
      <form onSubmit={submit} className="surface-card p-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Username / handle (min 2 chars)…"
              className="w-full pl-9 pr-9 py-2.5 bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded font-mono text-sm focus:outline-none focus:border-brand-500"
              aria-label="Search threat actor usernames"
              maxLength={80}
            />
            {input && (
              <button
                type="button"
                onClick={() => setInput('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 text-xs font-mono px-4 py-2.5 rounded border border-brand-500/40 bg-brand-500/10 text-brand-700 dark:text-brand-300 hover:border-brand-500/70"
          >
            <Search size={14} /> Search
          </button>
        </div>
      </form>

      {/* Quick searches */}
      {!data && !loading && (
        <div className="mb-6">
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-500 mb-2">Quick Search</h3>
          <div className="flex flex-wrap gap-2">
            {QUICK_SEARCHES.map((q) => (
              <button
                key={q}
                onClick={() => {
                  setInput(q);
                  setSubmitted(q);
                  setSearchParams({ q }, { replace: true });
                }}
                className="text-xs font-mono px-3 py-1.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40 text-muted transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Stats bar */}
      {data && data.results.length > 0 && (
        <div className="flex items-center gap-4 mb-4 flex-wrap">
          <p className="text-mini font-mono text-slate-500">
            {data.total_matches} match{data.total_matches === 1 ? '' : 'es'} for "{data.query}"
            {data.truncated && <span className="text-amber-600 dark:text-amber-400"> · top {data.results.length}</span>}
            {data.stale && (
              <span className="text-amber-600 dark:text-amber-400 ml-1" title="cached">
                · cached
              </span>
            )}
          </p>
          <div className="ml-auto flex gap-2">
            <button
              onClick={exportCsv}
              className="inline-flex items-center gap-1 text-xs font-mono px-2 py-1 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40 text-muted"
            >
              <Download size={12} /> CSV
            </button>
            <button
              onClick={exportJson}
              className="inline-flex items-center gap-1 text-xs font-mono px-2 py-1 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40 text-muted"
            >
              <Download size={12} /> JSON
            </button>
            <a
              href={`https://threatactorusernames.com/search?q=${encodeURIComponent(data.query)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-mono px-2 py-1 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40 text-muted"
            >
              <ExternalLink size={12} /> Upstream
            </a>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        {/* Results */}
        <div>
          {submitted.trim().length < 2 ? (
            <div className="rounded-xl border border-dashed border-slate-300 dark:border-[rgb(var(--border-400))] p-8 text-center text-sm font-mono text-slate-500">
              Enter at least 2 characters and hit search.
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-sm text-slate-500">
              <Loader2 size={16} className="animate-spin" /> Searching forums…
            </div>
          ) : (
            <ul className="space-y-2">
              {data?.results.map((m) => (
                <li key={m.username} className="surface-card p-4 group">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="font-mono font-bold text-sm text-slate-900 dark:text-slate-100 break-all">
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
                        className={`inline-flex items-center gap-1 text-mini font-mono px-2 py-0.5 rounded border ${getForumColor(f.forum)}`}
                      >
                        <ForumLogo logoUrl={f.logo_url} forum={f.forum} />
                        {f.forum}
                      </span>
                    ))}
                  </div>
                  {/* Quick investigate link */}
                  <div className="mt-2 pt-2 border-t border-slate-100 dark:border-[rgb(var(--border-400))]/50 opacity-0 group-hover:opacity-100 transition-opacity">
                    <a
                      href={`/dfir/agent?query=Investigate+actor+${encodeURIComponent(m.username)}`}
                      className="inline-flex items-center gap-1 text-xs font-mono text-brand-600 dark:text-brand-400 hover:underline"
                    >
                      <Bot size={12} /> Investigate with Agent
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Sidebar: forum breakdown */}
        {data && data.results.length > 0 && topForums.length > 0 && (
          <aside className="space-y-4">
            <div className="surface-card p-4">
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
                <Globe size={12} /> Forum Breakdown
              </h3>
              <div className="space-y-2">
                {topForums.map(([forum, count]) => {
                  const pct = Math.round((count / data.results.length) * 100);
                  return (
                    <div key={forum} className="flex items-center gap-2">
                      <span className="text-mini font-mono text-slate-600 dark:text-slate-300 truncate flex-1">
                        {forum}
                      </span>
                      <div className="w-20 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-brand-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-mini font-mono text-slate-400 w-8 text-right">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="surface-card p-4">
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-2">
                <Shield size={12} /> About
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                {data.total_matches > 0
                  ? `"${data.query}" was seen across ${topForums.length} forum${topForums.length === 1 ? '' : 's'} in the ScrapedIntel corpus of 3M+ scraped records.`
                  : `No matches found in the ScrapedIntel corpus.`}
              </p>
              <p className="text-xs text-slate-400 mt-2">
                Corpus:{' '}
                {data.source_url ? (
                  <a
                    href={data.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-brand-500"
                  >
                    {data.source}
                  </a>
                ) : (
                  data.source
                )}
              </p>
            </div>
          </aside>
        )}
      </div>
    </DataPageLayout>
  );
}
