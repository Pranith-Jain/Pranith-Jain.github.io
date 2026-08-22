import { logCatch } from '../../lib/log';
import { useState, useCallback, useRef } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { DataTable, type DataTableColumn } from '../../components/ui/DataTable';
import { RefreshCw, ExternalLink, Search, Calendar, ShieldAlert, Info } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface MispEvent {
  Event: {
    id: string;
    uuid: string;
    info: string;
    date: string;
    threat_level_id: string;
    analysis: string;
    orgc: string | { name: string };
    tags: { Tag: { name: string; colour?: string } }[];
    published: boolean;
    timestamp: string;
    Attribute?: MispAttribute[];
    Object?: MispObject[];
    Galaxy?: MispGalaxy[];
    related_events?: RelatedEvent[];
  };
}

interface MispAttribute {
  id: string;
  type: string;
  category: string;
  value: string;
  timestamp: string;
  comment: string;
  to_ids: boolean;
}

interface MispObject {
  id: string;
  name: string;
  meta_category: string;
  description: string;
  Attribute: MispAttribute[];
}

interface MispGalaxy {
  Galaxy: {
    id: string;
    uuid: string;
    name: string;
    type: string;
    description: string;
  };
  GalaxyCluster: {
    id: string;
    uuid: string;
    value: string;
    description: string;
    tag_name: string;
  }[];
}

interface RelatedEvent {
  Event: {
    id: string;
    uuid: string;
    info: string;
    date: string;
    orgc: string | { name: string };
  };
}

const THREAT_LEVELS: Record<string, { label: string; color: string; icon: LucideIcon }> = {
  '1': { label: 'High', color: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20', icon: ShieldAlert },
  '2': {
    label: 'Medium',
    color: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20',
    icon: ShieldAlert,
  },
  '3': {
    label: 'Low',
    color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20',
    icon: ShieldAlert,
  },
  '4': { label: 'Undefined', color: 'text-slate-500 bg-slate-50 dark:bg-[rgb(var(--surface-300))]', icon: ShieldAlert },
};

const ANALYSIS_LABELS: Record<string, string> = {
  '0': 'Initial',
  '1': 'Ongoing',
  '2': 'Completed',
};

export default function MispBrowser() {
  const [baseUrl, setBaseUrl] = useState(() => sessionStorage.getItem('mispUrl') ?? '');
  // API key is held in memory only - never persisted. Persisting a third-party
  // credential in sessionStorage exposes it to any XSS or malicious extension.
  const [apiKey, setApiKey] = useState('');
  const [connected, setConnected] = useState(false);

  const [events, setEvents] = useState<MispEvent[]>([]);
  const [selected, setSelected] = useState<MispEvent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [tagFilter, setTagFilter] = useState('');

  const proxy = useCallback(
    async (endpoint: string, params?: Record<string, string>, signal?: AbortSignal) => {
      const res = await fetch('/api/v1/misp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl, apiKey, endpoint, params }),
        signal,
      });
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      return res.json();
    },
    [baseUrl, apiKey]
  );

  const connectRef = useRef<AbortController | null>(null);

  const connect = useCallback(async () => {
    if (!baseUrl || !apiKey) return;
    connectRef.current?.abort();
    const ctrl = new AbortController();
    connectRef.current = ctrl;
    setError('');
    setLoading(true);
    try {
      const data = await proxy(
        'events/index/limit:1',
        undefined,
        AbortSignal.any([ctrl.signal, AbortSignal.timeout(15_000)])
      );
      if (ctrl.signal.aborted) return;
      if (Array.isArray(data)) {
        sessionStorage.setItem('mispUrl', baseUrl);
        setConnected(true);
        await loadEvents(1);
      } else {
        throw new Error('Unexpected response format');
      }
    } catch (err) {
      logCatch(err);
      if (ctrl.signal.aborted) return;
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
    // loadEvents is declared below (a stable useCallback) and is only invoked
    // inside connect - listing it here would be a use-before-declaration error.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl, apiKey, proxy]);

  const eventsRef = useRef<AbortController | null>(null);

  const loadEvents = useCallback(
    async (p: number) => {
      eventsRef.current?.abort();
      const ctrl = new AbortController();
      eventsRef.current = ctrl;
      setLoading(true);
      setError('');
      try {
        const params: Record<string, string> = { page: String(p), limit: '20' };
        if (search) params.searchall = search;
        if (tagFilter) params.tags = tagFilter;
        const data = await proxy('events/index', params, AbortSignal.any([ctrl.signal, AbortSignal.timeout(15_000)]));
        if (ctrl.signal.aborted) return;
        if (Array.isArray(data)) {
          setEvents(data);
          setPage(p);
          setTotal(data.length === 20 ? p * 20 : p * 20 - 20 + data.length);
        }
      } catch (err) {
        logCatch(err);
        if (ctrl.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to load events');
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    },
    [proxy, search, tagFilter]
  );

  const detailRef = useRef<AbortController | null>(null);

  const loadEventDetail = useCallback(
    async (id: string) => {
      detailRef.current?.abort();
      const ctrl = new AbortController();
      detailRef.current = ctrl;
      setLoading(true);
      try {
        const data = await proxy(
          `events/${id}`,
          undefined,
          AbortSignal.any([ctrl.signal, AbortSignal.timeout(15_000)])
        );
        if (ctrl.signal.aborted) return;
        if (data?.Event) {
          setSelected(data);
        }
      } catch (err) {
        logCatch(err);
        if (ctrl.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to load event');
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    },
    [proxy]
  );

  const disconnect = () => {
    sessionStorage.removeItem('mispUrl');
    sessionStorage.removeItem('mispKey');
    setConnected(false);
    setBaseUrl('');
    setApiKey('');
    setEvents([]);
    setSelected(null);
    setSearch('');
    setTagFilter('');
    setPage(1);
    setTotal(0);
  };

  if (!connected) {
    return (
      <DataPageLayout
        backTo="/threatintel"
        icon={<ShieldAlert size={28} />}
        title="MISP Browser"
        description="Connect to a MISP instance"
      >
        <div className="max-w-lg space-y-4">
          <div>
            <label htmlFor="misp-base-url" className="text-xs font-mono text-slate-500 mb-1 block">
              MISP URL
            </label>
            <input
              id="misp-base-url"
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="w-full rounded-xl border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-2 text-xs font-mono text-slate-900 dark:text-slate-100"
              placeholder="https://misp.example.com"
            />
          </div>
          <div>
            <label htmlFor="misp-api-key" className="text-xs font-mono text-slate-500 mb-1 block">
              API Key
            </label>
            <input
              id="misp-api-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full rounded-xl border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-2 text-xs font-mono text-slate-900 dark:text-slate-100"
              placeholder="MISP API key"
            />
          </div>
          <p className="text-mini font-mono text-muted italic">
            Your API key is sent to the MISP server via a Worker proxy and kept in memory only - it is never stored. You
            will need to re-enter it after a page reload.
          </p>
          <button
            type="button"
            onClick={() => void connect()}
            disabled={loading || !baseUrl || !apiKey}
            className="px-4 py-2 text-xs font-mono rounded-xl bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {loading ? 'Connecting...' : 'Connect'}
          </button>
          {error && (
            <div className="text-xs font-mono p-2 rounded-xl bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400">
              {error}
            </div>
          )}
        </div>
      </DataPageLayout>
    );
  }

  if (selected) {
    const e = selected.Event;
    const tl = (THREAT_LEVELS[e.threat_level_id] ?? THREAT_LEVELS['4'])!;
    const TlIcon = tl.icon;
    return (
      <DataPageLayout backTo="/threatintel" hideBack icon={<ShieldAlert size={28} />} title={e.info || '(no info)'}>
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="inline-flex items-center gap-2 text-sm text-muted hover:text-rose-600 dark:hover:text-rose-400 mb-4 font-mono"
        >
          back to events
        </button>

        <div className="surface-card p-6 space-y-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1">
              <h2 className="font-display font-bold text-xl text-slate-900 dark:text-slate-100">
                {e.info || '(no info)'}
              </h2>
              <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-slate-500">
                <Calendar size={12} /> {e.date}
                <span className="text-slate-700 dark:text-slate-300">·</span>
                Org: {typeof e.orgc === 'object' ? e.orgc.name : e.orgc}
                <span className="text-slate-700 dark:text-slate-300">·</span>
                ID: {e.uuid?.slice(0, 8)}…
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-mini font-mono ${tl.color}`}>
                <TlIcon size={12} /> {tl.label}
              </span>
              <span className="text-mini font-mono px-2 py-1 rounded bg-slate-100 dark:bg-[rgb(var(--surface-300))] text-muted">
                {ANALYSIS_LABELS[e.analysis] ?? 'Unknown'}
              </span>
              {e.published && (
                <span className="text-mini font-mono px-2 py-1 rounded bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400">
                  Published
                </span>
              )}
            </div>
          </div>

          {e.Attribute && e.Attribute.length > 0 && (
            <div>
              <h3 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-muted font-mono mb-2">
                Attributes ({e.Attribute.length})
              </h3>
              <div className="overflow-auto max-h-80">
                <DataTable
                  columns={
                    [
                      {
                        key: 'type',
                        header: 'Type',
                        sortValue: (a: (typeof e.Attribute)[number]) => a.type,
                        render: (a) => <span className="text-slate-500">{a.type}</span>,
                      },
                      {
                        key: 'category',
                        header: 'Category',
                        sortValue: (a: (typeof e.Attribute)[number]) => a.category,
                        render: (a) => <span className="text-slate-500">{a.category}</span>,
                      },
                      {
                        key: 'value',
                        header: 'Value',
                        sortValue: (a: (typeof e.Attribute)[number]) => a.value,
                        render: (a) => (
                          <span className="text-slate-900 dark:text-slate-100 break-all max-w-md">{a.value}</span>
                        ),
                      },
                      {
                        key: 'ids',
                        header: 'IDS',
                        render: (a) =>
                          a.to_ids ? (
                            <span className="text-emerald-600 dark:text-emerald-400">ok</span>
                          ) : (
                            <span className="text-muted">-</span>
                          ),
                      },
                      {
                        key: 'comment',
                        header: 'Comment',
                        render: (a) => <span className="text-muted max-w-xs truncate">{a.comment || ''}</span>,
                      },
                    ] as DataTableColumn<(typeof e.Attribute)[number]>[]
                  }
                  rows={e.Attribute}
                  rowKey={(a) => String(a.id)}
                />
              </div>
            </div>
          )}

          {e.Object && e.Object.length > 0 && (
            <div>
              <h3 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-muted font-mono mb-2">
                Objects ({e.Object.length})
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {e.Object.map((o) => (
                  <div
                    key={o.id}
                    className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] p-3 space-y-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{o.name}</span>
                      <span className="text-micro font-mono text-muted">{o.meta_category}</span>
                    </div>
                    {o.description && <p className="text-mini font-mono text-muted">{o.description}</p>}
                    {o.Attribute && o.Attribute.length > 0 && (
                      <ul className="space-y-1">
                        {o.Attribute.slice(0, 5).map((a) => (
                          <li key={a.id} className="text-mini font-mono text-muted truncate">
                            <span className="text-muted">{a.type}:</span> {a.value}
                          </li>
                        ))}
                        {o.Attribute.length > 5 && (
                          <li className="text-mini font-mono text-muted italic">+{o.Attribute.length - 5} more</li>
                        )}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {e.Galaxy && e.Galaxy.length > 0 && (
            <div>
              <h3 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-muted font-mono mb-2">
                Galaxies ({e.Galaxy.length})
              </h3>
              <div className="flex flex-wrap gap-2">
                {e.Galaxy.map((g) => (
                  <div
                    key={g.Galaxy.id}
                    className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] p-3 max-w-sm"
                  >
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">{g.Galaxy.name}</div>
                    {g.GalaxyCluster && g.GalaxyCluster.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {g.GalaxyCluster.map((c) => (
                          <span
                            key={c.id}
                            className="text-micro font-mono px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300"
                          >
                            {c.value}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {e.tags && e.tags.length > 0 && (
            <div>
              <h3 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-muted font-mono mb-2">
                Tags ({e.tags.length})
              </h3>
              <div className="flex flex-wrap gap-1">
                {e.tags.map((t) => (
                  <span
                    key={t.Tag.name}
                    className="text-micro font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[rgb(var(--surface-300))] text-muted"
                  >
                    {t.Tag.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {e.related_events && e.related_events.length > 0 && (
            <div>
              <h3 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-muted font-mono mb-2">
                Related Events ({e.related_events.length})
              </h3>
              <div className="grid gap-2">
                {e.related_events.map((r) => (
                  <button
                    type="button"
                    key={r.Event.id}
                    onClick={() => loadEventDetail(r.Event.id)}
                    className="text-left text-xs font-mono px-3 py-2 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] hover:border-rose-400 transition-colors"
                  >
                    <span className="text-muted">{r.Event.date}</span>
                    <span className="text-slate-700 dark:text-slate-300 mx-1">·</span>
                    <span className="text-slate-700 dark:text-slate-300">{r.Event.info || '(no info)'}</span>
                    <span className="text-slate-700 dark:text-slate-300 mx-1">·</span>
                    <span className="text-slate-500">
                      {typeof r.Event.orgc === 'object' ? r.Event.orgc.name : r.Event.orgc}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </DataPageLayout>
    );
  }

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<ShieldAlert size={28} />}
      title="MISP Browser"
      headerExtra={
        <div className="flex items-center gap-2">
          <span className="text-mini font-mono text-muted">{total > 0 ? `${total} events` : ''}</span>
          <button
            type="button"
            onClick={() => loadEvents(1)}
            disabled={loading}
            className="flex items-center gap-1 px-3 py-1.5 text-mini font-mono rounded-xl border border-slate-300 dark:border-[rgb(var(--border-400))] text-muted hover:border-rose-500"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button
            type="button"
            onClick={disconnect}
            className="px-3 py-1.5 text-mini font-mono rounded-xl border border-rose-300 dark:border-rose-700 text-rose-600 dark:text-rose-400 hover:border-rose-500 transition-colors"
          >
            Disconnect
          </button>
        </div>
      }
    >
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[200px]">
          <label htmlFor="misp-search" className="text-micro font-mono text-muted mb-0.5 block">
            Search
          </label>
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              id="misp-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void loadEvents(1)}
              className="w-full pl-7 pr-2 py-1.5 rounded-xl border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] text-xs font-mono text-slate-900 dark:text-slate-100"
              placeholder="Search events..."
            />
          </div>
        </div>
        <div className="w-40">
          <label htmlFor="misp-tag-filter" className="text-micro font-mono text-muted mb-0.5 block">
            Tag filter
          </label>
          <input
            id="misp-tag-filter"
            type="text"
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void loadEvents(1)}
            className="w-full px-2 py-1.5 rounded-xl border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] text-xs font-mono text-slate-900 dark:text-slate-100"
            placeholder="tag_name"
          />
        </div>
        <button
          type="button"
          onClick={() => loadEvents(1)}
          disabled={loading}
          className="px-3 py-1.5 text-xs font-mono rounded-xl bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Filter'}
        </button>
      </div>

      {error && (
        <div className="text-xs font-mono p-2 rounded-xl bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400">
          {error}
        </div>
      )}

      {events.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center py-16 text-muted">
          <Info size={32} className="mb-3" />
          <p className="text-sm font-mono">No events found</p>
          <p className="text-xs font-mono mt-1">Try adjusting your search or tag filter</p>
        </div>
      )}

      <div className="grid gap-3">
        {events.map((ev) => {
          const e = ev.Event;
          const tl = (THREAT_LEVELS[e.threat_level_id] ?? THREAT_LEVELS['4'])!;
          const TlIcon = tl.icon;
          return (
            <button
              type="button"
              key={e.id}
              onClick={() => loadEventDetail(e.id)}
              className="text-left w-full surface-card p-4 hover:border-rose-400 dark:hover:border-rose-600 transition-colors group"
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100 group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors truncate">
                      {e.info || '(no info)'}
                    </span>
                    {e.published && (
                      <span className="shrink-0 text-micro font-mono px-1 py-0.5 rounded bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400">
                        Published
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-mini font-mono text-slate-500">
                    <span className="flex items-center gap-1">
                      <Calendar size={10} /> {e.date}
                    </span>
                    <span>Org: {typeof e.orgc === 'object' ? e.orgc.name : e.orgc}</span>
                    <span>ID: {e.uuid?.slice(0, 8)}…</span>
                  </div>
                  {e.tags && e.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {e.tags.slice(0, 5).map((t) => (
                        <span
                          key={t.Tag.name}
                          className="text-micro font-mono px-1 py-0.5 rounded bg-slate-100 dark:bg-[rgb(var(--surface-300))] text-slate-500"
                        >
                          {t.Tag.name}
                        </span>
                      ))}
                      {e.tags.length > 5 && (
                        <span className="text-micro font-mono text-muted">+{e.tags.length - 5}</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-mini font-mono ${tl.color}`}>
                    <TlIcon size={12} /> {tl.label}
                  </span>
                  <ExternalLink
                    size={14}
                    className="text-slate-400 dark:text-slate-300 group-hover:text-rose-500 transition-colors"
                  />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {page > 1 && (
        <div className="flex justify-center gap-2">
          <button
            type="button"
            onClick={() => loadEvents(page - 1)}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-mono rounded-xl border border-slate-300 dark:border-[rgb(var(--border-400))] text-muted hover:border-rose-500 disabled:opacity-50"
          >
            ← Previous
          </button>
          <span className="px-3 py-1.5 text-xs font-mono text-slate-500">Page {page}</span>
          <button
            type="button"
            onClick={() => loadEvents(page + 1)}
            disabled={loading || events.length < 20}
            className="px-3 py-1.5 text-xs font-mono rounded-xl border border-slate-300 dark:border-[rgb(var(--border-400))] text-muted hover:border-rose-500 disabled:opacity-50"
          >
            Next →
          </button>
        </div>
      )}
    </DataPageLayout>
  );
}
