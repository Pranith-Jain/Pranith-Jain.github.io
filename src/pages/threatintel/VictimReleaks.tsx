import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink, RefreshCw, Search, Users } from 'lucide-react';
import { DataState } from '../../components/DataState';

interface VictimClaim {
  group: string;
  raw_victim: string;
  discovered: string;
  source_url?: string;
}

interface ReleakRow {
  key: string;
  group_count: number;
  raw_names: string[];
  claims: VictimClaim[];
  latest: string;
}

interface VictimReleaksResponse {
  generated_at: string;
  window_days: number;
  groups_scanned: number;
  victims_scanned: number;
  releaks: ReleakRow[];
  warnings: Array<{ slug: string; reason: string }>;
}

function shortRel(iso?: string): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const diff = Math.max(0, Date.now() - t) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function VictimReleaks(): JSX.Element {
  const [data, setData] = useState<VictimReleaksResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch('/api/v1/victim-releaks')
      .then((r) => {
        if (!r.ok) throw new Error(`upstream ${r.status}`);
        return r.json() as Promise<VictimReleaksResponse>;
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

  const filtered = useMemo(() => {
    if (!data) return [] as ReleakRow[];
    const q = query.trim().toLowerCase();
    if (!q) return data.releaks;
    return data.releaks.filter(
      (r) => r.raw_names.some((n) => n.toLowerCase().includes(q)) || r.claims.some((c) => c.group.includes(q))
    );
  }, [data, query]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </Link>

      <div className="animate-fade-in-up">
        <h1 className="text-4xl font-display font-bold mb-2 inline-flex items-center gap-3">
          <Users size={28} className="text-brand-600 dark:text-brand-400" /> Victim re-leak detection
        </h1>
        <p className="text-slate-600 dark:text-slate-400 font-mono mb-2 max-w-3xl">
          Victims claimed by 2+ ransomware groups within the last 12 months. Re-leaks usually mean a failed
          double-extortion (group A couldn't monetize, victim resurfaces under group B) or an affiliate dispute (a RaaS
          affiliate moved between programs and re-published the same haul).
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-500 font-mono mb-6">
          Scans the top-8 active ransomware groups' per-group histories. Victim names are normalized before matching, so
          verify any surfaced row against the raw strings before acting.
        </p>
      </div>

      {data && (
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">Groups scanned</div>
            <div className="font-display font-bold text-xl">{data.groups_scanned}</div>
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">Victims scanned</div>
            <div className="font-display font-bold text-xl">{data.victims_scanned.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">Re-leaks found</div>
            <div className="font-display font-bold text-xl">{data.releaks.length}</div>
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">Window</div>
            <div className="font-display font-bold text-xl">{data.window_days}d</div>
          </div>
        </section>
      )}

      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by victim or group name…"
              className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
              aria-label="Filter re-leaks"
            />
          </div>
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-2 rounded border border-slate-200 dark:border-slate-800 hover:border-brand-500/40"
          >
            <RefreshCw size={12} /> refresh
          </button>
        </div>
      </section>

      <DataState
        loading={loading}
        error={error}
        empty={!!data && filtered.length === 0}
        emptyLabel={
          query
            ? 'No re-leaks match the current filter.'
            : 'No cross-group re-leaks detected this snapshot. Either upstream is degraded or the top groups’ victim sets genuinely don’t overlap right now.'
        }
        onRetry={() => setRefreshKey((k) => k + 1)}
        rows={6}
      >
        <ul className="space-y-3">
          {filtered.map((r) => (
            <li
              key={r.key}
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4"
            >
              <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="font-display font-bold text-lg truncate" title={r.raw_names.join(' · ')}>
                    {r.raw_names[0]}
                  </div>
                  {r.raw_names.length > 1 && (
                    <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                      also seen as: {r.raw_names.slice(1).join(' · ')}
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-display font-bold text-xl text-rose-600 dark:text-rose-400">
                    ×{r.group_count}
                  </div>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">groups</div>
                </div>
              </div>

              <ul className="space-y-1">
                {r.claims.map((c, i) => (
                  <li key={i} className="text-[12px] font-mono flex items-baseline gap-2 flex-wrap">
                    <span className="px-1.5 py-0.5 rounded border border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300">
                      {c.group}
                    </span>
                    <span className="text-slate-600 dark:text-slate-400 truncate flex-1 min-w-0" title={c.raw_victim}>
                      “{c.raw_victim}”
                    </span>
                    <span className="text-slate-500 text-[11px]" title={c.discovered}>
                      {shortRel(c.discovered)}
                    </span>
                    {c.source_url && (
                      <a
                        href={c.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-0.5"
                      >
                        source <ExternalLink size={9} />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </DataState>

      {data && (
        <section className="mt-6 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4">
          <h3 className="font-display font-semibold text-sm mb-2">How victim names are matched</h3>
          <ul className="text-[12px] font-mono text-slate-600 dark:text-slate-400 space-y-1 list-disc list-inside">
            <li>
              Names are normalized: lowercased, legal suffixes stripped (Inc./LLC/Corp), TLD stripped on domain forms
              (acme.com → acme), masking asterisks dropped, non-alphanumerics collapsed.
            </li>
            <li>
              Match is "same normalized key." This is lossy by design, so verify each surfaced row against the raw
              strings.
            </li>
            <li>Keys shorter than 3 chars are rejected (mostly heavily-masked names like "***").</li>
            <li>Only the last {data.window_days} days are considered. Older co-occurrences are dropped.</li>
          </ul>
        </section>
      )}
    </div>
  );
}
