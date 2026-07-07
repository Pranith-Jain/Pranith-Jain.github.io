/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useState } from 'react';
import { GitBranch, Search, RefreshCw, ExternalLink } from 'lucide-react';
import { DataPageLayout } from '../../components/DataPageLayout';

interface CampaignEntry {
  slug: string;
  name: string;
  status: 'active' | 'dormant' | 'concluded';
  category: string;
  actor?: string;
  firstSeen: string;
  lastUpdated: string;
  description: string;
  writeups: { title: string; url: string }[];
  targets?: string[];
  geography?: string[];
  ttps?: string[];
  tags: string[];
}

interface CampaignsResponse {
  count: number;
  campaigns: CampaignEntry[];
}

const STATUS_COLOR: Record<CampaignEntry['status'], string> = {
  active: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  dormant: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  concluded: 'border-slate-500/40 bg-slate-500/10 text-slate-600 dark:text-slate-300',
};

const CATEGORY_COLOR: Record<string, string> = {
  ransomware: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  apt: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  'cyber-espionage': 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  malware: 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300',
};

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function CampaignsReference(): JSX.Element {
  const [data, setData] = useState<CampaignsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<CampaignEntry['status'] | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetch('/api/v1/campaigns-catalog', { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<CampaignsResponse>;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: { name?: string; message?: string }) => {
        if (cancelled || e.name === 'AbortError') return;
        setError(e.message ?? 'fetch failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [refreshKey]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.campaigns.filter((c) => {
      if (statusFilter && c.status !== statusFilter) return false;
      if (categoryFilter && c.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.actor ?? '').toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q)) ||
        (c.targets ?? []).some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [data, query, statusFilter, categoryFilter]);

  const stats = useMemo(() => {
    if (!data) return { total: 0, active: 0, dormant: 0, concluded: 0 };
    const campaigns = data.campaigns;
    return {
      total: campaigns.length,
      active: campaigns.filter((c) => c.status === 'active').length,
      dormant: campaigns.filter((c) => c.status === 'dormant').length,
      concluded: campaigns.filter((c) => c.status === 'concluded').length,
    };
  }, [data]);

  const categories = useMemo(() => {
    if (!data) return [] as string[];
    const s = new Set(data.campaigns.map((c) => c.category));
    return Array.from(s).sort();
  }, [data]);

  return (
    <DataPageLayout
      backTo="/threatintel"
      backLabel="back to threat intel"
      icon={<GitBranch className="h-6 w-6" />}
      title="Campaign Reference"
      description="Curated tracker of active, dormant, and concluded threat campaigns with writeup links, actor attribution, TTPs, and target sectors. Sourced from the novasky.io CTI dashboard."
      headerExtra={
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            className="inline-flex items-center gap-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] px-2 py-1 text-slate-500 dark:text-slate-400 hover:border-brand-500/50 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" /> refresh
          </button>
          {data && (
            <span className="rounded border border-slate-300 dark:border-[rgb(var(--border-400))] px-2 py-1 text-slate-500 dark:text-slate-400 font-mono">
              {data.count} campaigns
            </span>
          )}
        </div>
      }
      loading={loading}
      error={error}
      onRetry={() => setRefreshKey((k) => k + 1)}
      empty={!loading && !data}
      emptyMessage="No campaign reference data available."
      maxWidthClass="max-w-6xl"
    >
      {data && (
        <>
          {/* Toolbar */}
          <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4 mb-4">
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, actor, description, tag, sector…"
                className="w-full rounded-lg border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--input-200))] py-2 pl-9 pr-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-brand-500/60 focus:outline-none"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-mini font-mono text-slate-500 mr-1">status:</span>
              {(['active', 'dormant', 'concluded'] as const).map((s) => {
                const active = statusFilter === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatusFilter(active ? null : s)}
                    className={`text-mini font-mono px-2 py-1 rounded border ${
                      active ? STATUS_COLOR[s] : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500'
                    }`}
                  >
                    {s}
                  </button>
                );
              })}
              <span className="text-mini font-mono text-slate-500 ml-2 mr-1">category:</span>
              {categories.map((cat) => {
                const active = categoryFilter === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(active ? null : cat)}
                    className={`text-mini font-mono px-2 py-1 rounded border ${
                      active
                        ? CATEGORY_COLOR[cat] ?? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                        : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500'
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
              {(statusFilter || categoryFilter) && (
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter(null);
                    setCategoryFilter(null);
                  }}
                  className="text-mini font-mono text-brand-600 dark:text-brand-400 hover:underline ml-2"
                >
                  clear
                </button>
              )}
            </div>
          </section>

          {/* Stats bar */}
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Total" value={stats.total} />
            <Stat label="Active" value={stats.active} />
            <Stat label="Dormant" value={stats.dormant} />
            <Stat label="Concluded" value={stats.concluded} />
          </div>

          {/* Campaign grid */}
          {filtered.length === 0 ? (
            <div className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              <Search className="mx-auto mb-2 h-8 w-8 text-slate-400 dark:text-slate-400" />
              No campaigns match the current filter.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {filtered.map((c) => (
                <CampaignCard key={c.slug} campaign={c} />
              ))}
            </div>
          )}
        </>
      )}
    </DataPageLayout>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 px-3 py-2">
      <div className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</div>
      <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">{value}</div>
    </div>
  );
}

function CampaignCard({ campaign: c }: { campaign: CampaignEntry }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4 hover:border-brand-500/40 transition-colors cursor-pointer"
      onClick={() => setExpanded((v) => !v)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setExpanded((v) => !v);
        }
      }}
    >
      <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
        <h3 className="font-display font-semibold text-base text-slate-900 dark:text-slate-100">{c.name}</h3>
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
          <span className={`text-micro font-mono px-1.5 py-0.5 rounded border ${STATUS_COLOR[c.status]}`}>
            {c.status}
          </span>
          <span
            className={`text-micro font-mono px-1.5 py-0.5 rounded border ${
              CATEGORY_COLOR[c.category] ??
              'border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500'
            }`}
          >
            {c.category}
          </span>
        </div>
      </div>
      {c.actor && (
        <p className="text-mini font-mono text-slate-500 dark:text-slate-400 mb-1.5">
          actor: <span className="text-slate-700 dark:text-slate-300">{c.actor}</span>
        </p>
      )}
      <p className="text-tool text-muted leading-relaxed mb-2 line-clamp-3">{c.description}</p>
      <div className="flex items-center gap-3 text-micro font-mono text-slate-500 dark:text-slate-400 mb-2 flex-wrap">
        {c.firstSeen && (
          <span>
            first seen: <span className="text-slate-700 dark:text-slate-300">{formatDate(c.firstSeen)}</span>
          </span>
        )}
        {c.lastUpdated && (
          <span>
            updated: <span className="text-slate-700 dark:text-slate-300">{formatDate(c.lastUpdated)}</span>
          </span>
        )}
      </div>
      {c.targets && c.targets.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {c.targets.map((t) => (
            <span key={t} className="px-1 py-0.5 rounded bg-slate-100 dark:bg-[rgb(var(--surface-300))] text-muted text-mini font-mono">
              {t}
            </span>
          ))}
        </div>
      )}
      {c.writeups.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {c.writeups.map((w, i) => (
            <a
              key={i}
              href={w.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-mini font-mono text-brand-600 dark:text-brand-400 hover:underline"
            >
              {w.title} <ExternalLink size={10} />
            </a>
          ))}
        </div>
      )}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-slate-200 dark:border-[rgb(var(--border-400))] space-y-2">
          {c.ttps && c.ttps.length > 0 && (
            <div>
              <span className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mr-2">
                TTPs:
              </span>
              <div className="flex flex-wrap gap-1 mt-1">
                {c.ttps.map((ttp) => (
                  <span
                    key={ttp}
                    className="px-1 py-0.5 rounded bg-slate-100 dark:bg-[rgb(var(--surface-300))] text-muted text-mini font-mono"
                  >
                    {ttp}
                  </span>
                ))}
              </div>
            </div>
          )}
          {c.geography && c.geography.length > 0 && (
            <p className="text-mini font-mono text-slate-500 dark:text-slate-400">
              geography: <span className="text-slate-700 dark:text-slate-300">{c.geography.join(', ')}</span>
            </p>
          )}
          {c.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {c.tags.map((t) => (
                <span
                  key={t}
                  className="px-1 py-0.5 rounded bg-slate-100 dark:bg-[rgb(var(--surface-300))] text-muted text-mini font-mono"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
