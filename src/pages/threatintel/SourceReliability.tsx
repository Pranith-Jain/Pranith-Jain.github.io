import { useApiData } from '../../hooks/useApiData';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Shield, ShieldCheck, ShieldAlert, HelpCircle } from 'lucide-react';

interface SourceEntry {
  id: string;
  name: string;
  reliability: string;
  category: string;
  description: string;
  known_bias?: string;
}
interface SourceResponse {
  total_sources: number;
  sources: SourceEntry[];
}

const RELIABILITY_COLORS: Record<string, string> = {
  A: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-900',
  B: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-900',
  C: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-900',
  D: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-900',
  E: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-900',
  F: 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-300 dark:border-slate-700',
};

const CATEGORY_ICONS: Record<string, typeof Shield> = {
  primary: ShieldCheck,
  secondary: Shield,
  tertiary: ShieldAlert,
  ai_generated: HelpCircle,
  inferred: HelpCircle,
};

const RELIABILITY_DESC: Record<string, string> = {
  A: 'Reliable — authoritative, no known bias',
  B: 'Usually reliable — minor caveats',
  C: 'Fairly reliable — corroboration recommended',
  D: 'Not usually reliable — treat with caution',
  E: 'Unreliable — likely inaccurate',
  F: 'Unassessed — no track record',
};

export default function SourceReliability(): JSX.Element {
  const { data, loading, error, refetch } = useApiData<SourceResponse>('/api/v1/source-reliability', {
    initial: { total_sources: 0, sources: [] },
  });

  const sources = data?.sources ?? [];

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Shield size={28} />}
      title="Source Reliability"
      description="NATO Admiralty Code grading for every intelligence source — how much to trust each collector."
      loading={loading && sources.length === 0}
      error={error}
      onRetry={refetch}
    >
      <div className="space-y-1 mb-6">
        {(['A', 'B', 'C', 'D', 'E', 'F'] as const).map((r) => (
          <div
            key={r}
            className={`flex items-center gap-2 text-mini font-mono px-2 py-1 rounded ${RELIABILITY_COLORS[r]}`}
          >
            <span className="font-bold w-4">{r}</span>
            <span>{RELIABILITY_DESC[r]}</span>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        {sources.map((s) => {
          const Icon = CATEGORY_ICONS[s.category] ?? Shield;
          return (
            <div
              key={s.id}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 shadow-e1 p-4"
            >
              <div className="flex items-start gap-3">
                <span
                  className={`text-mini font-mono px-1.5 py-0.5 rounded font-bold border ${RELIABILITY_COLORS[s.reliability] ?? ''}`}
                >
                  {s.reliability}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Icon size={14} className="text-slate-400 shrink-0" />
                    <span className="text-sm font-medium">{s.name}</span>
                    <span className="text-micro font-mono text-slate-400">({s.id})</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{s.description}</p>
                  {s.known_bias && (
                    <p className="text-micro font-mono text-amber-600 dark:text-amber-400 mt-1">Bias: {s.known_bias}</p>
                  )}
                </div>
                <span className="text-micro font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 capitalize shrink-0">
                  {s.category.replace('_', ' ')}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </DataPageLayout>
  );
}
