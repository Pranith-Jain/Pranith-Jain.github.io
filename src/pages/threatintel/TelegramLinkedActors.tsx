import { useEffect, useMemo, useState, useCallback, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  Shield,
  Users,
  Search,
  Loader2,
  ExternalLink,
  AlertTriangle,
  Hash,
  ChevronDown,
  ChevronUp,
  Crosshair,
} from 'lucide-react';
import { DataState } from '../../components/DataState';
import { relativeAgo } from '../../lib/relativeTime';
import { sanitizeUrl } from '../../lib/sanitize-url';
import {
  THREAT_ACTORS,
  TYPE_LABELS,
  STATUS_COLORS,
  type ThreatActor,
  type ActorType,
} from '../../data/threatintel/threat-actor-catalog';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Severity = 'critical' | 'high' | 'medium' | 'low';

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

interface HandlePivot {
  handle: string;
  /** Actors from the in-repo catalog (operator-curated telegram_handles). */
  catalogActors: ThreatActor[];
  /** Actors from the live /telegram-search endpoint (deepdarkCTI + MISP). */
  searchActors: LinkedActor[];
  /** Recent leak entries on this handle. */
  recentLeaks: LeakEntry[];
  /** Number of distinct leak entries in the last 30d. */
  leakCount30d: number;
  /** Highest severity seen in the last 30d. */
  topSeverity: Severity | null;
}

const SEVERITY_TONE: Record<Severity, string> = {
  critical: 'border-rose-500/50 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  high: 'border-orange-500/50 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  medium: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  low: 'border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500',
};

const ACTOR_TYPE_TONE: Record<ActorType, string> = {
  apt: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  cybercrime: 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  ransomware: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  hacktivist: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  insider: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  supplier: 'border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-300',
};

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

function severityRank(s: Severity): number {
  return s === 'critical' ? 4 : s === 'high' ? 3 : s === 'medium' ? 2 : 1;
}

const HANDLE_RE = /^[a-zA-Z][a-zA-Z0-9_]{3,31}$/;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Build the in-repo handle → actor index. Cached at module scope. */
function buildCatalogIndex(): Map<string, ThreatActor[]> {
  const m = new Map<string, ThreatActor[]>();
  for (const a of THREAT_ACTORS) {
    for (const h of a.telegram_handles ?? []) {
      const k = h.toLowerCase();
      const arr = m.get(k) ?? [];
      arr.push(a);
      m.set(k, arr);
    }
  }
  return m;
}

const CATALOG_INDEX = buildCatalogIndex();

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function TelegramLinkedActors(): JSX.Element {
  const [input, setInput] = useState('');
  const [submitted, setSubmitted] = useState('');

  const [searchData, setSearchData] = useState<SearchResponse | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [leakEntries, setLeakEntries] = useState<LeakEntry[]>([]);
  const [leakLoading, setLeakLoading] = useState(true);
  const [leakError, setLeakError] = useState<string | null>(null);

  const [activeHandle, setActiveHandle] = useState<string | null>(null);

  // Fetch leak entries once on mount — same data the Leaks tab uses.
  useEffect(() => {
    let cancelled = false;
    setLeakLoading(true);
    setLeakError(null);
    fetch('/api/v1/telegram-leaks/search?limit=200')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ entries: LeakEntry[] }>;
      })
      .then((d) => {
        if (!cancelled) setLeakEntries(d.entries ?? []);
      })
      .catch((e: Error) => {
        if (!cancelled) setLeakError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLeakLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Server-side search (deepdarkCTI + MISP) on demand.
  const runSearch = useCallback(async (q: string) => {
    if (!q) return;
    setSearchLoading(true);
    setSearchError(null);
    try {
      const r = await fetch(`/api/v1/telegram-search?q=${encodeURIComponent(q)}`);
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string; message?: string };
        throw new Error(j.message ?? j.error ?? `HTTP ${r.status}`);
      }
      const j = (await r.json()) as SearchResponse;
      setSearchData(j);
    } catch (e) {
      setSearchError((e as Error).message);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    if (submitted) runSearch(submitted);
  }, [submitted, runSearch]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const v = input.trim();
    if (v) setSubmitted(v);
  };

  // ----------------- Pivots -----------------
  const pivots: HandlePivot[] = useMemo(() => {
    const map = new Map<string, HandlePivot>();

    // 1) from the search response (deepdarkCTI + MISP hits)
    for (const r of searchData?.results ?? []) {
      const k = r.handle.toLowerCase();
      const cur = map.get(k) ?? {
        handle: r.handle,
        catalogActors: [],
        searchActors: [],
        recentLeaks: [],
        leakCount30d: 0,
        topSeverity: null,
      };
      cur.searchActors = r.linked_actors ?? [];
      map.set(k, cur);
    }

    // 2) from the in-repo catalog (operator-curated handles)
    for (const a of THREAT_ACTORS) {
      for (const h of a.telegram_handles ?? []) {
        const k = h.toLowerCase();
        const cur = map.get(k) ?? {
          handle: h,
          catalogActors: [],
          searchActors: [],
          recentLeaks: [],
          leakCount30d: 0,
          topSeverity: null,
        };
        if (!cur.catalogActors.some((x) => x.id === a.id)) {
          cur.catalogActors.push(a);
        }
        map.set(k, cur);
      }
    }

    // 3) attach leak activity (last 30d)
    const cutoff = Date.now() - 30 * 86400_000;
    for (const l of leakEntries) {
      const k = (l.channel_handle ?? '').toLowerCase();
      if (!k) continue;
      const cur = map.get(k) ?? {
        handle: l.channel_handle,
        catalogActors: [],
        searchActors: [],
        recentLeaks: [],
        leakCount30d: 0,
        topSeverity: null,
      };
      const t = Date.parse(l.discovered_at);
      if (Number.isFinite(t) && t >= cutoff) {
        cur.recentLeaks.push(l);
        cur.leakCount30d += 1;
        if (!cur.topSeverity || severityRank(l.severity) > severityRank(cur.topSeverity)) {
          cur.topSeverity = l.severity;
        }
      }
      map.set(k, cur);
    }

    return Array.from(map.values()).sort((a, b) => {
      // Sort: catalog-matched first, then by leak count desc, then by handle
      if (a.catalogActors.length !== b.catalogActors.length) {
        return b.catalogActors.length - a.catalogActors.length;
      }
      if (a.leakCount30d !== b.leakCount30d) return b.leakCount30d - a.leakCount30d;
      return a.handle.localeCompare(b.handle);
    });
  }, [searchData, leakEntries]);

  // If the user typed a handle that doesn't match any pivot, show a
  // standalone "no hits" card for that handle.
  const standaloneHandle =
    submitted && HANDLE_RE.test(submitted) && !pivots.some((p) => p.handle.toLowerCase() === submitted.toLowerCase())
      ? submitted
      : null;

  // When the user clicks a pivot, expand it.
  const visiblePivots = activeHandle
    ? pivots.filter((p) => p.handle.toLowerCase() === activeHandle.toLowerCase())
    : pivots;

  return (
    <div className="space-y-4">
      {/* Intro / search */}
      <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-4">
        <h2 className="font-display font-semibold text-lg flex items-center gap-2">
          <Shield size={18} className="text-rose-600 dark:text-rose-400" /> Linked actors
          <span className="text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300">
            channel → actor pivot
          </span>
        </h2>
        <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-1.5 max-w-3xl leading-relaxed">
          For a given Telegram handle, surface every known attribution: the in-repo{' '}
          <code className="text-[11px] bg-slate-100 dark:bg-[rgb(var(--surface-300))] px-1 py-0.5 rounded">
            threat-actor-catalog
          </code>{' '}
          (operator-curated), deepdarkCTI&apos;s{' '}
          <code className="text-[11px] bg-slate-100 dark:bg-[rgb(var(--surface-300))] px-1 py-0.5 rounded">
            telegram_threat_actors.md
          </code>
          , and MISP Galaxy&apos;s{' '}
          <code className="text-[11px] bg-slate-100 dark:bg-[rgb(var(--surface-300))] px-1 py-0.5 rounded">
            associated-telegram-handle
          </code>{' '}
          custom field — cross-referenced with leak-monitor activity in the last 30 days.
        </p>

        <form onSubmit={onSubmit} className="mt-3 flex flex-wrap gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="handle (e.g. apt28world, lockbitsupport, alphvteam)"
            className="flex-1 min-w-[220px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200)/0.4)] text-sm font-mono focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40"
            aria-label="Telegram handle to pivot"
          />
          <button
            type="button"
            onClick={() => setActiveHandle(null)}
            className="text-mini font-mono px-3 py-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40 inline-flex items-center gap-1"
          >
            <Users size={12} /> all
          </button>
          <button
            type="submit"
            disabled={searchLoading || !input.trim()}
            className="text-mini font-mono px-3 py-1.5 rounded border border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300 hover:bg-rose-500/20 disabled:opacity-50 inline-flex items-center gap-1"
          >
            {searchLoading ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />} pivot
          </button>
        </form>

        {searchError && (
          <div className="mt-3 rounded-lg border border-rose-500/40 bg-rose-500/10 p-2 font-mono text-xs text-rose-700 dark:text-rose-300 inline-flex items-center gap-1.5">
            <AlertTriangle size={12} /> {searchError}
          </div>
        )}
        {searchData?.stale && (
          <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 font-mono text-xs text-amber-700 dark:text-amber-300 inline-flex items-center gap-1.5">
            <AlertTriangle size={12} /> upstream failed — serving the previous result (re-checked within 5 min).
          </div>
        )}
      </section>

      {/* Catalog index stats */}
      <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-4">
        <h3 className="font-mono text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 inline-flex items-center gap-2">
          <Crosshair size={12} /> Catalog index
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <CatalogStat
            label="actors with handles"
            value={THREAT_ACTORS.filter((a) => (a.telegram_handles?.length ?? 0) > 0).length}
            tone="brand"
          />
          <CatalogStat label="unique handles indexed" value={CATALOG_INDEX.size} tone="sky" />
          <CatalogStat label="leak entries (90d)" value={leakEntries.length} tone="amber" />
          <CatalogStat
            label="handles with leaks"
            value={new Set(leakEntries.map((l) => (l.channel_handle ?? '').toLowerCase()).filter(Boolean)).size}
            tone="violet"
          />
        </div>
      </section>

      {/* Results */}
      <DataState
        loading={searchLoading || leakLoading}
        error={searchError || leakError}
        empty={!searchLoading && !leakLoading && pivots.length === 0 && !standaloneHandle}
        rows={4}
      >
        {standaloneHandle && (
          <div className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-4">
            <p className="text-sm font-mono text-slate-600 dark:text-slate-300">
              <strong>@{standaloneHandle}</strong> is not in the catalog or in the recent leak feed. Try a known handle
              (e.g.{' '}
              <code className="text-[11px] bg-slate-100 dark:bg-[rgb(var(--surface-300))] px-1 py-0.5 rounded">
                apt28world
              </code>
              ,{' '}
              <code className="text-[11px] bg-slate-100 dark:bg-[rgb(var(--surface-300))] px-1 py-0.5 rounded">
                lockbitsupport
              </code>
              ,{' '}
              <code className="text-[11px] bg-slate-100 dark:bg-[rgb(var(--surface-300))] px-1 py-0.5 rounded">
                alphvteam
              </code>
              ) or use the Channel Search tab to find new candidates.
            </p>
          </div>
        )}

        {visiblePivots.length > 0 && (
          <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mb-2">
            {visiblePivots.length} pivot{visiblePivots.length === 1 ? '' : 's'}
            {activeHandle ? ` · showing only @${activeHandle}` : ` (${pivots.length} total)`}
          </p>
        )}

        <ul className="space-y-3">
          {visiblePivots.map((p) => (
            <PivotCard key={p.handle} pivot={p} onClearFilter={() => setActiveHandle(null)} />
          ))}
        </ul>
      </DataState>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function CatalogStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'brand' | 'sky' | 'amber' | 'violet';
}): JSX.Element {
  const tones: Record<typeof tone, string> = {
    brand: 'border-brand-500/30 bg-brand-500/5 text-brand-700 dark:text-brand-300',
    sky: 'border-sky-500/30 bg-sky-500/5 text-sky-700 dark:text-sky-300',
    amber: 'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300',
    violet: 'border-violet-500/30 bg-violet-500/5 text-violet-700 dark:text-violet-300',
  };
  return (
    <div className={`rounded-md border p-3 ${tones[tone]}`}>
      <p className="text-[10px] font-mono uppercase tracking-wider opacity-80">{label}</p>
      <p className="mt-1 font-mono text-2xl font-semibold">{value.toLocaleString()}</p>
    </div>
  );
}

function PivotCard({ pivot, onClearFilter }: { pivot: HandlePivot; onClearFilter: () => void }): JSX.Element {
  const [open, setOpen] = useState(false);
  const allActorIds = useMemo(() => {
    const s = new Set<string>();
    for (const a of pivot.catalogActors) s.add(a.id);
    for (const la of pivot.searchActors) s.add(la.actor_id);
    return s;
  }, [pivot]);

  const noAttribution = allActorIds.size === 0;

  return (
    <li
      className={`rounded-lg border bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4 ${
        pivot.catalogActors.length > 0
          ? 'border-rose-500/40'
          : pivot.searchActors.length > 0
            ? 'border-orange-500/30'
            : 'border-slate-200 dark:border-[rgb(var(--border-400))]'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h3 className="font-display font-semibold text-base text-slate-900 dark:text-slate-100">@{pivot.handle}</h3>
            {pivot.catalogActors.length > 0 && (
              <span className="text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300">
                ★ catalog hit
              </span>
            )}
            {pivot.searchActors.length > 0 && (
              <span className="text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300">
                {pivot.searchActors.length} live hit{pivot.searchActors.length === 1 ? '' : 's'}
              </span>
            )}
            {noAttribution && (
              <span className="text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500">
                no actor attribution
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-micro font-mono text-slate-500 dark:text-slate-400">
            {pivot.leakCount30d > 0 && (
              <span>
                <strong className="text-slate-700 dark:text-slate-200">{pivot.leakCount30d}</strong> leak entr
                {pivot.leakCount30d === 1 ? 'y' : 'ies'} (30d)
              </span>
            )}
            {pivot.topSeverity && (
              <span className={`px-1.5 py-0.5 rounded border ${SEVERITY_TONE[pivot.topSeverity]}`}>
                top: {pivot.topSeverity}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <a
            href={sanitizeUrl(`https://t.me/s/${pivot.handle}`)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-mini font-mono px-2 py-1 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40 inline-flex items-center gap-1"
          >
            <ExternalLink size={11} /> t.me/s/{pivot.handle}
          </a>
          {noAttribution && (
            <button
              type="button"
              onClick={onClearFilter}
              className="text-[10px] font-mono text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              clear
            </button>
          )}
        </div>
      </div>

      {/* Catalog actors */}
      {pivot.catalogActors.length > 0 && (
        <div className="mb-3 rounded border border-rose-500/30 bg-rose-500/5 p-3">
          <p className="text-micro font-mono uppercase tracking-wider text-rose-700 dark:text-rose-300 mb-2 inline-flex items-center gap-1">
            <Shield size={11} /> In-repo catalog ({pivot.catalogActors.length})
          </p>
          <ul className="space-y-2">
            {pivot.catalogActors.map((a) => (
              <li key={a.id} className="text-xs">
                <div className="flex flex-wrap items-baseline gap-2">
                  <Link
                    to="/threatintel/catalog?cat=actors"
                    className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100 hover:text-brand-600 dark:hover:text-brand-400"
                  >
                    {a.name}
                  </Link>
                  <span
                    className={`text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${ACTOR_TYPE_TONE[a.type]}`}
                  >
                    {TYPE_LABELS[a.type]}
                  </span>
                  <span className={`text-micro font-mono ${STATUS_COLORS[a.status]}`}>{a.status}</span>
                  {a.country && <span className="text-slate-500">· {a.country}</span>}
                </div>
                {a.mitreGroups.length > 0 && (
                  <p className="font-mono text-[11px] text-slate-500 mt-0.5">MITRE: {a.mitreGroups.join(', ')}</p>
                )}
                {a.malware.length > 0 && (
                  <p className="font-mono text-[11px] text-slate-500">
                    malware: {a.malware.slice(0, 3).join(', ')}
                    {a.malware.length > 3 ? ` +${a.malware.length - 3}` : ''}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Search-result actors (deepdarkCTI + MISP) */}
      {pivot.searchActors.length > 0 && (
        <div className="mb-3 rounded border border-orange-500/30 bg-orange-500/5 p-3">
          <p className="text-micro font-mono uppercase tracking-wider text-orange-700 dark:text-orange-300 mb-2 inline-flex items-center gap-1">
            <Hash size={11} /> Live attribution ({pivot.searchActors.length})
          </p>
          <ul className="space-y-1.5">
            {pivot.searchActors.map((la) => (
              <li key={`${pivot.handle}:${la.actor_id}`} className="text-xs font-mono">
                <span className="font-semibold text-slate-800 dark:text-slate-200">{la.name}</span>
                {la.country && <span className="ml-1 text-slate-500">· {la.country}</span>}
                <span
                  className={`ml-2 text-micro font-mono uppercase tracking-wider px-1 py-0.5 rounded border ${confidenceTone(la.confidence)}`}
                  title={`Confidence ${(la.confidence * 100).toFixed(0)}%`}
                >
                  {(la.confidence * 100).toFixed(0)}%
                </span>
                <span className="ml-2 text-slate-500">via {la.sources.map((s) => SOURCE_LABEL[s]).join(', ')}</span>
                {la.citations[0] && (
                  <span className="ml-1 text-slate-400" title={la.citations.join(' · ')}>
                    — {la.citations[0]}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recent leaks */}
      {pivot.recentLeaks.length > 0 && (
        <div className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] p-3">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="w-full text-left text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 inline-flex items-center gap-1"
          >
            {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />} Recent leaks (30d) · {pivot.recentLeaks.length}
          </button>
          {open && (
            <ul className="space-y-1.5">
              {pivot.recentLeaks.slice(0, 5).map((l) => (
                <li key={l.id} className="text-xs flex flex-wrap items-baseline gap-2">
                  <span
                    className={`text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${SEVERITY_TONE[l.severity]}`}
                  >
                    {l.severity}
                  </span>
                  <span className="font-mono text-slate-700 dark:text-slate-300">{l.leak_type}</span>
                  {l.credential_count > 0 && <span className="text-slate-500">{l.credential_count} creds</span>}
                  <span className="text-slate-500 ml-auto">{relativeAgo(l.discovered_at, '—')}</span>
                  {l.message_link && (
                    <a
                      href={sanitizeUrl(l.message_link)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-500 hover:text-brand-600"
                    >
                      <ExternalLink size={10} />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}
