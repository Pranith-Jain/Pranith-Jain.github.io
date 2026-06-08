import { useEffect, useMemo, useRef, useState } from 'react';
import { BackLink } from '../../components/BackLink';
import { Activity, AlertTriangle, ArrowLeft, FileCode, MessageSquare, RefreshCw, ShieldAlert } from 'lucide-react';

/**
 * ransomware.live PRO surface — consumes the server-side authenticated proxy
 * at /api/v1/rl/*. Response shapes from the PRO API aren't publicly
 * documented (no schemas in swagger), so every tab renders defensively:
 * known fields when present, a compact JSON fallback otherwise.
 */

type TabId = 'stats' | 'cyberattacks' | 'negotiations' | 'yara';

const TABS: Array<{ id: TabId; label: string; resource: string; icon: typeof Activity; blurb: string }> = [
  {
    id: 'stats',
    label: 'Stats',
    resource: 'stats',
    icon: Activity,
    blurb: 'High-level victim / group / activity counts.',
  },
  {
    id: 'cyberattacks',
    label: 'Cyberattacks',
    resource: 'cyberattacks',
    icon: AlertTriangle,
    blurb: '100 most recent cyberattack press entries — HudsonRock infostealer-enriched.',
  },
  {
    id: 'negotiations',
    label: 'Negotiations',
    resource: 'negotiations',
    icon: MessageSquare,
    blurb: 'Ransomware groups with leaked negotiation chat logs.',
  },
  {
    id: 'yara',
    label: 'YARA',
    resource: 'yara',
    icon: FileCode,
    blurb: 'Groups with associated YARA detection rules.',
  },
];

interface ProxyEnvelope {
  resource: string;
  arg: string | null;
  fetched_at: string;
  data: unknown;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function pick(o: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v;
    if (typeof v === 'number') return String(v);
  }
  return undefined;
}

function StatsView({ data }: { data: unknown }) {
  // PRO /stats nests the numbers under `.stats`; unwrap when present.
  const root = isRecord(data) && isRecord(data.stats) ? data.stats : data;
  if (!isRecord(root)) return <RawJson value={data} />;
  const entries = Object.entries(root).filter(([, v]) => typeof v === 'number' || typeof v === 'string');
  if (entries.length === 0) return <RawJson value={data} />;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {entries.map(([k, v]) => (
        <div
          key={k}
          className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4"
        >
          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">{k.replace(/_/g, ' ')}</div>
          <div className="font-display font-bold text-xl text-slate-900 dark:text-slate-100">{String(v)}</div>
        </div>
      ))}
    </div>
  );
}

function ListView({ data }: { data: unknown }) {
  // PRO list endpoints wrap the array under results / groups / stats / data.
  const arrFrom = (o: Record<string, unknown>): unknown[] | undefined => {
    for (const k of ['results', 'groups', 'stats', 'data', 'victims', 'items']) {
      if (Array.isArray(o[k])) return o[k] as unknown[];
    }
    return undefined;
  };
  const rows: unknown[] = Array.isArray(data)
    ? data
    : isRecord(data)
      ? (arrFrom(data) ??
        Object.entries(data)
          .filter(([k]) => k !== 'client')
          .map(([k, v]) => ({ name: k, count: typeof v === 'object' ? undefined : v })))
      : [];
  if (rows.length === 0) return <RawJson value={data} />;
  return (
    <ul className="grid gap-2 md:grid-cols-2">
      {rows.slice(0, 200).map((row, i) => {
        if (!isRecord(row)) {
          return (
            <li
              key={i}
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 font-mono text-[12px]"
            >
              {String(row)}
            </li>
          );
        }
        const title = pick(row, ['title', 'name', 'victim', 'group', 'group_name', 'post_title']) ?? `#${i + 1}`;
        const sub = pick(row, ['description', 'summary', 'country', 'activity', 'sector']);
        const date = pick(row, ['date', 'discovered', 'published', 'added_date', 'created']);
        const count = pick(row, ['count', 'rules', 'chats', 'total']);
        return (
          <li
            key={i}
            className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">
                {title}
              </span>
              {count && (
                <span className="shrink-0 rounded border border-brand-500/40 bg-brand-500/10 px-1.5 py-0.5 font-mono text-[10px] text-brand-700 dark:text-brand-300">
                  {count}
                </span>
              )}
            </div>
            {sub && <p className="font-mono text-[11px] text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">{sub}</p>}
            {date && <p className="font-mono text-[10px] text-slate-400 mt-1">{date}</p>}
          </li>
        );
      })}
    </ul>
  );
}

function RawJson({ value }: { value: unknown }) {
  return (
    <pre className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-3 overflow-auto font-mono text-[11px] text-slate-700 dark:text-slate-300 max-h-[60vh]">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export default function RansomwareLive(): JSX.Element {
  const [tab, setTab] = useState<TabId>('stats');
  const [cache, setCache] = useState<Record<string, ProxyEnvelope>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef<Set<string>>(new Set());
  // Per-tab refresh counter — bumping this for the active resource forces
  // a re-fetch even when we already have a cached envelope.
  const [refreshTick, setRefreshTick] = useState<Record<string, number>>({});

  const active = useMemo(() => TABS.find((t) => t.id === tab)!, [tab]);
  const tick = refreshTick[active.resource] ?? 0;

  useEffect(() => {
    if (fetchedRef.current.has(active.resource) && tick === 0) {
      // Error from a previous tab must not leak when we have cached data.
      setError(null);
      setLoading(false);
      return;
    }
    let alive = true;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/v1/rl/${active.resource}`, { signal: ctrl.signal })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          const detail =
            (j as { error?: string; detail?: string }).error === 'not_configured'
              ? 'ransomware.live PRO key is not configured on the server.'
              : `${(j as { error?: string }).error ?? 'request failed'} (HTTP ${r.status})`;
          throw new Error(detail);
        }
        return j as ProxyEnvelope;
      })
      .then((env) => {
        if (alive) {
          fetchedRef.current.add(active.resource);
          setCache((c) => ({ ...c, [active.resource]: env }));
        }
      })
      .catch((e: { name?: string; message?: string }) => {
        if (alive && e.name !== 'AbortError') setError(e.message ?? String(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [active.resource, tick]);

  const refreshActive = () => {
    fetchedRef.current.delete(active.resource);
    setCache((c) => {
      const next = { ...c };
      delete next[active.resource];
      return next;
    });
    setRefreshTick((t) => ({ ...t, [active.resource]: (t[active.resource] ?? 0) + 1 }));
  };

  const env = cache[active.resource];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>
      <div className="mb-6">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 flex items-center gap-3">
          <ShieldAlert size={28} className="text-brand-600 dark:text-brand-400" /> ransomware.live PRO
        </h1>
        <p className="text-sm font-mono text-slate-600 dark:text-slate-400 mt-1">
          Server-proxied, key-injected, edge-cached view of the{' '}
          <a
            href="https://www.ransomware.live"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            ransomware.live
          </a>{' '}
          PRO API. Cyberattacks carry HudsonRock infostealer enrichment inline.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-4 border-b border-slate-200 dark:border-slate-800">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 font-mono text-[12px] border-b-2 -mb-px ${
                tab === t.id
                  ? 'border-brand-500 text-brand-700 dark:text-brand-300'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Icon size={13} />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="font-mono text-[11px] text-slate-500">{active.blurb}</p>
        <button
          type="button"
          onClick={refreshActive}
          disabled={loading}
          className="text-[11px] font-mono px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:border-brand-500/40 inline-flex items-center gap-1 disabled:opacity-50"
          aria-label={`Refresh ${active.label}`}
        >
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> refresh
        </button>
      </div>

      {loading && (
        <p role="status" aria-live="polite" className="font-mono text-sm text-slate-500">
          loading {active.label}…
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-4 font-mono text-sm text-rose-700 dark:text-rose-300 flex items-start justify-between gap-3"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={refreshActive}
            className="shrink-0 text-xs font-mono px-3 py-1 rounded border border-rose-400/60 hover:bg-rose-500/10"
          >
            retry
          </button>
        </div>
      )}
      {env && !error && (
        <>
          {tab === 'stats' ? <StatsView data={env.data} /> : <ListView data={env.data} />}
          <p className="font-mono text-[10px] text-slate-400 mt-3">
            fetched {new Date(env.fetched_at).toLocaleString()}
          </p>
        </>
      )}
    </div>
  );
}
