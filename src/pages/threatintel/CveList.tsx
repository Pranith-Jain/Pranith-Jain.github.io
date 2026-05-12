import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertOctagon,
  ArrowLeft,
  ExternalLink,
  Flame,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { useLastVisit, isNewSince } from '../../hooks';

interface RecentCve {
  id: string;
  published: string;
  modified: string;
  description: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE' | 'UNKNOWN';
  score: number | null;
  reference?: string;
  kev: boolean;
  kev_added?: string;
  kev_due?: string;
  kev_ransomware?: boolean;
  actors?: Array<{ slug: string; mitre_id?: string; mitre_url?: string; mitre_name?: string }>;
  origin: 'nvd' | 'kev';
}

interface CveResponse {
  generated_at: string;
  sources: { id: string; ok: boolean; count: number }[];
  count: number;
  kev_count: number;
  cves: RecentCve[];
}

const SEVERITY_PILL: Record<RecentCve['severity'], string> = {
  CRITICAL: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  HIGH: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  MEDIUM: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300',
  LOW: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  NONE: 'border-slate-300 dark:border-slate-700 text-slate-500',
  UNKNOWN: 'border-slate-300 dark:border-slate-700 text-slate-500',
};

function shortRel(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const diff = Math.max(0, Date.now() - t) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function CveList(): JSX.Element {
  const [data, setData] = useState<CveResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [severityFilter, setSeverityFilter] = useState<Set<RecentCve['severity']>>(new Set());
  const [kevOnly, setKevOnly] = useState(false);
  const [newOnly, setNewOnly] = useState(false);
  const { previous: lastVisit, markVisited } = useLastVisit('cve-list');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch('/api/v1/cve-recent')
      .then((r) => {
        if (!r.ok) throw new Error(`upstream ${r.status}`);
        return r.json() as Promise<CveResponse>;
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
  }, [refreshKey]);

  // Mark the visit AFTER data lands so the "new since" diff uses the OLD
  // timestamp. Defer with setTimeout so the diff highlight has time to render.
  useEffect(() => {
    if (!data) return;
    const id = window.setTimeout(markVisited, 1500);
    return () => window.clearTimeout(id);
  }, [data, markVisited]);

  const newCount = useMemo(() => {
    if (!data || !lastVisit) return 0;
    return data.cves.filter((c) => isNewSince(c.published, lastVisit)).length;
  }, [data, lastVisit]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.cves.filter((c) => {
      if (kevOnly && !c.kev) return false;
      if (newOnly && !isNewSince(c.published, lastVisit)) return false;
      if (severityFilter.size > 0 && !severityFilter.has(c.severity)) return false;
      if (!q) return true;
      return c.id.toLowerCase().includes(q) || c.description.toLowerCase().includes(q);
    });
  }, [data, query, severityFilter, kevOnly, newOnly, lastVisit]);

  const toggleSeverity = (s: RecentCve['severity']) => {
    setSeverityFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> /threatintel
      </Link>

      <div className="animate-fade-in-up">
        <h1 className="text-4xl font-display font-bold mb-2 inline-flex items-center gap-3">
          <ShieldAlert size={28} className="text-brand-600 dark:text-brand-400" /> Live CVE updates
        </h1>
        <p className="text-slate-600 dark:text-slate-400 font-mono mb-2 max-w-3xl">
          Up to <strong>150 CVEs newly published in the last 30 days</strong> (NVD), merged with recent additions to{' '}
          <strong>CISA's Known-Exploited-Vulnerabilities catalogue</strong> (last 30 days). NVD reports ~5,500 CVEs per
          30-day window. This is a triage sample, not the full corpus. For exhaustive search use{' '}
          <a
            href="https://nvd.nist.gov/vuln/search"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            nvd.nist.gov/vuln/search
          </a>
          . Entries flagged KEV are known to be exploited in the wild, so prioritise those. Click a CVE id to drill into{' '}
          <Link to="/dfir/cve" className="text-brand-600 dark:text-brand-400 hover:underline">
            CVE Lookup
          </Link>{' '}
          (full NVD + EPSS + KEV record).
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-500 font-mono mb-6">
          Sources: <span className="text-slate-700 dark:text-slate-300">NVD published-CVE feed</span> merged with the{' '}
          <span className="text-slate-700 dark:text-slate-300">CISA KEV catalogue</span>.
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by CVE id or description text…"
              className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
              aria-label="Filter CVEs"
            />
          </div>
          <button
            type="button"
            onClick={() => setKevOnly((v) => !v)}
            className={`inline-flex items-center gap-1.5 text-xs font-mono px-3 py-2 rounded border ${
              kevOnly
                ? 'border-rose-500/60 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                : 'border-slate-200 dark:border-slate-800 hover:border-brand-500/40'
            }`}
            title="Toggle CISA KEV-only (actively exploited CVEs)"
          >
            <Flame size={12} /> KEV only{data ? ` · ${data.kev_count}` : ''}
          </button>
          {newCount > 0 && (
            <button
              type="button"
              onClick={() => setNewOnly((v) => !v)}
              className={`inline-flex items-center gap-1.5 text-xs font-mono px-3 py-2 rounded border ${
                newOnly
                  ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300 hover:border-emerald-500/60'
              }`}
              title={`${newCount} new since your last visit${lastVisit ? ` (${new Date(lastVisit).toLocaleString()})` : ''}`}
            >
              <Sparkles size={12} /> {newCount} new since last visit
            </button>
          )}
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-2 rounded border border-slate-200 dark:border-slate-800 hover:border-brand-500/40"
          >
            <RefreshCw size={12} /> refresh
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mt-3">
          <span className="text-[11px] font-mono text-slate-500 mr-1">severity:</span>
          {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NONE', 'UNKNOWN'] as const).map((s) => {
            const active = severityFilter.has(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleSeverity(s)}
                className={`text-[11px] font-mono px-2 py-1 rounded border ${
                  active ? SEVERITY_PILL[s] : 'border-slate-300 dark:border-slate-700 text-slate-500'
                }`}
              >
                {s}
              </button>
            );
          })}
          {severityFilter.size > 0 && (
            <button
              type="button"
              onClick={() => setSeverityFilter(new Set())}
              className="text-[11px] font-mono text-brand-600 dark:text-brand-400 hover:underline ml-2"
            >
              clear
            </button>
          )}
        </div>
      </section>

      {data && (
        <p className="text-[11px] font-mono text-slate-500 mb-4">
          Showing {filtered.length} of {data.count} ({data.kev_count ?? 0} on KEV) · sources:{' '}
          {(data.sources ?? []).map((s) => `${s.id} ${s.ok ? `(${s.count})` : 'OFFLINE'}`).join(' · ')} · snapshot{' '}
          <span className="text-slate-700 dark:text-slate-300">{shortRel(data.generated_at)}</span>
        </p>
      )}

      {loading && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 flex items-center gap-3 font-mono text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" /> loading from NVD…
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/5 p-4 font-mono text-sm text-rose-600 dark:text-rose-300">
          Failed to load: {error}
        </div>
      )}

      <ul className="space-y-2">
        {filtered.map((c) => {
          const isNew = isNewSince(c.published, lastVisit);
          return (
            <li
              key={c.id}
              className={`rounded-lg border p-4 ${
                isNew
                  ? 'border-emerald-500/50 bg-emerald-50/40 dark:bg-emerald-900/10 ring-1 ring-emerald-500/20'
                  : c.kev
                    ? 'border-rose-500/40 bg-rose-50/30 dark:bg-rose-900/10'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
              }`}
            >
              <div className="flex items-baseline justify-between gap-2 mb-2 flex-wrap">
                <Link
                  to={`/dfir/cve?id=${encodeURIComponent(c.id)}`}
                  className="font-display font-semibold text-base text-slate-900 dark:text-slate-100 hover:text-brand-600 dark:hover:text-brand-400 font-mono inline-flex items-center gap-2"
                >
                  {c.id}
                  {isNew && (
                    <span
                      className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-emerald-500/60 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1"
                      title="new since your last visit"
                    >
                      <Sparkles size={9} /> new
                    </span>
                  )}
                </Link>
                <div className="flex items-center gap-2 text-[11px] font-mono flex-wrap">
                  {c.kev && (
                    <span
                      className="uppercase tracking-wider px-1.5 py-0.5 rounded border border-rose-500/60 bg-rose-500/15 text-rose-700 dark:text-rose-300 inline-flex items-center gap-1"
                      title={`Listed on CISA KEV ${c.kev_added ?? ''}${c.kev_due ? ` · federal due ${c.kev_due}` : ''}`}
                    >
                      <Flame size={9} /> KEV
                    </span>
                  )}
                  {c.kev_ransomware && (
                    <span
                      className="uppercase tracking-wider px-1.5 py-0.5 rounded border border-amber-500/60 bg-amber-500/15 text-amber-700 dark:text-amber-300 inline-flex items-center gap-1"
                      title="CISA flags this as used in known ransomware campaigns"
                    >
                      <AlertOctagon size={9} /> ransomware
                    </span>
                  )}
                  {c.actors && c.actors.length > 0 && (
                    <span className="inline-flex items-center gap-1 flex-wrap">
                      {c.actors.map((a) =>
                        a.mitre_url ? (
                          <a
                            key={a.slug}
                            href={a.mitre_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-1.5 py-0.5 rounded border border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300 hover:underline lowercase tracking-normal"
                            title={`MITRE ${a.mitre_id} · ${a.mitre_name}`}
                          >
                            {a.slug}
                            <span className="opacity-70"> · {a.mitre_id}</span>
                          </a>
                        ) : (
                          <span
                            key={a.slug}
                            className="px-1.5 py-0.5 rounded border border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300 lowercase tracking-normal"
                            title="curated actor (not yet in MITRE)"
                          >
                            {a.slug}
                          </span>
                        )
                      )}
                    </span>
                  )}
                  <span
                    className={`uppercase tracking-wider px-1.5 py-0.5 rounded border ${SEVERITY_PILL[c.severity]}`}
                  >
                    {c.severity}
                  </span>
                  {c.score !== null && <span className="text-slate-500">{c.score.toFixed(1)}</span>}
                  <span
                    className="text-slate-400"
                    title={c.origin === 'kev' ? `Added to KEV ${c.kev_added}` : `Published ${c.published}`}
                  >
                    {shortRel(c.published)}
                  </span>
                </div>
              </div>
              <p className="text-[12px] font-mono text-slate-600 dark:text-slate-400 leading-relaxed">
                {c.description}
              </p>
              {c.reference && (
                <a
                  href={c.reference}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-mono text-brand-600 dark:text-brand-400 hover:underline mt-2"
                >
                  primary reference <ExternalLink size={9} />
                </a>
              )}
            </li>
          );
        })}
      </ul>

      {!loading && !error && filtered.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-sm font-mono text-slate-500">
          No CVEs match the current filter.
        </div>
      )}
    </div>
  );
}
