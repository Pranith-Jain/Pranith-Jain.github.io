import { useApiData } from '../../hooks/useApiData';
import { DataPageLayout } from '../../components/DataPageLayout';
import { StatCards } from '../../components/ui/StatCards';
import { TrendingUp, Shield } from 'lucide-react';

interface ThreatForecast {
  threat_type: string;
  probability: number;
  timeframe: string;
  basis: string[];
  confidence: 'high' | 'medium' | 'low';
  indicators_to_watch: string[];
}

interface PredictiveResponse {
  forecasts: ThreatForecast[];
  generated_at?: string;
}

const CONFIDENCE_BADGE: Record<string, string> = {
  high: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  medium: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  low: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};

export default function PredictiveIntel(): JSX.Element {
  const { data, loading, error, refetch } = useApiData<PredictiveResponse>(
    '/api/v1/threat-intel/predictive/forecasts',
    { initial: { forecasts: [] } }
  );

  const forecasts = data?.forecasts ?? [];
  const highCount = forecasts.filter((f) => f.confidence === 'high').length;
  const avgProbability = forecasts.length > 0
    ? Math.round(forecasts.reduce((s, f) => s + f.probability, 0) / forecasts.length)
    : 0;

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<TrendingUp size={28} />}
      title="Predictive Intelligence"
      description="AI-driven threat forecasting based on current intelligence trends."
      loading={loading && forecasts.length === 0}
      error={error}
      onRetry={refetch}
      empty={!loading && forecasts.length === 0}
      emptyMessage="No forecasts available yet."
      emptyIcon={<TrendingUp size={32} className="text-slate-300 dark:text-slate-600" />}
    >
      <StatCards
        cards={[
          { label: 'Forecasts', value: forecasts.length, icon: <TrendingUp size={16} /> },
          { label: 'High Confidence', value: highCount, icon: <Shield size={16} />, color: 'text-rose-600 dark:text-rose-400' },
          { label: 'Avg Probability', value: `${avgProbability}%`, color: 'text-brand-600 dark:text-brand-400' },
        ]}
      />

      <div className="mt-6 space-y-4">
        {forecasts.map((f, i) => (
          <div key={i} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h2 className="font-display font-bold text-sm">{f.threat_type}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] font-mono text-slate-400">{f.timeframe}</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${CONFIDENCE_BADGE[f.confidence]}`}>{f.confidence}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-display font-bold text-brand-600 dark:text-brand-400">{f.probability}%</div>
                <div className="text-[10px] font-mono text-slate-400">probability</div>
              </div>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2 mb-3">
              <div className="bg-gradient-to-r from-brand-600 to-brand-400 h-2 rounded-full" style={{ width: `${f.probability}%` }} />
            </div>
            {f.basis && f.basis.length > 0 && (
              <div className="mb-2">
                <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">Basis</div>
                <ul className="space-y-0.5">
                  {f.basis.map((b, j) => (
                    <li key={j} className="text-xs text-slate-600 dark:text-slate-400 flex items-start gap-1.5">
                      <span className="mt-1">•</span> {b}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {f.indicators_to_watch && f.indicators_to_watch.length > 0 && (
              <div className="mb-2">
                <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">Indicators to Watch</div>
                <div className="flex flex-wrap gap-1">
                  {f.indicators_to_watch.map((ind, j) => (
                    <span key={j} className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-slate-500">{ind}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </DataPageLayout>
  );
}
