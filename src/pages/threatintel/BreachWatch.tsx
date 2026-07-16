import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Loader2, RefreshCw, ShieldAlert, Search, Filter } from 'lucide-react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { sanitizeUrl } from '../../lib/sanitize-url';

type BwCategory = 'ransomware' | 'data_breach' | 'combo_list' | 'source_code' | 'credential_leak' | 'other';
type BwSeverity = 'critical' | 'high' | 'medium' | 'low' | 'unknown';

interface BwBreachIndexEntry {
  slug: string;
  title: string;
  group: string;
  discovered: string;
  category: BwCategory;
  severity: BwSeverity;
  country: string | null;
  sizeBytes: number;
}

interface BwBreachBody extends BwBreachIndexEntry {
  description: string | null;
  source_url: string;
  groupAliases: string[];
  activity: string | null;
  references: string[];
}

interface BwGroupEntry {
  name: string;
  count: number;
  topCategory: BwCategory;
}

interface BwIndex {
  counts: { breaches: number; groups: number; categories: number };
  categories: Array<{ key: BwCategory; label: string; count: number }>;
}

const CATEGORY_LABELS: Record<string, string> = {
  ransomware: 'Ransomware',
  data_breach: 'Data Breach',
  combo_list: 'Combo List',
  source_code: 'Source Code',
  credential_leak: 'Credential Leak',
  other: 'Other',
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300 border-rose-300 dark:border-rose-700',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300 border-orange-300 dark:border-orange-700',
  medium: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-300 dark:border-amber-700',
  low: 'bg-sky-100 text-cyan-800 dark:bg-sky-900/40 dark:text-sky-300 border-sky-300 dark:border-sky-700',
  unknown: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-300 dark:border-slate-600',
};

function humanSize(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${bytes} B`;
}

function BreachCard({ entry, onSelect }: { entry: BwBreachIndexEntry; onSelect: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full text-left rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4 hover:border-brand-500/40 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h4 className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">
            {entry.title}
          </h4>
          <div className="flex items-center gap-2 mt-1 text-mini font-mono text-slate-500 flex-wrap">
            <span className="text-brand-600 dark:text-brand-400">{entry.group}</span>
            {entry.country && <span>{entry.country}</span>}
            {entry.discovered && <span>{new Date(entry.discovered).toLocaleDateString()}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`text-micro font-mono px-1.5 py-0.5 rounded border ${SEVERITY_COLORS[entry.severity] ?? ''}`}
          >
            {entry.severity}
          </span>
          <span className="text-micro font-mono text-slate-400">{humanSize(entry.sizeBytes)}</span>
        </div>
      </div>
      <span className="text-micro font-mono text-slate-400 mt-2 inline-block">
        {CATEGORY_LABELS[entry.category] ?? entry.category}
      </span>
    </button>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function BreachDetail({ slug, onClose }: { slug: string; onClose: () => void }): JSX.Element {
  const [body, setBody] = useState<BwBreachBody | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/v1/breach-watch/breaches/${encodeURIComponent(slug)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<BwBreachBody>;
      })
      .then((data) => {
        if (!cancelled) setBody(data);
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
  }, [slug]);

  return (
    <section className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-5 animate-fade-in-up">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-bold text-lg">Breach detail</h3>
        <button
          type="button"
          onClick={onClose}
          className="text-mini font-mono text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
        >
          close
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-muted text-sm font-mono">
          <Loader2 size={14} className="animate-spin" /> loading…
        </div>
      )}
      {error && <p className="font-mono text-sm text-rose-600">error: {error}</p>}

      {body && (
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-mini font-mono">
            <div>
              <span className="text-slate-500">Group:</span> {body.group}
            </div>
            <div>
              <span className="text-slate-500">Category:</span> {CATEGORY_LABELS[body.category] ?? body.category}
            </div>
            <div>
              <span className="text-slate-500">Severity:</span> {body.severity}
            </div>
            <div>
              <span className="text-slate-500">Discovered:</span> {formatDate(body.discovered)}
            </div>
            {body.country && (
              <div>
                <span className="text-slate-500">Country:</span> {body.country}
              </div>
            )}
            <div>
              <span className="text-slate-500">Size:</span> {humanSize(body.sizeBytes)}
            </div>
          </div>

          {body.description && <p className="text-slate-700 dark:text-slate-300 leading-relaxed">{body.description}</p>}

          {body.activity && (
            <div>
              <span className="text-slate-500 font-mono text-mini">Activity:</span>
              <p className="text-slate-700 dark:text-slate-300 mt-0.5">{body.activity}</p>
            </div>
          )}

          {body.groupAliases.length > 0 && (
            <div>
              <span className="text-slate-500 font-mono text-mini">Aliases:</span>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {body.groupAliases.map((a, i) => (
                  <span
                    key={i}
                    className="text-micro px-2 py-0.5 bg-slate-100 dark:bg-[rgb(var(--surface-300))] rounded"
                  >
                    {a}
                  </span>
                ))}
              </div>
            </div>
          )}

          {body.source_url && (
            <a
              href={sanitizeUrl(body.source_url) || undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-mono text-brand-600 dark:text-brand-400 hover:underline"
            >
              source <ExternalLink size={11} />
            </a>
          )}

          {body.references.length > 0 && (
            <div>
              <span className="text-slate-500 font-mono text-mini">References:</span>
              <ul className="mt-0.5 space-y-0.5">
                {body.references.map((r, i) => (
                  <li key={i}>
                    <a
                      href={sanitizeUrl(r) || undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-mono text-brand-600 dark:text-brand-400 hover:underline break-all"
                    >
                      {r} <ExternalLink size={9} className="inline" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default function BreachWatch(): JSX.Element {
  const [index, setIndex] = useState<BwIndex | null>(null);
  const [groups, setGroups] = useState<BwGroupEntry[]>([]);
  const [breaches, setBreaches] = useState<BwBreachIndexEntry[]>([]);
  const [totalBreaches, setTotalBreaches] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterGroup, setFilterGroup] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('');
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    async function load() {
      try {
        const [idxRes, groupsRes, breachesRes] = await Promise.all([
          fetch('/api/v1/breach-watch/'),
          fetch('/api/v1/breach-watch/groups?limit=200'),
          fetch('/api/v1/breach-watch/breaches?limit=200'),
        ]);
        if (!idxRes.ok) throw new Error(`index HTTP ${idxRes.status}`);
        if (!groupsRes.ok) throw new Error(`groups HTTP ${groupsRes.status}`);
        if (!breachesRes.ok) throw new Error(`breaches HTTP ${breachesRes.status}`);

        const idxData = (await idxRes.json()) as BwIndex;
        const groupsData = (await groupsRes.json()) as { groups: BwGroupEntry[] };
        const breachesData = (await breachesRes.json()) as { total: number; breaches: BwBreachIndexEntry[] };

        if (!cancelled) {
          setIndex(idxData);
          setGroups(groupsData.groups);
          setBreaches(breachesData.breaches);
          setTotalBreaches(breachesData.total);
        }
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const filteredBreaches = useMemo(() => {
    let out = breaches;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      out = out.filter(
        (b) =>
          b.title.toLowerCase().includes(q) ||
          b.group.toLowerCase().includes(q) ||
          (b.country ?? '').toLowerCase().includes(q)
      );
    }
    if (filterGroup) out = out.filter((b) => b.group === filterGroup);
    if (filterCategory) out = out.filter((b) => b.category === filterCategory);
    if (filterSeverity) out = out.filter((b) => b.severity === filterSeverity);
    return out;
  }, [breaches, searchQuery, filterGroup, filterCategory, filterSeverity]);

  return (
    <DataPageLayout
      backTo="/threatintel"
      maxWidthClass="max-w-6xl"
      icon={<ShieldAlert size={28} />}
      title="Breach Watch"
      description={
        <>
          <span className="block">
            Aggregated breach and leak data from{' '}
            <a
              href="https://ransomware.live"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 dark:text-brand-400 hover:underline"
            >
              ransomware.live
            </a>
            ,{' '}
            <a
              href="https://ransomlook.io"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 dark:text-brand-400 hover:underline"
            >
              ransomlook.io
            </a>
            ,{' '}
            <a
              href="https://darkfield.orizon.one"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 dark:text-brand-400 hover:underline"
            >
              Darkfield
            </a>
            ,{' '}
            <a
              href="https://recentbreaches.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 dark:text-brand-400 hover:underline"
            >
              RecentBreaches
            </a>
            ,{' '}
            <a
              href="https://cti.fyi"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 dark:text-brand-400 hover:underline"
            >
              CTI.FYI
            </a>
            , and{' '}
            <a
              href="https://xposedornot.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 dark:text-brand-400 hover:underline"
            >
              XposedOrNot
            </a>
            .
          </span>
          <span className="block text-xs text-slate-500 dark:text-slate-400 font-mono mt-2">
            Combined breach corpus — ransomware leaks, data breaches, credential dumps, and combo lists.
          </span>
        </>
      }
      headerExtra={
        <div className="flex items-center gap-3">
          {index && (
            <span className="text-mini font-mono text-slate-400">
              {index.counts.breaches.toLocaleString()} breaches · {index.counts.groups} groups
            </span>
          )}
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            className="text-mini font-mono px-2.5 py-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40 inline-flex items-center gap-1"
            aria-label="Refresh breach watch data"
          >
            <RefreshCw size={11} /> refresh
          </button>
        </div>
      }
    >
      {loading && (
        <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4 inline-flex items-center gap-2 font-mono text-sm text-slate-500">
          <Loader2 size={14} className="animate-spin" /> loading breach watch data…
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/5 p-3 font-mono text-sm text-rose-600 dark:text-rose-300">
          Error: {error}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Categories overview */}
          {index && index.categories.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6">
              {index.categories.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setFilterCategory(filterCategory === c.key ? '' : c.key)}
                  className={`text-micro font-mono px-2.5 py-1 rounded-full border transition-colors ${
                    filterCategory === c.key
                      ? 'bg-brand-500/15 text-brand-700 dark:text-brand-300 border-brand-500/40'
                      : 'bg-white dark:bg-[rgb(var(--surface-200))] text-slate-500 border-slate-200 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40'
                  }`}
                >
                  {c.label} ({c.count})
                </button>
              ))}
            </div>
          )}

          {/* Search + filters */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search breaches…"
                className="w-full pl-9 pr-3 py-2 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-lg font-mono text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-brand-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter size={13} className="text-slate-400" />
              <select
                value={filterGroup}
                onChange={(e) => setFilterGroup(e.target.value)}
                className="text-mini font-mono px-2 py-1.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] text-slate-700 dark:text-slate-300"
              >
                <option value="">All groups</option>
                {groups.slice(0, 50).map((g) => (
                  <option key={g.name} value={g.name}>
                    {g.name} ({g.count})
                  </option>
                ))}
              </select>

              <select
                value={filterSeverity}
                onChange={(e) => setFilterSeverity(e.target.value)}
                className="text-mini font-mono px-2 py-1.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] text-slate-700 dark:text-slate-300"
              >
                <option value="">All severity</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between mb-3">
            <p className="text-mini font-mono text-slate-500">
              {filteredBreaches.length} of {totalBreaches.toLocaleString()} breaches
            </p>
          </div>

          {/* Breach list */}
          <div className="grid gap-2">
            {filteredBreaches.length === 0 && (
              <p className="text-sm font-mono text-slate-500 italic py-4 text-center">
                No breaches match the current filters.
              </p>
            )}
            {filteredBreaches.map((b) => (
              <BreachCard
                key={b.slug}
                entry={b}
                onSelect={() => setSelectedSlug(selectedSlug === b.slug ? null : b.slug)}
              />
            ))}
          </div>

          {/* Detail panel */}
          {selectedSlug && (
            <div className="mt-4">
              <BreachDetail slug={selectedSlug} onClose={() => setSelectedSlug(null)} />
            </div>
          )}

          {/* Groups section */}
          {groups.length > 0 && (
            <section className="mt-10">
              <h2 className="font-display font-bold text-xl mb-3 inline-flex items-center gap-2">
                <ShieldAlert size={18} className="text-brand-600 dark:text-brand-400" /> Threat actor groups
              </h2>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {groups.slice(0, 60).map((g) => (
                  <button
                    key={g.name}
                    type="button"
                    onClick={() => {
                      setFilterGroup(g.name);
                      setFilterCategory('');
                      setFilterSeverity('');
                      setSearchQuery('');
                    }}
                    className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-3 hover:border-brand-500/40 transition-colors text-left"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">
                        {g.name}
                      </span>
                      <span className="text-micro font-mono text-slate-500 shrink-0 ml-2">{g.count}</span>
                    </div>
                    <span className="text-micro font-mono text-slate-400">
                      {CATEGORY_LABELS[g.topCategory] ?? g.topCategory}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </DataPageLayout>
  );
}
