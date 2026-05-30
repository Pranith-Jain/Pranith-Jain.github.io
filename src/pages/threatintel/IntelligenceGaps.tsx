import { useEffect, useState } from 'react';
import { useApiData } from '../../hooks/useApiData';
import { DataPageLayout } from '../../components/DataPageLayout';
import { StatCards } from '../../components/ui/StatCards';
import { AlertTriangle, ChevronDown, ChevronRight, Activity, CheckCircle2, Clock, HelpCircle } from 'lucide-react';

interface Gap {
  topic: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  current_knowledge: number;
  target_knowledge: number;
  collection_methods: string[];
  estimated_effort: string;
  related_pirs?: string[];
  what_would_change_my_mind?: string;
  source_coverage_score?: number;
  derived_severity?: number;
  addressed_by_pir?: boolean;
}

interface GapsResponse {
  gaps: Gap[];
}

interface SloSource {
  id: string;
  label: string;
  status: string;
  reliability?: string;
  upstream_age_s?: number;
}
interface SloResponse {
  total_sources: number;
  healthy: number;
  degraded: number;
  down: number;
  cold: number;
  rows: SloSource[];
}

const PRIORITY_BADGE: Record<string, string> = {
  critical: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  medium: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  low: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};

export default function IntelligenceGaps(): JSX.Element {
  const { data, loading, error, refetch } = useApiData<GapsResponse>('/api/v1/threat-intel/predictive/gaps', {
    initial: { gaps: [] },
  });
  const [slo, setSlo] = useState<SloResponse | null>(null);

  useEffect(() => {
    fetch('/api/v1/threat-intel/collection-slo')
      .then((r) => r.json() as Promise<SloResponse>)
      .then(setSlo)
      .catch(() => {
        /* non-critical */
      });
  }, []);

  const gaps = data?.gaps ?? [];
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [priorityFilter, setPriorityFilter] = useState<string | null>(null);

  const filtered = priorityFilter ? gaps.filter((g) => g.priority === priorityFilter) : gaps;
  const summary = { critical: 0, high: 0, medium: 0, low: 0 };
  gaps.forEach((g) => {
    if (g.priority in summary) summary[g.priority as keyof typeof summary]++;
  });

  const downSources = slo?.rows.filter((s) => s.status === 'down') ?? [];

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<AlertTriangle size={28} />}
      title="Intelligence Gaps & Collection Health"
      description="Identify blind spots in coverage. SLO panel shows live collection health across all 25+ sources."
      loading={loading && gaps.length === 0}
      error={error}
      onRetry={refetch}
      empty={!loading && filtered.length === 0}
      emptyMessage={priorityFilter ? `No ${priorityFilter} priority gaps.` : 'No intelligence gaps found.'}
      emptyIcon={<AlertTriangle size={32} className="text-slate-300 dark:text-slate-600" />}
    >
      {/* SLO snapshot */}
      {slo && (
        <div className="mb-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-xs font-bold uppercase tracking-[0.15em] text-brand-600 dark:text-brand-400 font-mono mb-3 flex items-center gap-2">
            <Activity size={12} /> Collection Health SLO
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 size={14} className="text-emerald-500" />
              <span className="text-xs font-mono">{slo.healthy} healthy</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Clock size={14} className="text-amber-500" />
              <span className="text-xs font-mono">{slo.degraded} degraded</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <AlertTriangle size={14} className="text-rose-500" />
              <span className="text-xs font-mono">{slo.down} down</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <HelpCircle size={14} className="text-slate-400" />
              <span className="text-xs font-mono">{slo.cold} cold/unknown</span>
            </div>
          </div>
          {downSources.length > 0 && (
            <div className="mt-3 p-2 rounded bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900">
              <p className="text-[10px] font-bold font-mono text-rose-700 dark:text-rose-300 uppercase tracking-wider">
                Down Sources — Blind Spots
              </p>
              <ul className="mt-1 space-y-0.5">
                {downSources.slice(0, 5).map((s) => (
                  <li key={s.id} className="text-[11px] font-mono text-rose-600 dark:text-rose-400">
                    {s.label} (
                    {s.upstream_age_s !== undefined ? `${Math.round(s.upstream_age_s / 3600)}h stale` : 'never seen'})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <StatCards
        cards={[
          {
            label: 'Critical',
            value: summary.critical,
            onClick: () => setPriorityFilter(priorityFilter === 'critical' ? null : 'critical'),
            selected: priorityFilter === 'critical',
          },
          {
            label: 'High',
            value: summary.high,
            onClick: () => setPriorityFilter(priorityFilter === 'high' ? null : 'high'),
            selected: priorityFilter === 'high',
          },
          {
            label: 'Medium',
            value: summary.medium,
            onClick: () => setPriorityFilter(priorityFilter === 'medium' ? null : 'medium'),
            selected: priorityFilter === 'medium',
          },
          {
            label: 'Low',
            value: summary.low,
            onClick: () => setPriorityFilter(priorityFilter === 'low' ? null : 'low'),
            selected: priorityFilter === 'low',
          },
        ]}
      />

      <div className="mt-6 space-y-2">
        {filtered.map((gap, i) => {
          const isOpen = expanded.has(i);
          const coverage =
            gap.target_knowledge > 0 ? Math.round((gap.current_knowledge / gap.target_knowledge) * 100) : 0;
          return (
            <div
              key={i}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 overflow-hidden"
            >
              <button
                type="button"
                onClick={() =>
                  setExpanded((prev) => {
                    const n = new Set(prev);
                    n.has(i) ? n.delete(i) : n.add(i);
                    return n;
                  })
                }
                className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-900/20 transition-colors"
              >
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${PRIORITY_BADGE[gap.priority]}`}>
                  {gap.priority}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{gap.topic}</div>
                  <div className="text-[10px] font-mono text-slate-400">
                    Coverage: {gap.current_knowledge}% → {gap.target_knowledge}%
                  </div>
                </div>
                {isOpen ? (
                  <ChevronDown size={14} className="text-slate-400" />
                ) : (
                  <ChevronRight size={14} className="text-slate-400" />
                )}
              </button>
              {isOpen && (
                <div className="px-4 pb-4 pt-0 border-t border-slate-100 dark:border-slate-800">
                  <div className="mt-3 mb-3">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">
                      Knowledge Gap
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2">
                      <div
                        className="bg-gradient-to-r from-brand-600 to-brand-400 h-2 rounded-full"
                        style={{ width: `${coverage}%` }}
                      />
                    </div>
                  </div>
                  {/* Derived severity */}
                  {gap.derived_severity !== undefined && (
                    <div className="mb-3">
                      <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">
                        Derived Gap Severity
                      </div>
                      <span
                        className={`text-[11px] font-mono px-2 py-1 rounded ${
                          gap.derived_severity >= 80
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
                            : gap.derived_severity >= 60
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                      >
                        {gap.derived_severity}/100
                      </span>
                    </div>
                  )}
                  {/* Source coverage score */}
                  {gap.source_coverage_score !== undefined && (
                    <div className="mb-3">
                      <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">
                        Source Coverage Score
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-slate-200 dark:bg-slate-800 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full ${
                              gap.source_coverage_score >= 70
                                ? 'bg-emerald-500'
                                : gap.source_coverage_score >= 40
                                  ? 'bg-amber-500'
                                  : 'bg-rose-500'
                            }`}
                            style={{ width: `${gap.source_coverage_score}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-mono text-slate-500">{gap.source_coverage_score}/100</span>
                      </div>
                    </div>
                  )}
                  {/* Addressed by PIR */}
                  {gap.addressed_by_pir !== undefined && (
                    <div className="mb-3">
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                          gap.addressed_by_pir
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {gap.addressed_by_pir ? 'Addressed by PIR' : 'No PIR tasking'}
                      </span>
                      {gap.related_pirs && gap.related_pirs.length > 0 && (
                        <span className="text-[10px] font-mono text-slate-400 ml-2">{gap.related_pirs.join(', ')}</span>
                      )}
                    </div>
                  )}
                  {/* What would change my mind */}
                  {gap.what_would_change_my_mind && (
                    <div className="mb-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                      <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">
                        ⚡ What Would Change My Mind
                      </div>
                      <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                        {gap.what_would_change_my_mind}
                      </p>
                    </div>
                  )}
                  <div className="mb-3">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">Methods</div>
                    <div className="flex flex-wrap gap-1">
                      {gap.collection_methods.map((m, j) => (
                        <span
                          key={j}
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300"
                        >
                          {m}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">
                    <span className="font-medium">Effort:</span> {gap.estimated_effort}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </DataPageLayout>
  );
}
