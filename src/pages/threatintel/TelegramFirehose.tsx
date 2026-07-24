import { useEffect, useMemo, useState, useCallback } from 'react';
import { RefreshCw, Radio, Search, AlertTriangle, ExternalLink, Zap } from 'lucide-react';
import { DataState } from '../../components/DataState';
import { useDebounce } from '../../hooks/useDebounce';
import { relativeAgo } from '../../lib/relativeTime';
import { sanitizeUrl } from '../../lib/sanitize-url';
import { useLastVisit, isNewSince } from '../../hooks';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Source = 'feed' | 'leak' | 'liveioc';
type Severity = 'critical' | 'high' | 'medium' | 'low' | 'unknown';

interface TelegramFeedItem {
  channel_handle: string;
  channel_name: string;
  channel_topic: string;
  channel_blurb: string;
  permalink: string;
  datetime: string;
  text: string;
  views?: string;
}

interface TelegramFeedResponse {
  generated_at: string;
  channels: { handle: string; name: string; ok: boolean; count: number }[];
  items: TelegramFeedItem[];
  warnings: string[];
}

interface LeakEntry {
  id: number;
  channel_handle: string;
  message_link: string | null;
  message_text: string | null;
  leak_type: string;
  severity: Severity;
  discovered_at: string;
  credential_count: number;
  domains_found: string;
}

interface LiveIoc {
  value: string;
  kind: 'ip' | 'url' | 'domain' | 'hash';
  source: string;
  reporter?: string;
  context?: string;
  reference_url?: string;
  observed_at?: string;
}

interface LiveIocsResponse {
  generated_at: string;
  total: number;
  items: LiveIoc[];
  sources?: { id: string; ok: boolean; count: number }[];
}

type FirehoseItem = {
  id: string;
  ts: string;
  source: Source;
  severity: Severity;
  title: string;
  body: string;
  channel: string;
  link: string | null;
  meta: Record<string, string>;
};

const SEVERITY_TONE: Record<Severity, string> = {
  critical: 'border-rose-500/50 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  high: 'border-orange-500/50 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  medium: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  low: 'border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500',
  unknown: 'border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500',
};

const SOURCE_TONE: Record<Source, string> = {
  feed: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  leak: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  liveioc: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
};

const SOURCE_LABEL: Record<Source, string> = {
  feed: 't.me/s firehose',
  leak: 'leak monitor',
  liveioc: 'live IOC',
};

const PAGE_SIZE = 100;
const REFRESH_MS = 60_000; // 1 minute — gentle on the edge cache

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function TelegramFirehose(): JSX.Element {
  const [feed, setFeed] = useState<TelegramFeedResponse | null>(null);
  const [leaks, setLeaks] = useState<LeakEntry[]>([]);
  const [liveIocs, setLiveIocs] = useState<LiveIoc[]>([]);

  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [leakLoading, setLeakLoading] = useState(true);
  const [leakError, setLeakError] = useState<string | null>(null);
  const [liveLoading, setLiveLoading] = useState(true);
  const [liveError, setLiveError] = useState<string | null>(null);

  const [refreshKey, setRefreshKey] = useState(0);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 150);
  const [sourceFilter, setSourceFilter] = useState<Set<Source>>(new Set<Source>(['feed', 'leak', 'liveioc']));
  const [severityFilter, setSeverityFilter] = useState<Set<Severity>>(
    new Set<Severity>(['critical', 'high', 'medium', 'low', 'unknown'])
  );
  const [newOnly, setNewOnly] = useState(false);
  const { previous: lastVisit, markVisited } = useLastVisit('telegram-firehose');
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // ----------------- Fetchers -----------------
  const getSignal = (ctrl: AbortController) => AbortSignal.any([ctrl.signal, AbortSignal.timeout(15000)]);

  const fetchFeed = useCallback(async (ctrl?: AbortController) => {
    setFeedLoading(true);
    setFeedError(null);
    try {
      const r = await fetch('/api/v1/telegram-feed', ctrl ? { signal: getSignal(ctrl) } : undefined);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as TelegramFeedResponse;
      setFeed(j);
    } catch (e) {
      console.error('handler failed:', e instanceof Error ? e.message : String(e));
      setFeedError((e as Error).message);
    } finally {
      setFeedLoading(false);
    }
  }, []);

  const fetchLeaks = useCallback(async (ctrl?: AbortController) => {
    setLeakLoading(true);
    setLeakError(null);
    try {
      const r = await fetch('/api/v1/telegram-leaks/search?limit=80', ctrl ? { signal: getSignal(ctrl) } : undefined);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as { entries: LeakEntry[] };
      setLeaks(j.entries ?? []);
    } catch (e) {
      console.error('handler failed:', e instanceof Error ? e.message : String(e));
      setLeakError((e as Error).message);
    } finally {
      setLeakLoading(false);
    }
  }, []);

  const fetchLive = useCallback(async (ctrl?: AbortController) => {
    setLiveLoading(true);
    setLiveError(null);
    try {
      const r = await fetch('/api/v1/live-iocs?limit=80', ctrl ? { signal: getSignal(ctrl) } : undefined);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as LiveIocsResponse;
      setLiveIocs((j.items ?? []).filter((it) => it.source === 'telegram-leak' || it.source === 'telegram'));
    } catch (e) {
      console.error('handler failed:', e instanceof Error ? e.message : String(e));
      setLiveError((e as Error).message);
    } finally {
      setLiveLoading(false);
    }
  }, []);

  const refreshAll = useCallback(
    async (ctrl?: AbortController) => {
      await Promise.all([fetchFeed(ctrl), fetchLeaks(ctrl), fetchLive(ctrl)]);
      setLastRefresh(new Date());
    },
    [fetchFeed, fetchLeaks, fetchLive]
  );

  useEffect(() => {
    const ctrl = new AbortController();
    void refreshAll(ctrl);
    const id = window.setInterval(() => {
      void refreshAll();
    }, REFRESH_MS);
    return () => {
      ctrl.abort();
      window.clearInterval(id);
    };
  }, [refreshAll, refreshKey]);

  useEffect(() => {
    if (lastRefresh) {
      const id = window.setTimeout(markVisited, 1500);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [lastRefresh, markVisited]);

  // ----------------- Merge + filter -----------------
  const items: FirehoseItem[] = useMemo(() => {
    const out: FirehoseItem[] = [];
    for (const it of feed?.items ?? []) {
      out.push({
        id: `feed:${it.permalink}`,
        ts: it.datetime,
        source: 'feed',
        severity: 'unknown',
        title: it.channel_name,
        body: it.text,
        channel: it.channel_handle,
        link: it.permalink,
        meta: { views: it.views ?? '—' },
      });
    }
    for (const l of leaks) {
      out.push({
        id: `leak:${l.id}`,
        ts: l.discovered_at,
        source: 'leak',
        severity: l.severity,
        title: `${l.leak_type} · ${l.channel_handle}`,
        body: l.message_text ?? '',
        channel: l.channel_handle,
        link: l.message_link,
        meta: {
          credentials: l.credential_count ? `${l.credential_count} creds` : '—',
          domains: (() => {
            try {
              const arr = JSON.parse(l.domains_found);
              return Array.isArray(arr) && arr.length > 0 ? `${arr.length} domains` : '—';
            } catch (_catchErr) {
              console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
              return '—';
            }
          })(),
        },
      });
    }
    for (const i of liveIocs) {
      out.push({
        id: `live:${i.kind}:${i.value}:${i.observed_at ?? ''}`,
        ts: i.observed_at ?? feed?.generated_at ?? new Date().toISOString(),
        source: 'liveioc',
        severity: 'medium',
        title: `${i.kind.toUpperCase()}: ${i.value}`,
        body: i.context ?? '',
        channel: i.reporter ?? i.source,
        link: i.reference_url ?? null,
        meta: { source: i.source },
      });
    }
    out.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
    return out;
  }, [feed, leaks, liveIocs]);

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    return items.filter((it) => {
      if (!sourceFilter.has(it.source)) return false;
      if (!severityFilter.has(it.severity)) return false;
      if (newOnly && !isNewSince(it.ts, lastVisit)) return false;
      if (q) {
        const hay = `${it.title} ${it.body} ${it.channel}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, debouncedQuery, sourceFilter, severityFilter, newOnly, lastVisit]);

  const visible = filtered.slice(0, PAGE_SIZE);
  const newCount = items.filter((it) => isNewSince(it.ts, lastVisit)).length;

  // ----------------- Render -----------------
  const toggleSource = (s: Source) => {
    setSourceFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };
  const toggleSeverity = (s: Severity) => {
    setSeverityFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const counts = useMemo(() => {
    const c: Record<Source, number> = { feed: 0, leak: 0, liveioc: 0 };
    for (const it of items) c[it.source] += 1;
    return c;
  }, [items]);

  const anyLoading = feedLoading && leakLoading && liveLoading;
  const anyError = feedError || leakError || liveError;

  return (
    <div className="space-y-4">
      {/* Header strip */}
      <section className="surface-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="font-display font-semibold text-lg flex items-center gap-2">
              <Radio size={18} className="text-brand-600 dark:text-brand-400" /> Telegram firehose
              <span className="text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-brand-500/30 bg-brand-500/10 text-brand-700 dark:text-brand-400">
                live · auto-refresh 60s
              </span>
            </h2>
            <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-1.5 max-w-2xl leading-relaxed">
              Unified cross-source stream merging{' '}
              <code className="text-mini bg-slate-100 dark:bg-[rgb(var(--surface-300))] px-1 py-0.5 rounded">
                t.me/s
              </code>{' '}
              firehose (curated public channels, 30d window), leak-monitor entries (critical/high credentials + domains)
              and live-IOCs with{' '}
              <code className="text-mini bg-slate-100 dark:bg-[rgb(var(--surface-300))] px-1 py-0.5 rounded">
                telegram-leak
              </code>{' '}
              source. Newest first.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setRefreshKey((k) => k + 1)}
              className="text-mini font-mono px-2.5 py-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40 inline-flex items-center gap-1"
            >
              <RefreshCw size={11} className={anyLoading ? 'animate-spin' : ''} /> refresh
            </button>
            {lastRefresh && (
              <span className="text-micro font-mono text-slate-500">
                updated {relativeAgo(lastRefresh.toISOString(), 'just now')}
              </span>
            )}
            {newCount > 0 && (
              <span className="text-micro font-mono px-1.5 py-0.5 rounded border border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300 inline-flex items-center gap-1">
                <Zap size={10} /> {newCount} new
              </span>
            )}
          </div>
        </div>

        {/* Source + severity pills */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
            sources:
          </span>
          {(['feed', 'leak', 'liveioc'] as Source[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggleSource(s)}
              className={`text-mini font-mono px-2 py-0.5 rounded border transition-opacity ${
                SOURCE_TONE[s]
              } ${sourceFilter.has(s) ? 'opacity-100' : 'opacity-40'}`}
              aria-pressed={sourceFilter.has(s)}
            >
              {SOURCE_LABEL[s]} <span className="ml-1 opacity-70">{counts[s]}</span>
            </button>
          ))}
          <span className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 ml-2">
            severity:
          </span>
          {(['critical', 'high', 'medium', 'low', 'unknown'] as Severity[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggleSeverity(s)}
              className={`text-mini font-mono px-2 py-0.5 rounded border transition-opacity ${
                SEVERITY_TONE[s]
              } ${severityFilter.has(s) ? 'opacity-100' : 'opacity-40'}`}
              aria-pressed={severityFilter.has(s)}
            >
              {s}
            </button>
          ))}
          <label className="text-mini font-mono inline-flex items-center gap-1.5 ml-auto cursor-pointer">
            <input
              type="checkbox"
              checked={newOnly}
              onChange={(e) => setNewOnly(e.target.checked)}
              className="accent-brand-600"
            />
            <span>new only</span>
          </label>
        </div>

        {/* Search */}
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search
              size={12}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="filter by keyword, handle, or IOC value…"
              className="w-full pl-7 pr-3 py-1.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200)/0.4)] text-sm font-mono focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
              aria-label="Filter firehose"
            />
          </div>
        </div>

        {anyError && (
          <div className="mt-3 rounded border border-rose-500/40 bg-rose-500/10 p-2 font-mono text-xs text-rose-700 dark:text-rose-300 inline-flex items-center gap-1.5">
            <AlertTriangle size={12} /> {anyError}
          </div>
        )}
      </section>

      {/* Items */}
      <DataState
        loading={anyLoading && items.length === 0}
        error={anyError}
        empty={!anyLoading && items.length === 0}
        rows={6}
      >
        <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mb-2">
          showing {visible.length} of {filtered.length} items (total merged: {items.length})
        </p>
        <ul className="space-y-2">
          {visible.map((it) => (
            <FirehoseRow key={it.id} item={it} />
          ))}
        </ul>
        {filtered.length > visible.length && (
          <p className="mt-3 text-mini font-mono text-slate-500 text-center">
            ... {filtered.length - visible.length} more -- refine filters to narrow ...
          </p>
        )}
      </DataState>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Row                                                                */
/* ------------------------------------------------------------------ */

function FirehoseRow({ item }: { item: FirehoseItem }): JSX.Element {
  return (
    <li
      className={`rounded-xl border bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-3 ${
        item.severity === 'critical' || item.severity === 'high'
          ? 'border-rose-500/30'
          : 'border-slate-200 dark:border-[rgb(var(--border-400))]'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2 mb-1.5">
        <span
          className={`text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${SOURCE_TONE[item.source]}`}
        >
          {SOURCE_LABEL[item.source]}
        </span>
        {item.severity !== 'unknown' && (
          <span
            className={`text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${SEVERITY_TONE[item.severity]}`}
          >
            {item.severity}
          </span>
        )}
        <span className="text-micro font-mono text-slate-500 dark:text-slate-400">@{item.channel}</span>
        <span className="text-micro font-mono text-slate-400 ml-auto">{relativeAgo(item.ts, '—')}</span>
      </div>
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex-1 min-w-0">
          {item.source === 'liveioc' && (
            <p className="font-mono text-sm text-slate-900 dark:text-slate-100 break-all">{item.title}</p>
          )}
          {item.source !== 'liveioc' && (
            <p className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">{item.title}</p>
          )}
          {item.body && <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-2">{item.body}</p>}
          <div className="flex flex-wrap gap-2 mt-1.5 text-micro font-mono text-slate-500">
            {Object.entries(item.meta).map(([k, v]) => (
              <span key={k}>
                {k}: <span className="text-slate-700 dark:text-slate-300">{v}</span>
              </span>
            ))}
          </div>
        </div>
        {item.link && (
          <a
            href={sanitizeUrl(item.link)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-mini font-mono px-2 py-1 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40 inline-flex items-center gap-1 shrink-0"
          >
            <ExternalLink size={11} /> open
          </a>
        )}
      </div>
    </li>
  );
}
