import { useEffect, useMemo, useState } from 'react';
import { sanitizeUrl } from '../../lib/sanitize-url';
import { Copy, ExternalLink, History, Newspaper, Radio, RefreshCw, ShieldAlert } from 'lucide-react';
import { DataState } from '../../components/DataState';
import { FeedAggregateCard } from '../../components/intel/FeedAggregateCard';
import { DataPageLayout } from '../../components/DataPageLayout';

/**
 * Breach / leak-forum tracker. Intelligence ABOUT forums only — directory
 * metadata + public OSINT-coverage links. Never the forums' contents.
 *
 * The page is composed of:
 *   1. The directory (deepdarkCTI + curated) — primary table
 *   2. Recent status changes — historical delta feed written by the hourly cron
 *   3. OSINT coverage — headlines from 8 public news sites matching breach keywords
 *   4. Forum mentions — headlines matching tight forum-brand keywords
 *
 * Sections 2-4 each have their own fetcher + error boundary so a transient
 * upstream failure on one source never blanks the whole page.
 */

interface ForumRow {
  name: string;
  origin: 'directory' | 'curated';
  category: string;
  url: string;
  onion: boolean;
  status: string;
  note?: string;
}
interface BreachForumsResponse {
  generated_at: string;
  rows: ForumRow[];
  totals: { directory: number; curated: number };
}

interface StatusDelta {
  name: string;
  category: string;
  from_status: string;
  to_status: string;
  observed_at: string;
  change: 'new' | 'removed' | 'changed' | 'unchanged';
}
interface BreachForumStatusResponse {
  generated_at: string;
  since: string;
  limit: number;
  deltas: StatusDelta[];
  total_rows: number;
}

interface CoverageItem {
  source_id: string;
  source_name: string;
  title: string;
  link: string;
  pubDate?: string;
  snippet: string;
  category?: string;
}
interface BreachCoverageResponse {
  generated_at: string;
  topic: 'breach' | 'forums' | 'custom';
  items: CoverageItem[];
  sources: Array<{ id: string; name: string; ok: boolean; items_fetched: number; error?: string }>;
  healthy: boolean;
}

function statusClass(s: string | undefined): string {
  const v = (s ?? '').toLowerCase();
  if (v === 'online' || v === 'active' || v === 'valid')
    return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  if (v === 'seized' || v === 'offline' || v === 'down' || v === 'defunct' || v === 'expired' || v === 'removed')
    return 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300';
  return 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300';
}

function formatTimestamp(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace('T', ' ').slice(0, 16) + 'Z';
}

function shortSourceId(id: string): string {
  return id.length > 24 ? id.slice(0, 22) + '…' : id;
}

export default function BreachForums(): JSX.Element {
  const [data, setData] = useState<BreachForumsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [statusData, setStatusData] = useState<BreachForumStatusResponse | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [coverageData, setCoverageData] = useState<BreachCoverageResponse | null>(null);
  const [coverageLoading, setCoverageLoading] = useState(true);
  const [coverageError, setCoverageError] = useState<string | null>(null);

  const [mentionsData, setMentionsData] = useState<BreachCoverageResponse | null>(null);
  const [mentionsLoading, setMentionsLoading] = useState(true);
  const [mentionsError, setMentionsError] = useState<string | null>(null);

  // Primary directory fetch
  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetch('/api/v1/breach-forums', { signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(15_000)]) })
      .then((r) => {
        if (!r.ok) throw new Error(`upstream ${r.status}`);
        return r.json() as Promise<BreachForumsResponse>;
      })
      .then((d) => alive && setData(d))
      .catch((e: { name?: string; message?: string }) => {
        if (!alive || e.name === 'AbortError') return;
        setError(e.message ?? 'failed');
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [refreshKey]);

  // Status-delta fetch — historical changes recorded by the hourly cron
  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();
    setStatusLoading(true);
    setStatusError(null);
    fetch('/api/v1/breach-forum-status/deltas?limit=25', {
      signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(15_000)]),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`upstream ${r.status}`);
        return r.json() as Promise<BreachForumStatusResponse>;
      })
      .then((d) => alive && setStatusData(d))
      .catch((e: { name?: string; message?: string }) => {
        if (!alive || e.name === 'AbortError') return;
        setStatusError(e.message ?? 'failed');
      })
      .finally(() => alive && setStatusLoading(false));
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [refreshKey]);

  // OSINT coverage — broad breach keyword filter
  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();
    setCoverageLoading(true);
    setCoverageError(null);
    fetch('/api/v1/breach-coverage?topic=breach&limit=15', {
      signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(15_000)]),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`upstream ${r.status}`);
        return r.json() as Promise<BreachCoverageResponse>;
      })
      .then((d) => alive && setCoverageData(d))
      .catch((e: { name?: string; message?: string }) => {
        if (!alive || e.name === 'AbortError') return;
        setCoverageError(e.message ?? 'failed');
      })
      .finally(() => alive && setCoverageLoading(false));
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [refreshKey]);

  // OSINT coverage — tight forum-brand filter
  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();
    setMentionsLoading(true);
    setMentionsError(null);
    fetch('/api/v1/breach-coverage?topic=forums&limit=10', {
      signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(15_000)]),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`upstream ${r.status}`);
        return r.json() as Promise<BreachCoverageResponse>;
      })
      .then((d) => alive && setMentionsData(d))
      .catch((e: { name?: string; message?: string }) => {
        if (!alive || e.name === 'AbortError') return;
        setMentionsError(e.message ?? 'failed');
      })
      .finally(() => alive && setMentionsLoading(false));
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [refreshKey]);

  const groups = useMemo(() => {
    const m = new Map<string, ForumRow[]>();
    for (const r of data?.rows ?? []) {
      const cat = r.category ?? 'Uncategorized';
      const arr = m.get(cat) ?? [];
      arr.push(r);
      m.set(cat, arr);
    }
    return [...m.entries()].sort((a, b) =>
      a[0] === 'Notable breach/leak forum' ? -1 : b[0] === 'Notable breach/leak forum' ? 1 : a[0].localeCompare(b[0])
    );
  }, [data]);

  const copy = (t: string) => void navigator.clipboard?.writeText(t);

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<ShieldAlert size={28} />}
      title="Breach / leak-forum tracker"
      description={
        <p className="text-muted max-w-3xl leading-relaxed">
          A directory of criminal forums and dark markets (community-maintained deepdarkCTI list) plus a curated set of
          notable breach/leak forums. This is <strong>intelligence about</strong> these venues — names, status, public
          OSINT coverage, and historical status deltas.
        </p>
      }
      headerExtra={
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 font-mono text-mini text-amber-700 dark:text-amber-300 max-w-3xl mb-6">
          No forum content, credentials, or breach data is fetched, parsed, or linked here. Curated entries link to
          public OSINT coverage (DarkWebInformer search), not to the forums themselves.
        </div>
      }
    >
      {/* Source-health summary banner */}
      {(error || statusError || coverageError || mentionsError) && (
        <div className="rounded-xl border border-rose-300/70 dark:border-rose-800/60 bg-rose-50/60 dark:bg-rose-950/30 p-3 mb-6 flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono text-rose-700 dark:text-rose-300">
            {[error && 'directory', statusError && 'status', coverageError && 'coverage', mentionsError && 'mentions']
              .filter(Boolean)
              .join(', ')}{' '}
            — tap Retry on the failed section below
          </span>
        </div>
      )}
      <section className="surface-card p-4 mb-6 flex items-center justify-between gap-3 flex-wrap">
        {data && (
          <p className="text-mini font-mono text-slate-500 dark:text-slate-400">
            {data.rows.length} entries · {data.totals.directory} from deepdarkCTI · {data.totals.curated} curated
          </p>
        )}
        <button
          type="button"
          onClick={() => setRefreshKey((k) => k + 1)}
          className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-2 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40"
        >
          <RefreshCw size={12} /> refresh
        </button>
      </section>

      {data && data.rows.length > 0 && (
        <FeedAggregateCard
          sourceId="breach-forums"
          sourceName="Breach / leak-forum tracker"
          title="Breach-forum tracker · today"
          items={data.rows.map((r) => ({
            title: r.name,
            body: `${r.category ?? ''} · ${r.status ?? 'unknown'} · ${r.note ?? ''}`,
          }))}
        />
      )}

      <DataState
        loading={loading}
        error={error}
        empty={!!data && data.rows.length === 0}
        emptyLabel="No forum directory rows available this snapshot."
        onRetry={() => setRefreshKey((k) => k + 1)}
        rows={8}
      >
        <div className="space-y-6">
          {groups.map(([category, rows]) => (
            <div key={category}>
              <h2 className="font-display font-semibold text-sm mb-2">
                {category} <span className="font-mono text-mini text-slate-500">· {rows.length}</span>
              </h2>
              <ul className="grid gap-2 md:grid-cols-2">
                {rows.map((r, i) => (
                  <li key={`${r.name}-${i}`} className="surface-card p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display font-semibold text-sm truncate" title={r.name}>
                        {r.name}
                      </span>
                      <span className="flex items-center gap-1 shrink-0">
                        {r.onion && (
                          <span className="rounded border border-slate-400/40 bg-slate-400/10 px-1 py-0.5 font-mono text-micro uppercase text-slate-500">
                            onion
                          </span>
                        )}
                        <span
                          className={`rounded border px-1.5 py-0.5 font-mono text-micro uppercase ${statusClass(r.status)}`}
                        >
                          {r.status ?? 'unknown'}
                        </span>
                      </span>
                    </div>
                    {r.note && <p className="font-mono text-mini text-slate-500 mt-1 leading-relaxed">{r.note}</p>}
                    <div className="flex items-center gap-2 mt-1.5">
                      {r.origin === 'curated' ? (
                        <a
                          href={sanitizeUrl(r.url) || undefined}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-mini text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
                        >
                          OSINT coverage <ExternalLink size={9} />
                        </a>
                      ) : (
                        <code className="font-mono text-mini text-muted break-all">{r.url}</code>
                      )}
                      <button
                        type="button"
                        onClick={() => copy(r.url)}
                        className="shrink-0 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] p-1 text-slate-500 hover:text-brand-600"
                        aria-label="Copy URL"
                      >
                        <Copy size={11} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DataState>

      {/* ── Recent status changes ──────────────────────────────────────── */}
      <section className="mt-10" aria-labelledby="status-deltas">
        <h2 id="status-deltas" className="text-xl font-display font-semibold mb-2 flex items-center gap-2">
          <History size={18} className="text-brand-600 dark:text-brand-400" /> Recent status changes
        </h2>
        <p className="text-muted text-sm mb-4 max-w-3xl leading-relaxed">
          Hourly diff against the deepdarkCTI snapshot. First-observations, removals, and status transitions only —
          no-op snapshots are dropped. Persisted by the scheduled Worker, not reconstructed on each read.
        </p>
        <DataState
          loading={statusLoading}
          error={statusError}
          empty={!!statusData && statusData.deltas.length === 0}
          emptyLabel="No status changes recorded in this window. The hourly cron writes a row per change; check back after the next snapshot."
          onRetry={() => setRefreshKey((k) => k + 1)}
          rows={4}
        >
          {statusData && statusData.deltas.length > 0 && (
            <ul className="space-y-1.5">
              {statusData.deltas.map((d, i) => (
                <li
                  key={`${d.name}-${d.observed_at}-${i}`}
                  className="surface-card p-3 flex items-center gap-3 flex-wrap"
                >
                  <span className="font-display font-semibold text-sm truncate" title={d.name}>
                    {d.name}
                  </span>
                  <span className="font-mono text-micro text-slate-500 shrink-0">{d.category}</span>
                  <span className="flex items-center gap-1.5 ml-auto">
                    <span
                      className={`rounded border px-1.5 py-0.5 font-mono text-micro uppercase ${statusClass(d.from_status)}`}
                      title="previous status"
                    >
                      {d.from_status}
                    </span>
                    <span className="font-mono text-micro text-slate-500">→</span>
                    <span
                      className={`rounded border px-1.5 py-0.5 font-mono text-micro uppercase ${statusClass(d.to_status)}`}
                      title="new status"
                    >
                      {d.to_status}
                    </span>
                    <span
                      className={`rounded border px-1.5 py-0.5 font-mono text-micro uppercase ${
                        d.change === 'new'
                          ? 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300'
                          : d.change === 'removed'
                            ? 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                            : d.change === 'changed'
                              ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                              : 'border-slate-400/40 bg-slate-400/10 text-slate-500'
                      }`}
                    >
                      {d.change}
                    </span>
                  </span>
                  <span className="font-mono text-micro text-slate-500 w-full">{formatTimestamp(d.observed_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </DataState>
      </section>

      {/* ── OSINT coverage ─────────────────────────────────────────────── */}
      <section className="mt-10" aria-labelledby="osint-coverage">
        <h2 id="osint-coverage" className="text-xl font-display font-semibold mb-2 flex items-center gap-2">
          <Newspaper size={18} className="text-brand-600 dark:text-brand-400" /> OSINT coverage
        </h2>
        <p className="text-muted text-sm mb-4 max-w-3xl leading-relaxed">
          Headlines from 8 public cybersecurity news sites (DarkWebInformer, DataBreaches.net, BleepingComputer, The
          Record, Threatpost, HackRead, SecurityWeek, CyberScoop) ranked by keyword density and recency. No forum links,
          no leak dumps — just the press.
        </p>
        {coverageData && (
          <p className="text-mini font-mono text-slate-500 mb-2">
            {coverageData.items.length} headlines · {coverageData.sources.filter((s) => s.ok).length}/
            {coverageData.sources.length} sources OK
          </p>
        )}
        <DataState
          loading={coverageLoading}
          error={coverageError}
          empty={!!coverageData && coverageData.items.length === 0}
          emptyLabel="No matching headlines from OSINT sources in this window."
          onRetry={() => setRefreshKey((k) => k + 1)}
          rows={5}
        >
          {coverageData && coverageData.items.length > 0 && (
            <ul className="space-y-2">
              {coverageData.items.map((it, i) => (
                <li key={`${it.link}-${i}`} className="surface-card p-3">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <a
                      href={sanitizeUrl(it.link) || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-display font-semibold text-sm text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
                    >
                      {it.title} <ExternalLink size={10} />
                    </a>
                    <span className="font-mono text-micro text-slate-500 ml-auto" title={it.source_id}>
                      {it.source_name || shortSourceId(it.source_id)}
                    </span>
                  </div>
                  {it.snippet && <p className="text-meta text-muted mt-1 leading-relaxed">{it.snippet}</p>}
                  <p className="font-mono text-micro text-slate-500 mt-1">{formatTimestamp(it.pubDate)}</p>
                </li>
              ))}
            </ul>
          )}
        </DataState>
      </section>

      {/* ── Forum mentions ─────────────────────────────────────────────── */}
      <section className="mt-10" aria-labelledby="forum-mentions">
        <h2 id="forum-mentions" className="text-xl font-display font-semibold mb-2 flex items-center gap-2">
          <Radio size={18} className="text-brand-600 dark:text-brand-400" /> Forum mentions in OSINT
        </h2>
        <p className="text-muted text-sm mb-4 max-w-3xl leading-relaxed">
          Tight filter — only headlines that name a specific leak forum (BreachForums, Leakbase, Cracked, XSS, Dread,
          Sinisterly, Exploit, etc.). Useful for spotting law-enforcement seizures and successor-site chatter.
        </p>
        {mentionsData && (
          <p className="text-mini font-mono text-slate-500 mb-2">
            {mentionsData.items.length} mentions · {mentionsData.sources.filter((s) => s.ok).length}/
            {mentionsData.sources.length} sources OK
          </p>
        )}
        <DataState
          loading={mentionsLoading}
          error={mentionsError}
          empty={!!mentionsData && mentionsData.items.length === 0}
          emptyLabel="No forum-specific mentions in the current window."
          onRetry={() => setRefreshKey((k) => k + 1)}
          rows={3}
        >
          {mentionsData && mentionsData.items.length > 0 && (
            <ul className="space-y-2">
              {mentionsData.items.map((it, i) => (
                <li key={`${it.link}-${i}`} className="surface-card p-3">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <a
                      href={sanitizeUrl(it.link) || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-display font-semibold text-sm text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
                    >
                      {it.title} <ExternalLink size={10} />
                    </a>
                    <span className="font-mono text-micro text-slate-500 ml-auto">{it.source_name}</span>
                  </div>
                  {it.snippet && <p className="text-meta text-muted mt-1 leading-relaxed">{it.snippet}</p>}
                </li>
              ))}
            </ul>
          )}
        </DataState>
      </section>
    </DataPageLayout>
  );
}
