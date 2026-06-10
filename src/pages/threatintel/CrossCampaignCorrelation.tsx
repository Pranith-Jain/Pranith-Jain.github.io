import { useState, useCallback } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { api } from '../../lib/api-client';
import { GitBranch, Loader2, Network, Link2 } from 'lucide-react';

interface Correlation {
  campaign_a: string;
  campaign_b: string;
  shared_indicators: string[];
  shared_techniques: string[];
  confidence: number;
  relationship: string;
}
interface CorrelationResponse {
  correlations: Correlation[];
  generated_at: string;
}

const CONFIDENCE_BADGE: Record<string, string> = {
  high: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  medium: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  low: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};

export default function CrossCampaignCorrelation(): JSX.Element {
  const [correlations, setCorrelations] = useState<Correlation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCorrelations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<CorrelationResponse>('/api/v1/threat-intel/cross-campaign/correlations');
      setCorrelations(data.correlations ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<GitBranch size={28} />}
      title="Cross-Campaign Correlation"
      description="Find connections between campaigns: shared infrastructure, tooling, and TTPs."
      headerExtra={
        <button
          onClick={fetchCorrelations}
          disabled={loading}
          className="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 rounded-lg text-sm font-semibold text-white transition-colors flex items-center gap-2"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Network size={14} />}
          {loading ? 'Analyzing…' : 'Run Correlation'}
        </button>
      }
      loading={loading}
      error={error}
      onRetry={fetchCorrelations}
      empty={!loading && !error && correlations.length === 0}
      emptyMessage="Run the correlation to find connections between campaigns."
      emptyIcon={<Network size={28} className="mx-auto text-slate-400" />}
    >
      <div className="space-y-4">
        {correlations.map((c, i) => (
          <div
            key={i}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 shadow-e1 p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono font-medium">{c.campaign_a}</span>
                <Link2 size={14} className="text-slate-400" />
                <span className="text-sm font-mono font-medium">{c.campaign_b}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-micro font-mono text-slate-400">{c.confidence}%</span>
                <span
                  className={`text-micro font-mono px-1.5 py-0.5 rounded ${CONFIDENCE_BADGE[c.confidence >= 70 ? 'high' : c.confidence >= 40 ? 'medium' : 'low']}`}
                >
                  {c.relationship}
                </span>
              </div>
            </div>
            {c.shared_indicators.length > 0 && (
              <div className="mb-2">
                <div className="text-micro font-mono uppercase tracking-wider text-slate-400 mb-1">
                  Shared Indicators
                </div>
                <div className="flex flex-wrap gap-1">
                  {c.shared_indicators.slice(0, 5).map((ind, j) => (
                    <span
                      key={j}
                      className="text-micro font-mono px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-slate-500"
                    >
                      {ind}
                    </span>
                  ))}
                  {c.shared_indicators.length > 5 && (
                    <span className="text-micro text-slate-400">+{c.shared_indicators.length - 5}</span>
                  )}
                </div>
              </div>
            )}
            {c.shared_techniques.length > 0 && (
              <div>
                <div className="text-micro font-mono uppercase tracking-wider text-slate-400 mb-1">
                  Shared Techniques
                </div>
                <div className="flex flex-wrap gap-1">
                  {c.shared_techniques.map((t, j) => (
                    <span
                      key={j}
                      className="text-micro font-mono px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
                    >
                      {t}
                    </span>
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
