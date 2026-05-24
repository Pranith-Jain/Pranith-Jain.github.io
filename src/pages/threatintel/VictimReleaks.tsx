import { useEffect, useMemo, useState } from 'react';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, ChevronDown, ChevronRight, ExternalLink, RefreshCw, Search, Users } from 'lucide-react';
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

interface SectorCount {
  sector: string;
  count: number;
}
interface OptypeCount {
  optype: string;
  count: number;
}
interface GroupPair {
  a: string;
  b: string;
  count: number;
}
interface TimelineBucket {
  period: string;
  count: number;
}

interface VictimReleaksResponse {
  generated_at: string;
  window_days: number;
  groups_scanned: number;
  victims_scanned: number;
  releaks: ReleakRow[];
  by_sector: SectorCount[];
  by_optype: OptypeCount[];
  group_pairs: GroupPair[];
  timeline: TimelineBucket[];
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

/** Minimal horizontal-bar list — no chart dependency, matches the Metrics primitive. */
function HBar({ items, color }: { items: { label: string; value: number }[]; color: string }): JSX.Element {
  if (items.length === 0) return <p className="text-xs text-slate-500 italic font-mono">No data in window.</p>;
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="space-y-1.5">
      {items.map((it) => (
        <li key={it.label} className="text-[11px] font-mono">
          <div className="flex items-baseline justify-between mb-0.5">
            <span className="text-slate-700 dark:text-slate-300 truncate" title={it.label}>
              {it.label}
            </span>
            <span className="text-slate-500 tabular-nums shrink-0 ml-2">{it.value}</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max(2, (it.value / max) * 100)}%`, backgroundColor: color }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Sparkbars({ buckets }: { buckets: TimelineBucket[] }): JSX.Element {
  if (buckets.length === 0) return <p className="text-xs text-slate-500 italic font-mono">No re-leak events.</p>;
  const max = Math.max(...buckets.map((b) => b.count), 1);
  const w = 480;
  const h = 90;
  const bw = w / buckets.length - 3;
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h + 22}`} className="w-full" role="img" aria-label="Re-leak events by month">
        {buckets.map((b, i) => {
          const x = (i * w) / buckets.length;
          const bh = (b.count / max) * h;
          return (
            <g key={b.period}>
              <rect x={x + 1} y={h - bh} width={bw} height={Math.max(1, bh)} fill="#e11d48" rx={1}>
                <title>
                  {b.period}: {b.count}
                </title>
              </rect>
              <text
                x={x + 1 + bw / 2}
                y={h + 14}
                textAnchor="middle"
                fontSize="9"
                fontFamily="ui-monospace,monospace"
                className="fill-slate-500"
              >
                {b.period.slice(2)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

const OPTYPE_COLOR: Record<string, string> = {
  RaaS: '#e11d48',
  'Extortion-only': '#f59e0b',
  Unclassified: '#64748b',
};

export default function VictimReleaks(): JSX.Element {
  const [data, setData] = useState<VictimReleaksResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [showRows, setShowRows] = useState(false);

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
    // Both haystacks need .toLowerCase() — the gang side previously
    // compared raw casing and missed real-world hits like searching
    // "lockbit" against `c.group === "LockBit"`.
    return data.releaks.filter(
      (r) =>
        r.raw_names.some((n) => n.toLowerCase().includes(q)) || r.claims.some((c) => c.group.toLowerCase().includes(q))
    );
  }, [data, query]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 flex items-center gap-3">
          <Users size={28} className="text-brand-600 dark:text-brand-400" /> Victim re-leak trends
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-2 max-w-3xl leading-relaxed">
          Victims claimed by 2+ ransomware groups within the last 12 months — a high-signal indicator of failed
          double-extortion or affiliate movement between programs. This view leads with the trend shape:{' '}
          <strong>which sectors, which operation types, and which group pairs</strong> drive re-leaks. Individual victim
          rows are secondary and collapsed below.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mb-6">
          Scans the top-8 active groups' per-group histories. Sector is a name-only heuristic; operation-type is a
          curated lookup — both best-effort, verify before acting.
        </p>
      </div>

      {data && (
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-4 text-[12px] font-mono">
            <span>
              <span className="text-slate-500">groups scanned</span>{' '}
              <span className="font-display font-bold tabular-nums">{data.groups_scanned}</span>
            </span>
            <span>
              <span className="text-slate-500">victims scanned</span>{' '}
              <span className="font-display font-bold tabular-nums">{data.victims_scanned.toLocaleString()}</span>
            </span>
            <span>
              <span className="text-slate-500">re-leaks</span>{' '}
              <span className="font-display font-bold tabular-nums text-rose-600 dark:text-rose-400">
                {data.releaks.length}
              </span>
            </span>
            <span>
              <span className="text-slate-500">window</span>{' '}
              <span className="font-display font-bold tabular-nums">{data.window_days}d</span>
            </span>
          </div>
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-2 rounded border border-slate-200 dark:border-slate-800 hover:border-brand-500/40"
          >
            <RefreshCw size={12} /> refresh
          </button>
        </section>
      )}

      <DataState
        loading={loading}
        error={error}
        empty={!!data && data.releaks.length === 0}
        emptyLabel="No cross-group re-leaks detected this snapshot. Either upstream is degraded or the top groups' victim sets genuinely don't overlap right now."
        onRetry={() => setRefreshKey((k) => k + 1)}
        rows={6}
      >
        {data && (
          <>
            <div className="grid gap-4 lg:grid-cols-2 mb-4">
              <Panel title="Re-leaks by sector" sub="Heuristic — classified from victim name only">
                <HBar items={data.by_sector.map((s) => ({ label: s.sector, value: s.count }))} color="#0891b2" />
              </Panel>
              <Panel title="Re-leak participation by operation type" sub="Per distinct group, per victim · curated">
                <ul className="space-y-1.5">
                  {data.by_optype.length === 0 && (
                    <li className="text-xs text-slate-500 italic font-mono">No data in window.</li>
                  )}
                  {data.by_optype.map((o) => {
                    const max = Math.max(...data.by_optype.map((x) => x.count), 1);
                    return (
                      <li key={o.optype} className="text-[11px] font-mono">
                        <div className="flex items-baseline justify-between mb-0.5">
                          <span className="text-slate-700 dark:text-slate-300">{o.optype}</span>
                          <span className="text-slate-500 tabular-nums">{o.count}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.max(2, (o.count / max) * 100)}%`,
                              backgroundColor: OPTYPE_COLOR[o.optype] ?? '#64748b',
                            }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Panel>
              <Panel title="Top group↔group re-claim pairs" sub="Same victim surfaced under both groups">
                {data.group_pairs.length === 0 ? (
                  <p className="text-xs text-slate-500 italic font-mono">No multi-group pairs in window.</p>
                ) : (
                  <ul className="space-y-1">
                    {data.group_pairs.map((p) => (
                      <li key={`${p.a}|${p.b}`} className="text-[12px] font-mono flex items-baseline gap-2 flex-wrap">
                        <span className="px-1.5 py-0.5 rounded border border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300">
                          {p.a}
                        </span>
                        <span className="text-slate-400">↔</span>
                        <span className="px-1.5 py-0.5 rounded border border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300">
                          {p.b}
                        </span>
                        <span className="ml-auto text-slate-500 tabular-nums">×{p.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel title="Re-leak claim volume by month" sub={`Across the last ${data.window_days} days`}>
                <Sparkbars buckets={data.timeline} />
              </Panel>
            </div>

            {/* Individual rows — demoted: collapsed, behind a toggle, no longer the headline */}
            <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <button
                type="button"
                onClick={() => setShowRows((s) => !s)}
                className="w-full flex items-center justify-between gap-2 p-4 font-mono text-sm"
                aria-expanded={showRows}
              >
                <span className="inline-flex items-center gap-2">
                  {showRows ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  Individual re-leak records ({data.releaks.length})
                </span>
                <span className="text-[11px] text-slate-500">verification detail — expand if needed</span>
              </button>

              {showRows && (
                <div className="border-t border-slate-200 dark:border-slate-800 p-4">
                  <div className="relative mb-3">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Filter by victim or group name…"
                      className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-sm focus:outline-none focus:border-brand-500"
                      aria-label="Filter re-leaks"
                    />
                  </div>
                  {filtered.length === 0 ? (
                    <p className="font-mono text-[12px] text-slate-500">No re-leaks match the current filter.</p>
                  ) : (
                    <ul className="space-y-3">
                      {filtered.map((r) => (
                        <li
                          key={r.key}
                          className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4"
                        >
                          <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
                            <div className="min-w-0 flex-1">
                              <div
                                className="font-display font-bold text-base truncate"
                                title={r.raw_names.join(' · ')}
                              >
                                {r.raw_names[0] ?? r.key}
                              </div>
                              {r.raw_names.length > 1 && (
                                <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                                  also seen as: {r.raw_names.slice(1).join(' · ')}
                                </div>
                              )}
                            </div>
                            <div className="shrink-0 font-display font-bold text-lg text-rose-600 dark:text-rose-400">
                              ×{r.group_count}
                            </div>
                          </div>
                          <ul className="space-y-1">
                            {r.claims.map((c, i) => (
                              <li
                                key={`${c.group}:${c.raw_victim}:${i}`}
                                className="text-[12px] font-mono flex items-baseline gap-2 flex-wrap"
                              >
                                <span className="px-1.5 py-0.5 rounded border border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300">
                                  {c.group}
                                </span>
                                <span
                                  className="text-slate-600 dark:text-slate-400 truncate flex-1 min-w-0"
                                  title={c.raw_victim}
                                >
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
                  )}
                </div>
              )}
            </section>
          </>
        )}
      </DataState>

      {data && (
        <section className="mt-6 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4">
          <h3 className="font-display font-semibold text-sm mb-2">Method & caveats</h3>
          <ul className="text-[12px] font-mono text-slate-600 dark:text-slate-400 space-y-1 list-disc list-inside">
            <li>
              Match key = normalized victim name (lowercased, legal suffixes + TLD stripped, masking dropped). Lossy by
              design — verify rows against raw strings.
            </li>
            <li>
              Sector is inferred from the victim name only (no description) — treat as directional, not definitive.
            </li>
            <li>
              Operation type is a curated group→type lookup; unknown groups are shown honestly as “Unclassified”.
              “Double extortion” is intentionally not a bucket — it's near-universal and carries no signal.
            </li>
            <li>Only the last {data.window_days} days are considered. Older co-occurrences are dropped.</li>
          </ul>
        </section>
      )}
    </div>
  );
}

function Panel({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <h3 className="font-display font-semibold text-sm">{title}</h3>
      <p className="text-[11px] font-mono text-slate-500 mb-3">{sub}</p>
      {children}
    </div>
  );
}
