import { useEffect, useState, useCallback, FormEvent } from 'react';
import { Search, Loader2, Users, BarChart3, ExternalLink, Shield, AlertTriangle, Lock } from 'lucide-react';
import { adminAuthHeaders, readAdminToken } from '../../lib/admin-token';
import { sanitizeUrl } from '../../lib/sanitize-url';

interface LinkedActor {
  actor_id: string;
  name: string;
  country: string;
  type: string;
  confidence: number;
  sources: ('deepdarkcti' | 'catalog' | 'misp')[];
  citations: string[];
  note?: string;
}

interface SearchResult {
  handle: string;
  name: string;
  description: string;
  subscribers: number | null;
  posts_per_day: number | null;
  category: string | null;
  tgstat_url: string;
  linked_actors: LinkedActor[];
  source: 'tgstat';
}

interface SearchResponse {
  query: string;
  generated_at: string;
  results: SearchResult[];
  warnings: string[];
  fetched_at: string;
  stale: boolean;
}

const SOURCE_LABEL: Record<'deepdarkcti' | 'catalog' | 'misp', string> = {
  deepdarkcti: 'deepdarkCTI',
  catalog: 'curated catalog',
  misp: 'MISP Galaxy',
};

function confidenceTone(c: number): string {
  if (c >= 0.85) return 'border-rose-500/50 bg-rose-500/10 text-rose-700 dark:text-rose-300';
  if (c >= 0.65) return 'border-orange-500/50 bg-orange-500/10 text-orange-700 dark:text-orange-300';
  return 'border-sky-500/50 bg-sky-500/10 text-sky-700 dark:text-sky-300';
}

function formatSubs(n: number | null): string {
  if (n === null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function TelegramChannelSearch(): JSX.Element {
  const [input, setInput] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [adminToken] = useState<string>(() => readAdminToken() ?? '');

  const fetchResults = useCallback(async (q: string) => {
    if (!q) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/telegram-search?q=${encodeURIComponent(q)}`);
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        throw new Error(j.message ?? j.error ?? `HTTP ${res.status}`);
      }
      const j = (await res.json()) as SearchResponse;
      setData(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (submitted) fetchResults(submitted);
  }, [submitted, fetchResults]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(input.trim());
  };

  const addToWatch = async (handle: string) => {
    if (!adminToken) {
      setError('Admin token required to add a channel — set it in the Settings tab.');
      return;
    }
    setBusy(handle);
    setError(null);
    try {
      const res = await fetch('/api/v1/telegram-custom-channels', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...adminAuthHeaders() },
        body: JSON.stringify({ handle, name: handle }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        throw new Error(j.message ?? j.error ?? `HTTP ${res.status}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-8 text-slate-900 dark:text-slate-100">
      <div className="animate-fade-in-up mb-6">
        <h1 className="text-3xl sm:text-4xl font-display font-bold flex items-center gap-3">
          <Search size={26} className="text-brand-600 dark:text-brand-400" /> Channel search
        </h1>
        <p className="text-sm font-mono text-slate-500 dark:text-slate-400 mt-2 max-w-3xl leading-relaxed">
          Discover public Telegram channels by keyword. Backed by{' '}
          <a
            href="https://tgstat.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            tgstat.com
          </a>{' '}
          (HTML, no key required, 12h cache). Each result is automatically correlated with the in-repo actor catalog and
          deepdarkCTI&apos;s <code className="text-xs">telegram_threat_actors.md</code> — a row that shows linked actors
          is a strong candidate for the watchlist.
        </p>
      </div>

      <form onSubmit={onSubmit} className="mb-6 flex flex-wrap gap-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="keyword (e.g. ransomware, stealer, APT)"
          className="flex-1 min-w-[220px] px-3 py-2 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] text-sm font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
          aria-label="Search keyword"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-mono hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          Search
        </button>
      </form>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 font-mono text-sm text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      {data && data.stale && (
        <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 font-mono text-sm text-amber-700 dark:text-amber-300 inline-flex items-center gap-2">
          <AlertTriangle size={14} />
          tgstat upstream failed — serving the previous result (re-checked within 5 min).
        </div>
      )}

      {data && data.warnings.length > 0 && (
        <ul className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs font-mono text-amber-700 dark:text-amber-300 space-y-1">
          {data.warnings.map((w) => (
            <li key={w}>⚠ {w}</li>
          ))}
        </ul>
      )}

      {!data && !loading && !error && (
        <p className="text-sm font-mono text-slate-500 dark:text-slate-400">
          Try keywords like <code>ransomware</code>, <code>stealer</code>, <code>infostealer</code>, or a specific
          threat-actor name. Single handles (e.g. <code>vxunderground</code>) also work and return linked-actor
          attributions.
        </p>
      )}

      {data && data.results.length === 0 && !loading && (
        <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-8 text-center font-mono text-sm text-slate-500">
          No channels matched <strong>{data.query}</strong>. Try a broader keyword.
        </div>
      )}

      {data && data.results.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
            {data.results.length} result{data.results.length === 1 ? '' : 's'} for <strong>{data.query}</strong>
            {' · '}fetched {new Date(data.fetched_at).toLocaleString()}
            {data.stale && ' · stale'}
          </p>
          {data.results.map((r) => (
            <div
              key={r.handle}
              className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <h3 className="font-display font-semibold text-base text-slate-900 dark:text-slate-100 truncate">
                    {r.name}
                  </h3>
                  <code className="text-xs font-mono text-slate-500">@{r.handle}</code>
                  {r.category && (
                    <span className="ml-2 text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500">
                      {r.category}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-micro font-mono text-slate-500 dark:text-slate-400">
                  <span className="inline-flex items-center gap-1">
                    <Users size={11} /> {formatSubs(r.subscribers)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <BarChart3 size={11} /> {r.posts_per_day ?? '—'}/day
                  </span>
                </div>
              </div>

              {r.description && (
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed mb-3 line-clamp-2">
                  {r.description}
                </p>
              )}

              {r.linked_actors.length > 0 && (
                <div className="mb-3 rounded border border-rose-500/30 bg-rose-500/5 p-3">
                  <p className="text-micro font-mono uppercase tracking-wider text-rose-700 dark:text-rose-300 mb-1.5 inline-flex items-center gap-1">
                    <Shield size={11} /> Linked actors
                  </p>
                  <ul className="space-y-1.5">
                    {r.linked_actors.map((a) => (
                      <li key={`${r.handle}:${a.actor_id}`} className="text-xs font-mono">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{a.name}</span>
                        {a.country && <span className="ml-1 text-slate-500">· {a.country}</span>}
                        <span
                          className={`ml-2 text-micro font-mono uppercase tracking-wider px-1 py-0.5 rounded border ${confidenceTone(a.confidence)}`}
                          title={`Confidence ${(a.confidence * 100).toFixed(0)}%`}
                        >
                          {(a.confidence * 100).toFixed(0)}%
                        </span>
                        <span className="ml-2 text-slate-500">
                          via {a.sources.map((s) => SOURCE_LABEL[s]).join(', ')}
                        </span>
                        {a.citations[0] && (
                          <span className="ml-1 text-slate-400" title={a.citations.join(' · ')}>
                            — {a.citations[0]}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={sanitizeUrl(`https://t.me/s/${r.handle}`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-mini font-mono px-2 py-1 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40 inline-flex items-center gap-1"
                >
                  <ExternalLink size={11} /> t.me/s/{r.handle}
                </a>
                <a
                  href={sanitizeUrl(r.tgstat_url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-mini font-mono px-2 py-1 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40 inline-flex items-center gap-1"
                >
                  tgstat
                </a>
                {adminToken && (
                  <button
                    type="button"
                    onClick={() => addToWatch(r.handle)}
                    disabled={busy === r.handle}
                    className="text-mini font-mono px-2 py-1 rounded border border-emerald-600/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-50 inline-flex items-center gap-1"
                  >
                    {busy === r.handle ? <Loader2 size={11} className="animate-spin" /> : <Shield size={11} />}
                    add to watch
                  </button>
                )}
                {!adminToken && (
                  <span
                    className="text-micro font-mono text-slate-400 inline-flex items-center gap-1"
                    title="Set an admin token in the Settings tab to add channels directly from this view."
                  >
                    <Lock size={10} /> admin token required to add
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
