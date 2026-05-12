import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Loader2, RefreshCw, Skull } from 'lucide-react';
import { ActorTtpsPanel } from '../../components/threatintel/ActorTtpsPanel';

interface MitreGroupRef {
  id: string;
  name: string;
  url: string;
}

interface ActorBucket {
  day: string;
  count: number;
}

interface ActorRow {
  slug: string;
  display_name: string;
  posts_in_window: number;
  all_time_count: number;
  buckets: ActorBucket[];
  description?: string;
  raas?: boolean;
  references: string[];
  mirrors_reachable: number;
  mirrors_total: number;
  mitre?: MitreGroupRef;
}

interface AggregateTechnique {
  id: string;
  name: string;
  tactic: string;
  used_by_count: number;
  used_by_groups: string[];
  weighted_activity: number;
}

interface ActorTimelineResponse {
  generated_at: string;
  window_days: number;
  days: string[];
  groups: ActorRow[];
  aggregate_techniques: AggregateTechnique[];
  groups_with_ttp_data: number;
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

function cellColor(count: number, max: number): string {
  if (count === 0) return 'bg-slate-100 dark:bg-slate-900';
  const intensity = Math.min(1, count / Math.max(1, max));
  if (intensity < 0.2) return 'bg-rose-200 dark:bg-rose-900/40';
  if (intensity < 0.4) return 'bg-rose-300 dark:bg-rose-800/60';
  if (intensity < 0.6) return 'bg-rose-400 dark:bg-rose-700/70';
  if (intensity < 0.8) return 'bg-rose-500 dark:bg-rose-600/80';
  return 'bg-rose-600 dark:bg-rose-500';
}

function shortDay(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

export default function ActorTimeline(): JSX.Element {
  const [data, setData] = useState<ActorTimelineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch('/api/v1/actor-timeline')
      .then((r) => {
        if (!r.ok) throw new Error(`upstream ${r.status}`);
        return r.json() as Promise<ActorTimelineResponse>;
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

  // Per-row max for relative shading (a group with 10 posts/day shouldn't drown
  // out a group whose top day is 3 — the visual question is "is this group's
  // cadence accelerating or cooling," not "which group is biggest").
  const rowMaxes = useMemo(() => {
    if (!data) return new Map<string, number>();
    const m = new Map<string, number>();
    for (const g of data.groups) {
      let max = 0;
      for (const b of g.buckets) if (b.count > max) max = b.count;
      m.set(g.slug, max);
    }
    return m;
  }, [data]);

  const xAxisLabels = useMemo(() => {
    if (!data) return [] as Array<{ idx: number; label: string }>;
    const out: Array<{ idx: number; label: string }> = [];
    // Label every 5 days, plus the last column.
    for (let i = 0; i < data.days.length; i += 5) {
      out.push({ idx: i, label: shortDay(data.days[i]!) });
    }
    if (out[out.length - 1]?.idx !== data.days.length - 1) {
      out.push({ idx: data.days.length - 1, label: shortDay(data.days[data.days.length - 1]!) });
    }
    return out;
  }, [data]);

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
          <Skull size={28} className="text-brand-600 dark:text-brand-400" /> Ransomware actor activity timeline
        </h1>
        <p className="text-slate-600 dark:text-slate-400 font-mono mb-2 max-w-3xl">
          Per-actor leak-site cadence across the last {data?.window_days ?? 30} days. Rows are the most-active groups
          this week; cells are daily post counts (relative shading per row so a slow week is still visible). MITRE
          ATT&CK Group profile linked where known, so you can pivot from "who's posting" to "what TTPs to hunt for."
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-500 font-mono mb-6">
          Joins Ransomlook per-group history with a curated MITRE Group lookup.
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6 flex items-center justify-between gap-3 flex-wrap">
        {data && (
          <p className="text-[11px] font-mono text-slate-500">
            {data.groups.length} active groups · snapshot{' '}
            <span className="text-slate-700 dark:text-slate-300">{shortRel(data.generated_at)}</span>
            {data.warnings.length > 0 && (
              <span className="text-amber-600 dark:text-amber-400 ml-2">
                · {data.warnings.length} per-group fetch warnings
              </span>
            )}
          </p>
        )}
        <button
          type="button"
          onClick={() => setRefreshKey((k) => k + 1)}
          className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-2 rounded border border-slate-200 dark:border-slate-800 hover:border-brand-500/40"
        >
          <RefreshCw size={12} /> refresh
        </button>
      </section>

      {loading && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 flex items-center gap-3 font-mono text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" /> fetching per-group histories from Ransomlook…
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/5 p-4 font-mono text-sm text-rose-600 dark:text-rose-300">
          Failed to load: {error}
        </div>
      )}

      {data && data.groups.length > 0 && (
        <>
          {/* Day axis legend */}
          <div
            className="font-mono text-[10px] text-slate-500 mb-1 grid"
            style={{ gridTemplateColumns: `200px repeat(${data.days.length}, minmax(0,1fr))` }}
          >
            <div></div>
            {data.days.map((_, i) => {
              const tick = xAxisLabels.find((l) => l.idx === i);
              return (
                <div key={i} className="text-center">
                  {tick ? tick.label : ''}
                </div>
              );
            })}
          </div>

          <ul className="space-y-2">
            {data.groups.map((g) => {
              const max = rowMaxes.get(g.slug) ?? 0;
              return (
                <li
                  key={g.slug}
                  className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3"
                >
                  <div
                    className="grid items-center gap-1"
                    style={{ gridTemplateColumns: `200px repeat(${g.buckets.length}, minmax(0,1fr))` }}
                  >
                    <div className="pr-3">
                      <div className="font-display font-semibold text-sm truncate" title={g.display_name}>
                        {g.display_name}
                      </div>
                      <div className="text-[10px] font-mono text-slate-500">
                        {g.posts_in_window} in {data.window_days}d · {g.all_time_count} all-time
                      </div>
                    </div>
                    {g.buckets.map((b) => (
                      <div
                        key={b.day}
                        className={`h-5 rounded-sm ${cellColor(b.count, max)} hover:ring-2 hover:ring-brand-500/40 transition-shadow`}
                        title={`${b.day} · ${b.count} post${b.count === 1 ? '' : 's'}`}
                      />
                    ))}
                  </div>

                  {/* Per-group footer: MITRE link, raas tag, refs */}
                  <div className="mt-2 ml-[200px] pl-0 flex items-center gap-2 flex-wrap text-[11px] font-mono text-slate-500">
                    {g.mitre ? (
                      <a
                        href={g.mitre.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300 hover:underline"
                      >
                        MITRE {g.mitre.id} · {g.mitre.name} <ExternalLink size={9} />
                      </a>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 text-slate-400">
                        not in MITRE
                      </span>
                    )}
                    {g.raas && (
                      <span className="px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                        RaaS
                      </span>
                    )}
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                      mirrors: {g.mirrors_reachable}/{g.mirrors_total} reachable
                    </span>
                    {g.references.slice(0, 3).map((ref, i) => {
                      let host = ref;
                      try {
                        host = new URL(ref).hostname.replace(/^www\./, '');
                      } catch {
                        /* ignore */
                      }
                      return (
                        <a
                          key={i}
                          href={ref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline hover:text-brand-600 dark:hover:text-brand-400 inline-flex items-center gap-1"
                          title={ref}
                        >
                          {host} <ExternalLink size={9} />
                        </a>
                      );
                    })}
                  </div>

                  {g.description && (
                    <p className="mt-2 ml-[200px] text-[11px] font-mono text-slate-600 dark:text-slate-400 leading-relaxed">
                      {g.description}
                      {g.description.length >= 400 ? '…' : ''}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="mt-6">
            <ActorTtpsPanel />
          </div>

          <section className="mt-6 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4">
            <h3 className="font-display font-semibold text-sm mb-2">How to read this</h3>
            <ul className="text-[12px] font-mono text-slate-600 dark:text-slate-400 space-y-1 list-disc list-inside">
              <li>
                Cell shading is relative to <em>each row's</em> peak, so a slow week for one group can still highlight
                its peak day.
              </li>
              <li>Empty cells = zero posts on that day. Hover any cell for exact count + date.</li>
              <li>
                "MITRE Gxxxx" pill links to ATT&CK Group profile (techniques, software, references). Newer groups may
                not be tracked yet.
              </li>
              <li>
                "RaaS" means the group operates as Ransomware-as-a-Service (recruits affiliates rather than executing
                intrusions directly).
              </li>
              <li>
                Aggregate TTPs panel: "X grp · Yp" means used by X active groups carrying Y total posts in the window.
              </li>
            </ul>
          </section>
        </>
      )}

      {!loading && !error && data && data.groups.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-sm font-mono text-slate-500">
          Ransomlook returned no data this snapshot. Try refresh.
        </div>
      )}
    </div>
  );
}
