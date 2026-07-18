import { useEffect, useMemo, useState } from 'react';
import { Activity, BarChart3, Gauge, Loader2 } from 'lucide-react';
import { DataState } from '../../components/DataState';

type DomainId = 'program' | 'situation' | 'analytical' | 'operational' | 'feedback';

interface DomainScore {
  id: DomainId;
  name: string;
  score: number;
  max_score: number;
  band: 'absent' | 'initial' | 'repeatable' | 'defined' | 'managed' | 'optimizing';
  rationale: string;
  signals: Array<{ name: string; present: boolean; detail?: string }>;
}

interface MaturityReport {
  generated_at: string;
  framework: string;
  overall: number;
  band: DomainScore['band'];
  domains: DomainScore[];
}

type ReliabilityGrade = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
type ReliabilityDistribution = Partial<Record<ReliabilityGrade, number>>;

interface FeedStatusResponse {
  reliability_distribution?: ReliabilityDistribution;
  sources?: Array<{ reliability: string }>;
}

const BAND_LABEL: Record<DomainScore['band'], string> = {
  absent: 'absent',
  initial: 'initial',
  repeatable: 'repeatable',
  defined: 'defined',
  managed: 'managed',
  optimizing: 'optimizing',
};

const BAND_TONE: Record<DomainScore['band'], string> = {
  absent: 'text-slate-500',
  initial: 'text-rose-600 dark:text-rose-400',
  repeatable: 'text-amber-600 dark:text-amber-400',
  defined: 'text-sky-600 dark:text-sky-400',
  managed: 'text-emerald-600 dark:text-emerald-400',
  optimizing: 'text-brand-600 dark:text-brand-400',
};

const RELIABILITY_TONE: Record<string, string> = {
  A: 'bg-emerald-500',
  B: 'bg-sky-500',
  C: 'bg-amber-500',
  D: 'bg-orange-500',
  E: 'bg-rose-500',
  F: 'bg-rose-700',
};

const RELIABILITY_LABEL: Record<string, string> = {
  A: 'A — reliable',
  B: 'B — usually reliable',
  C: 'C — fairly reliable',
  D: 'D — not usually reliable',
  E: 'E — unreliable',
  F: 'F — cannot be judged',
};

function MaturityBar({ score, max }: { score: number; max: number }): JSX.Element {
  const pct = max > 0 ? (score / max) * 100 : 0;
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-[rgb(var(--surface-300))] overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-rose-500 via-amber-500 to-emerald-500 transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function MaturityScorecard({ report }: { report: MaturityReport }): JSX.Element {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold font-display flex items-center gap-2">
            <Gauge size={14} className="text-brand-600 dark:text-brand-400" /> CTI Maturity
          </h3>
          <p className="text-mini font-mono text-slate-500 mt-0.5">
            {report.framework} · {report.domains.length} domains
          </p>
        </div>
        <div className="text-right">
          <p className={`text-2xl font-bold font-display ${BAND_TONE[report.band]}`}>
            {report.overall.toFixed(1)}
            <span className="text-sm text-slate-400">/5</span>
          </p>
          <p className={`text-micro font-mono uppercase tracking-wider ${BAND_TONE[report.band]}`}>
            {BAND_LABEL[report.band]}
          </p>
        </div>
      </div>
      <div className="space-y-3">
        {report.domains.map((d) => (
          <div key={d.id} className="surface-card p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                {d.name}
              </span>
              <span className={`text-xs font-mono font-bold ${BAND_TONE[d.band]}`}>
                {d.score}/{d.max_score}
              </span>
            </div>
            <MaturityBar score={d.score} max={d.max_score} />
            <p className="text-mini text-slate-500 dark:text-slate-400 mt-1.5 leading-snug">{d.rationale}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {d.signals.map((s, i) => (
                <span
                  key={i}
                  className={`text-micro font-mono px-1.5 py-0.5 rounded border ${
                    s.present
                      ? 'border-emerald-300 dark:border-emerald-700/40 text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20'
                      : 'border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-400 bg-slate-50 dark:bg-[rgb(var(--surface-300)/0.4)] line-through'
                  }`}
                  title={s.detail}
                >
                  {s.name}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReliabilityHistogram({ data }: { data: FeedStatusResponse }): JSX.Element {
  // Prefer the server-computed distribution; fall back to deriving from sources.
  const grades: ReliabilityGrade[] = ['A', 'B', 'C', 'D', 'E', 'F'];
  const [dist, total] = useMemo(() => {
    const d: ReliabilityDistribution =
      data.reliability_distribution ??
      (data.sources ?? []).reduce<ReliabilityDistribution>((acc, s) => {
        const k = s.reliability as ReliabilityGrade;
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {});
    const t = grades.reduce((sum, g) => sum + (d[g] ?? 0), 0);
    return [d, t] as const;
  }, [data]);
  const max = Math.max(1, ...grades.map((g) => dist[g] ?? 0));
  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-bold font-display flex items-center gap-2">
          <BarChart3 size={14} className="text-brand-600 dark:text-brand-400" /> Source Reliability
        </h3>
        <span className="text-micro font-mono text-slate-500">{total} sources graded</span>
      </div>
      <div className="surface-card p-3 space-y-2">
        {grades.map((g) => {
          const n = dist[g] ?? 0;
          const pct = total > 0 ? (n / total) * 100 : 0;
          const barPct = (n / max) * 100;
          return (
            <div key={g} className="flex items-center gap-2">
              <span className="w-4 text-xs font-mono font-bold text-slate-600 dark:text-slate-300 shrink-0">{g}</span>
              <div className="flex-1 h-3 rounded bg-slate-100 dark:bg-[rgb(var(--surface-300))] overflow-hidden">
                <div
                  className={`h-full ${RELIABILITY_TONE[g] ?? 'bg-slate-400'} transition-all`}
                  style={{ width: `${barPct}%` }}
                  title={`${RELIABILITY_LABEL[g] ?? g}: ${n}`}
                />
              </div>
              <span className="w-10 text-right text-mini font-mono text-slate-500 shrink-0">
                {n} <span className="text-slate-400">({pct.toFixed(0)}%)</span>
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-micro font-mono text-slate-500 mt-2 leading-relaxed">
        Admiralty source-reliability distribution. Lower grade = lower confidence in source.
      </p>
    </div>
  );
}

export function MaturityPanel(): JSX.Element {
  const [maturity, setMaturity] = useState<MaturityReport | null>(null);
  const [feed, setFeed] = useState<FeedStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    Promise.all([
      fetch('/api/v1/maturity', { signal: AbortSignal.any([ac.signal, AbortSignal.timeout(15_000)]) })
        .then((r) => r.json() as Promise<MaturityReport>)
        .catch(() => null),
      fetch('/api/v1/feed-status', { signal: AbortSignal.any([ac.signal, AbortSignal.timeout(15_000)]) })
        .then((r) => r.json() as Promise<FeedStatusResponse>)
        .catch(() => null),
    ])
      .then(([m, f]) => {
        if (m) setMaturity(m);
        if (f) setFeed(f);
        if (!m && !f) setError('maturity + feed-status both unreachable');
      })
      .catch((e) => {
        setError(e.message);
      });
    return () => ac.abort();
  }, []);

  if (error) {
    return (
      <div className="text-xs font-mono text-rose-500 flex items-center gap-1.5">
        <Activity size={12} /> {error}
      </div>
    );
  }
  if (!maturity || !feed) {
    return (
      <div className="text-xs font-mono text-slate-500 flex items-center gap-1.5">
        <Loader2 size={12} className="animate-spin" /> loading program health…
      </div>
    );
  }
  return (
    <DataState rows={1}>
      <div className="surface-card p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <MaturityScorecard report={maturity} />
          <ReliabilityHistogram data={feed} />
        </div>
      </div>
    </DataState>
  );
}

export default MaturityPanel;
