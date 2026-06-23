import { useApiData } from '../../hooks/useApiData';
import { DataPageLayout } from '../../components/DataPageLayout';
import { StatCards } from '../../components/ui/StatCards';
import { TrendingUp, Shield, Target, TrendingDown, Minus } from 'lucide-react';

interface ThreatForecast {
  threat_type: string;
  probability: number;
  timeframe: string;
  basis: string[];
  confidence: 'high' | 'medium' | 'low';
  indicators_to_watch: string[];
}

interface SectorRisk {
  sector: string;
  current_risk: number;
  trend: 'increasing' | 'stable' | 'decreasing';
  top_threats: string[];
  rationale: string;
  recommendations: string[];
}

interface PredictiveReport {
  generated_at: string;
  forecasts: ThreatForecast[];
  sector_risks: SectorRisk[];
  executive_summary: string;
}

const CONFIDENCE_BADGE: Record<string, string> = {
  high: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  medium: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  low: 'bg-slate-100 text-slate-600 dark:bg-[rgb(var(--surface-300))] dark:text-slate-400',
};

const TREND_ICON: Record<string, JSX.Element> = {
  increasing: <TrendingUp size={14} className="text-rose-500" />,
  decreasing: <TrendingDown size={14} className="text-emerald-500" />,
  stable: <Minus size={14} className="text-slate-400" />,
};

const RISK_BAR_COLOR: Record<string, string> = {
  increasing: 'from-rose-500 to-rose-400',
  stable: 'from-amber-500 to-amber-400',
  decreasing: 'from-emerald-500 to-emerald-400',
};

export default function PredictiveIntel(): JSX.Element {
  const { data, loading, error, refetch } = useApiData<PredictiveReport>('/api/v1/threat-intel/predictive/report', {
    initial: { forecasts: [], sector_risks: [], generated_at: '', executive_summary: '' },
  });

  const forecasts = data?.forecasts ?? [];
  const sectorRisks = data?.sector_risks ?? [];
  const summary = data?.executive_summary ?? '';

  const highCount = forecasts.filter((f) => f.confidence === 'high').length;
  const avgProbability =
    forecasts.length > 0 ? Math.round(forecasts.reduce((s, f) => s + f.probability, 0) / forecasts.length) : 0;
  const highRiskSectors = sectorRisks.filter((s) => s.current_risk >= 60).length;

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<TrendingUp size={28} />}
      title="Predictive Intelligence"
      description="AI-driven threat forecasting based on current intelligence trends."
      loading={loading && forecasts.length === 0}
      error={error}
      onRetry={refetch}
      empty={!loading && forecasts.length === 0 && sectorRisks.length === 0}
      emptyMessage="No predictive data available yet."
      emptyIcon={<TrendingUp size={32} className="text-slate-300 dark:text-slate-400" />}
    >
      {summary && (
        <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-gradient-to-br from-brand-500/5 to-brand-500/10 dark:from-brand-500/10 dark:to-brand-500/5 p-5 mb-6">
          <div className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-2">Executive Summary</div>
          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{summary}</p>
        </div>
      )}

      <StatCards
        cards={[
          { label: 'Active Forecasts', value: forecasts.length, icon: <TrendingUp size={16} /> },
          {
            label: 'High Confidence',
            value: highCount,
            icon: <Shield size={16} />,
            color: 'text-emerald-600 dark:text-emerald-400',
          },
          { label: 'Avg Probability', value: `${avgProbability}%`, color: 'text-brand-600 dark:text-brand-400' },
          {
            label: 'High-Risk Sectors',
            value: highRiskSectors,
            icon: <Target size={16} />,
            color: 'text-rose-600 dark:text-rose-400',
          },
        ]}
      />

      {/* Sector Risks */}
      {sectorRisks.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-display font-bold mb-4">Sector Risk Assessment</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {sectorRisks.map((s, i) => (
              <div
                key={i}
                className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/40 shadow-e1 p-5"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <h3 className="font-display font-bold text-sm capitalize">{s.sector}</h3>
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      {TREND_ICON[s.trend]}
                      {s.trend}
                    </span>
                  </div>
                  <span className="text-lg font-display font-bold text-slate-800 dark:text-slate-200">
                    {s.current_risk}
                  </span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-[rgb(var(--surface-300))] rounded-full h-2 mb-3">
                  <div
                    className={`h-2 rounded-full bg-gradient-to-r ${RISK_BAR_COLOR[s.trend]}`}
                    style={{ width: `${s.current_risk}%` }}
                  />
                </div>
                <div className="flex flex-wrap gap-1 mb-2">
                  {s.top_threats.map((t, j) => (
                    <span
                      key={j}
                      className="text-micro font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[rgb(var(--surface-300))] text-muted"
                    >
                      {t.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
                <p className="text-mini text-slate-500 leading-relaxed">{s.rationale}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Threat Forecasts */}
      {forecasts.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-display font-bold mb-4">Threat Forecasts</h2>
          <div className="space-y-4">
            {forecasts.map((f, i) => (
              <div
                key={i}
                className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/40 shadow-e1 p-5"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-display font-bold text-sm capitalize">{f.threat_type.replace(/_/g, ' ')}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-micro font-mono text-slate-400">{f.timeframe}</span>
                      <span className={`text-micro font-mono px-1.5 py-0.5 rounded ${CONFIDENCE_BADGE[f.confidence]}`}>
                        {f.confidence}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-display font-bold text-brand-600 dark:text-brand-400">
                      {f.probability}%
                    </div>
                    <div className="text-micro font-mono text-slate-400">probability</div>
                  </div>
                </div>
                <div className="w-full bg-slate-200 dark:bg-[rgb(var(--surface-300))] rounded-full h-2 mb-3">
                  <div className="bg-brand-500 h-2 rounded-full" style={{ width: `${f.probability}%` }} />
                </div>
                {f.basis && f.basis.length > 0 && (
                  <div className="mb-2">
                    <div className="text-micro font-mono uppercase tracking-wider text-slate-400 mb-1">Basis</div>
                    <ul className="space-y-0.5">
                      {f.basis.map((b, j) => (
                        <li key={j} className="text-xs text-muted flex items-start gap-1.5">
                          <span className="mt-1">•</span> {b}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {f.indicators_to_watch && f.indicators_to_watch.length > 0 && (
                  <div className="mb-2">
                    <div className="text-micro font-mono uppercase tracking-wider text-slate-400 mb-1">
                      Indicators to Watch
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {f.indicators_to_watch.map((ind, j) => (
                        <span
                          key={j}
                          className="text-micro font-mono px-1.5 py-0.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-500"
                        >
                          {ind}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </DataPageLayout>
  );
}
