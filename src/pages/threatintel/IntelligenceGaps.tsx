import { useState } from 'react';
import { useApiData } from '../../hooks/useApiData';
import { DataPageLayout } from '../../components/DataPageLayout';
import { StatCards } from '../../components/ui/StatCards';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';

interface Gap {
  topic: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  current_knowledge: number;
  target_knowledge: number;
  collection_methods: string[];
  estimated_effort: string;
}

interface GapsResponse { gaps: Gap[]; }

const PRIORITY_BADGE: Record<string, string> = {
  critical: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  medium: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  low: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};

export default function IntelligenceGaps(): JSX.Element {
  const { data, loading, error, refetch } = useApiData<GapsResponse>(
    '/api/v1/threat-intel/predictive/gaps',
    { initial: { gaps: [] } }
  );

  const gaps = data?.gaps ?? [];
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [priorityFilter, setPriorityFilter] = useState<string | null>(null);

  const filtered = priorityFilter ? gaps.filter((g) => g.priority === priorityFilter) : gaps;
  const summary = { critical: 0, high: 0, medium: 0, low: 0 };
  gaps.forEach((g) => { if (g.priority in summary) summary[g.priority as keyof typeof summary]++; });

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<AlertTriangle size={28} />}
      title="Intelligence Gaps"
      description="Identify blind spots in your threat intelligence coverage."
      loading={loading && gaps.length === 0}
      error={error}
      onRetry={refetch}
      empty={!loading && filtered.length === 0}
      emptyMessage={priorityFilter ? `No ${priorityFilter} priority gaps.` : 'No intelligence gaps found.'}
      emptyIcon={<AlertTriangle size={32} className="text-slate-300 dark:text-slate-600" />}
    >
      <StatCards
        cards={[
          { label: 'Critical', value: summary.critical, onClick: () => setPriorityFilter(priorityFilter === 'critical' ? null : 'critical'), selected: priorityFilter === 'critical' },
          { label: 'High', value: summary.high, onClick: () => setPriorityFilter(priorityFilter === 'high' ? null : 'high'), selected: priorityFilter === 'high' },
          { label: 'Medium', value: summary.medium, onClick: () => setPriorityFilter(priorityFilter === 'medium' ? null : 'medium'), selected: priorityFilter === 'medium' },
          { label: 'Low', value: summary.low, onClick: () => setPriorityFilter(priorityFilter === 'low' ? null : 'low'), selected: priorityFilter === 'low' },
        ]}
      />

      <div className="mt-6 space-y-2">
        {filtered.map((gap, i) => {
          const isOpen = expanded.has(i);
          const coverage = gap.target_knowledge > 0 ? Math.round((gap.current_knowledge / gap.target_knowledge) * 100) : 0;
          return (
            <div key={i} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 overflow-hidden">
              <button
                type="button"
                onClick={() => setExpanded((prev) => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; })}
                className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-900/20 transition-colors"
              >
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${PRIORITY_BADGE[gap.priority]}`}>{gap.priority}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{gap.topic}</div>
                  <div className="text-[10px] font-mono text-slate-400">Coverage: {gap.current_knowledge}% → {gap.target_knowledge}%</div>
                </div>
                {isOpen ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
              </button>
              {isOpen && (
                <div className="px-4 pb-4 pt-0 border-t border-slate-100 dark:border-slate-800">
                  <div className="mt-3 mb-3">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">Knowledge Gap</div>
                    <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2">
                      <div className="bg-gradient-to-r from-brand-600 to-brand-400 h-2 rounded-full" style={{ width: `${coverage}%` }} />
                    </div>
                  </div>
                  <div className="mb-3">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">Methods</div>
                    <div className="flex flex-wrap gap-1">
                      {gap.collection_methods.map((m, j) => (
                        <span key={j} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300">{m}</span>
                      ))}
                    </div>
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400"><span className="font-medium">Effort:</span> {gap.estimated_effort}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </DataPageLayout>
  );
}
