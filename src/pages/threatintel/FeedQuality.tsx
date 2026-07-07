import { useEffect, useMemo, useState } from 'react';
import { BarChart3, ChevronDown, ChevronRight, Info, RefreshCw, Search, Sparkles } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useDataFetch } from '../../hooks/useDataFetch';
import { useLastVisit, isNewSince } from '../../hooks';
import { DataPageLayout } from '../../components/DataPageLayout';

interface PillarScore {
  score: number;
  label: string;
  rationale: string;
  details: Record<string, number | string>;
}

type Grade = 'A' | 'B' | 'C' | 'D' | 'F';
type GradeSet = Set<Grade>;
type GradeToggler = (g: Grade) => void;

interface FeedTifceScore {
  feedId: string;
  contributions: number;
  originality: PillarScore;
  envRelevance: PillarScore;
  signalNoise: PillarScore;
  freshness: PillarScore;
  composite: number;
  grade: Grade;
}

interface TifceResult {
  generated_at: string;
  feeds: FeedTifceScore[];
  summary: {
    total_feeds: number;
    feeds_evaluated: number;
    above_bar: number;
    median_composite: number;
  };
}

interface TifceResponse extends TifceResult {
  _meta: {
    feeds_in_response: number;
    correlation_ok: boolean;
    live_ok: boolean;
    tp_indicators_loaded: number;
    platform_indicators_loaded: number;
    detection_indicators_loaded: number;
    history_window_days: number;
    cache_ttl_seconds: number;
  };
}

const GRADE_COLOR: Record<Grade, string> = {
  A: 'text-emerald-600 dark:text-emerald-400 border-emerald-500/40 bg-emerald-500/10',
  B: 'text-sky-600 dark:text-sky-400 border-sky-500/40 bg-sky-500/10',
  C: 'text-amber-600 dark:text-amber-400 border-amber-500/40 bg-amber-500/10',
  D: 'text-orange-600 dark:text-orange-400 border-orange-500/40 bg-orange-500/10',
  F: 'text-rose-600 dark:text-rose-400 border-rose-500/40 bg-rose-500/10',
};

const PILLAR_LABELS: Record<
  keyof Pick<FeedTifceScore, 'originality' | 'envRelevance' | 'signalNoise' | 'freshness'>,
  { label: string; tip: string }
> = {
  originality: {
    label: 'P1 · Originality',
    tip: 'Rarity-weighted: IOCs that appear in 1 feed score higher than IOCs that appear in 12.',
  },
  envRelevance: {
    label: 'P2 · Platform relevance',
    tip: "Share of the feed's IOCs that the platform has independently surfaced (ioc_lifecycle TP hits + detection firings + case-study mentions). Stand-in for TIFCE's tenant-telemetry pillar.",
  },
  signalNoise: {
    label: 'P3 · Signal vs noise',
    tip: "TP-correlation ratio: what share of the feed's IOCs were later confirmed malicious? Dampened when TP hits < 5 to avoid single-IOC flukes.",
  },
  freshness: {
    label: 'P4 · Freshness',
    tip: '50/50 blend of newest-observation recency and 7d IOC-add velocity from the TIFCE history table.',
  },
};

const PILLAR_KEYS = ['originality', 'envRelevance', 'signalNoise', 'freshness'] as const;

function pillarBarColor(score: number): string {
  if (score >= 80) return 'bg-emerald-500';
  if (score >= 65) return 'bg-sky-500';
  if (score >= 50) return 'bg-amber-500';
  if (score >= 35) return 'bg-orange-500';
  return 'bg-rose-500';
}

function relativeAgo(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  const ageH = (Date.now() - t) / 3_600_000;
  if (ageH < 0) return 'just now';
  if (ageH < 1) return `${Math.round(ageH * 60)}m ago`;
  if (ageH < 24) return `${Math.round(ageH)}h ago`;
  return `${Math.round(ageH / 24)}d ago`;
}

export default function FeedQuality(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data, loading, error, refetch } = useDataFetch<TifceResponse>({
    url: '/api/v1/feed-quality',
    ttl: 5 * 60_000,
    staleWhileRevalidate: true,
  });
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [gradeFilter, setGradeFilter] = useState<GradeSet>(
    () => new Set((searchParams.get('grade')?.split(',').filter(Boolean) ?? []) as Grade[])
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showMeta, setShowMeta] = useState(false);
  const { previous: lastVisit, markVisited } = useLastVisit('feed-quality');
  const [newCount, setNewCount] = useState(0);

  useEffect(() => {
    setSearchParams(
      (prev) => {
        const out = new URLSearchParams(prev);
        if (query.trim()) out.set('q', query.trim());
        else out.delete('q');
        if (gradeFilter.size > 0) out.set('grade', [...gradeFilter].join(','));
        else out.delete('grade');
        return out;
      },
      { replace: true }
    );
  }, [query, gradeFilter, setSearchParams]);

  useEffect(() => {
    if (!data) return;
    const id = window.setTimeout(markVisited, 1500);
    return () => window.clearTimeout(id);
  }, [data, markVisited]);

  const filtered = useMemo(() => {
    if (!data) return [] as FeedTifceScore[];
    const q = query.trim().toLowerCase();
    return data.feeds.filter((f) => {
      if (gradeFilter.size > 0 && !gradeFilter.has(f.grade)) return false;
      if (!q) return true;
      return f.feedId.toLowerCase().includes(q);
    });
  }, [data, query, gradeFilter]);

  useEffect(() => {
    if (!data || !lastVisit) {
      setNewCount(0);
      return;
    }
    setNewCount(
      data.feeds.filter((f) => isNewSince(f.freshness.details.newest_observation as string, lastVisit)).length
    );
  }, [data, lastVisit]);

  const toggleGrade = (g: Grade) =>
    setGradeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<BarChart3 size={28} />}
      title="TIFCE — Feed Quality Scorecard"
      description="Four-pillar scorecard for every IOC feed in the live stream. The framework (TIFCE: TI Feed Content Evaluation) was originally published as a Microsoft Sentinel KQL workbook; this is a vendor-neutral re-implementation operating on the platform's own IOC infrastructure."
      loading={loading}
      error={error}
      empty={!error && (!data || data.feeds.length === 0)}
      emptyMessage="No TIFCE build available yet — the live-IOC stream hasn't reported enough feeds to score."
      onRetry={() => void refetch()}
      maxWidthClass="max-w-6xl"
      headerExtra={
        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mb-6 flex items-center gap-2 flex-wrap">
          <span>Scored hourly · cached 1h at the edge</span>
          <span>·</span>
          <a
            className="underline decoration-dotted hover:text-brand-600 dark:hover:text-brand-400"
            href="https://zenodo.org/records/18208974"
            target="_blank"
            rel="noopener noreferrer"
          >
            framework ref
          </a>
          <span>·</span>
          <a
            className="underline decoration-dotted hover:text-brand-600 dark:hover:text-brand-400"
            href="https://github.com/cyb3rmik3/KQL-threat-hunting-queries/tree/main/TIFCE"
            target="_blank"
            rel="noopener noreferrer"
          >
            KQL workbook ref
          </a>
        </p>
      }
    >
      {data && (
        <>
          <SummaryStrip data={data} />

          <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 dark:bg-amber-950/20 p-4 mb-4 text-xs text-amber-800 dark:text-amber-200">
            <p className="font-bold uppercase tracking-wider mb-1">Scoping note</p>
            <p className="leading-relaxed">
              Pillars 2 (Environmental Relevance) and 3 (Signal vs Noise) in the reference TIFCE workbook answer
              tenant-side questions — &ldquo;does this IOC hit MY endpoint/email telemetry?&rdquo; and &ldquo;does it
              correlate to MY confirmed incidents?&rdquo; This platform is a public CTI aggregator with no tenant
              telemetry. We substitute the strongest in-platform signals we track:{' '}
              <strong>ioc_lifecycle peak_score &gt; 0</strong> as a TP proxy and{' '}
              <strong>detection-rules firings + case-study briefings</strong> as a platform-relevance proxy. Interpret
              these two pillars as the platform&rsquo;s view, not a tenant metric.
            </p>
          </section>

          <FilterBar
            query={query}
            setQuery={setQuery}
            gradeFilter={gradeFilter}
            toggleGrade={toggleGrade}
            newCount={newCount}
            showMeta={showMeta}
            setShowMeta={setShowMeta}
            onRefresh={() => void refetch()}
            meta={data._meta}
          />

          <section aria-label="Feed quality scorecard" className="space-y-2.5">
            {filtered.map((feed) => (
              <FeedRow
                key={feed.feedId}
                feed={feed}
                expanded={expanded.has(feed.feedId)}
                onToggle={() => toggleExpanded(feed.feedId)}
              />
            ))}
            {filtered.length === 0 && (
              <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-6 text-center text-sm text-slate-500 font-mono">
                No feeds match the current filter.
              </div>
            )}
          </section>
        </>
      )}
    </DataPageLayout>
  );
}

function SummaryStrip({ data }: { data: TifceResponse }): JSX.Element {
  return (
    <section className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4 mb-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
      <Stat
        label="Feeds evaluated"
        value={data.summary.feeds_evaluated}
        sub={`of ${data.summary.total_feeds} registered`}
      />
      <Stat
        label="Above the bar (A/B)"
        value={data.summary.above_bar}
        sub={`${Math.round((data.summary.above_bar / Math.max(1, data.summary.feeds_evaluated)) * 100)}% of evaluated`}
      />
      <Stat label="Median composite" value={`${data.summary.median_composite.toFixed(1)}`} sub="weighted blend" />
      <Stat label="Build" value={relativeAgo(data.generated_at)} sub={new Date(data.generated_at).toLocaleString()} />
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: number | string; sub?: string }): JSX.Element {
  return (
    <div>
      <div className="text-micro font-mono uppercase tracking-wider text-slate-500">{label}</div>
      <div className="font-display font-bold text-xl tabular-nums">{value}</div>
      {sub && <div className="text-micro font-mono text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function FilterBar({
  query,
  setQuery,
  gradeFilter,
  toggleGrade,
  newCount,
  showMeta,
  setShowMeta,
  onRefresh,
  meta,
}: {
  query: string;
  setQuery: (v: string) => void;
  gradeFilter: GradeSet;
  toggleGrade: GradeToggler;
  newCount: number;
  showMeta: boolean;
  setShowMeta: (v: boolean) => void;
  onRefresh: () => void;
  meta: TifceResponse['_meta'];
}): JSX.Element {
  return (
    <section className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4 mb-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by feed id…"
            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
            aria-label="Filter feeds"
          />
        </div>
        {newCount > 0 && (
          <span
            className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-2 rounded border border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
            title={`${newCount} feed${newCount === 1 ? '' : 's'} with a new observation since your last visit`}
          >
            <Sparkles size={12} /> {newCount} new since last visit
          </span>
        )}
        <button
          type="button"
          onClick={() => setShowMeta(!showMeta)}
          className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-2 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40"
        >
          <Info size={12} /> build details
        </button>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-2 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40"
        >
          <RefreshCw size={12} /> refresh
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 mt-3">
        <span className="text-mini font-mono text-slate-500 mr-1">grade:</span>
        {(['A', 'B', 'C', 'D', 'F'] as const).map((g) => {
          const active = gradeFilter.has(g);
          return (
            <button
              key={g}
              type="button"
              onClick={() => toggleGrade(g)}
              className={`text-mini font-mono px-2 py-1 rounded border ${active ? GRADE_COLOR[g] : 'border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-500'}`}
              title={`${active ? 'remove' : 'add'} grade ${g}`}
            >
              {g}
            </button>
          );
        })}
      </div>
      {showMeta && (
        <dl className="mt-3 pt-3 border-t border-slate-200 dark:border-[rgb(var(--border-400))] grid grid-cols-2 sm:grid-cols-4 gap-2 text-mini font-mono">
          <Meta label="TP indicator set" value={meta.tp_indicators_loaded.toLocaleString()} />
          <Meta label="Platform-reported set" value={meta.platform_indicators_loaded.toLocaleString()} />
          <Meta label="Detection firings (24h)" value={meta.detection_indicators_loaded.toLocaleString()} />
          <Meta label="History window" value={`${meta.history_window_days}d`} />
          <Meta label="Feeds in response" value={meta.feeds_in_response.toLocaleString()} />
          <Meta label="IOC correlation" value={meta.correlation_ok ? 'ok' : 'degraded'} />
          <Meta label="Live IOC stream" value={meta.live_ok ? 'ok' : 'degraded'} />
          <Meta label="Cache TTL" value={`${Math.round(meta.cache_ttl_seconds / 60)}m`} />
        </dl>
      )}
    </section>
  );
}

function Meta({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <dt className="text-slate-500 uppercase tracking-wider text-micro">{label}</dt>
      <dd className="text-slate-900 dark:text-slate-100">{value}</dd>
    </div>
  );
}

function FeedRow({
  feed,
  expanded,
  onToggle,
}: {
  feed: FeedTifceScore;
  expanded: boolean;
  onToggle: () => void;
}): JSX.Element {
  return (
    <article className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50/60 dark:hover:bg-[rgb(var(--input-200)/0.4)] text-left"
        aria-expanded={expanded}
      >
        <span
          className={`shrink-0 inline-flex items-center justify-center w-9 h-9 rounded border font-display font-bold text-base ${GRADE_COLOR[feed.grade]}`}
          title={`composite ${feed.composite.toFixed(1)} → grade ${feed.grade}`}
        >
          {feed.grade}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-mono font-bold text-sm truncate">{feed.feedId}</span>
            <span className="text-micro font-mono text-slate-500 tabular-nums">
              {feed.contributions.toLocaleString()} IOC{feed.contributions === 1 ? '' : 's'}
            </span>
          </div>
          <PillarBars feed={feed} />
        </div>
        <div className="shrink-0 text-right hidden sm:block">
          <div className="font-display font-bold text-lg tabular-nums">{feed.composite.toFixed(1)}</div>
          <div className="text-micro font-mono text-slate-500 uppercase tracking-wider">composite</div>
        </div>
        {expanded ? (
          <ChevronDown size={16} className="shrink-0 text-slate-400" />
        ) : (
          <ChevronRight size={16} className="shrink-0 text-slate-400" />
        )}
      </button>
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-slate-200 dark:border-[rgb(var(--border-400))] space-y-3 bg-slate-50/40 dark:bg-[rgb(var(--input-200)/0.4)]">
          {PILLAR_KEYS.map((k) => {
            const p = feed[k];
            const meta = PILLAR_LABELS[k];
            return (
              <div key={k}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-mini font-mono uppercase tracking-wider font-bold text-slate-700 dark:text-slate-300">
                    {meta.label}
                  </span>
                  <span className="text-micro font-mono text-slate-500" title={meta.tip}>
                    <Info size={10} className="inline" /> {p.label}
                  </span>
                  <span className="ml-auto text-mini font-mono tabular-nums font-bold">{p.score.toFixed(1)}</span>
                </div>
                <p className="text-xs text-muted leading-relaxed mb-1">{p.rationale}</p>
                <PillarDetails details={p.details} />
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}

function PillarBars({ feed }: { feed: FeedTifceScore }): JSX.Element {
  return (
    <div className="grid grid-cols-4 gap-1.5 mt-1.5">
      {PILLAR_KEYS.map((k) => {
        const s = feed[k].score;
        return (
          <div key={k} className="flex items-center gap-1.5" title={`${PILLAR_LABELS[k].label}: ${s.toFixed(1)}`}>
            <div className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-[rgb(var(--surface-300))] overflow-hidden">
              <div
                className={`h-full ${pillarBarColor(s)} transition-[width] duration-300`}
                style={{ width: `${s}%` }}
              />
            </div>
            <span className="text-micro font-mono tabular-nums text-slate-500 w-7 text-right">{s.toFixed(0)}</span>
          </div>
        );
      })}
    </div>
  );
}

function PillarDetails({ details }: { details: Record<string, number | string> }): JSX.Element {
  const entries = Object.entries(details);
  if (entries.length === 0) return <></>;
  return (
    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1 text-micro font-mono">
      {entries.map(([k, v]) => (
        <div key={k} className="flex items-baseline gap-1.5">
          <dt className="text-slate-500 uppercase tracking-wider text-micro">{k}</dt>
          <dd className="text-slate-700 dark:text-slate-300 tabular-nums">
            {typeof v === 'number' ? v.toLocaleString() : v}
          </dd>
        </div>
      ))}
    </dl>
  );
}
