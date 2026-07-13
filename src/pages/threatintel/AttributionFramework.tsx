import { useState, useCallback } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { api } from '../../lib/api-client';
import { Scale, Loader2, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';

interface AttributionAssessment {
  actor: string;
  confidence: number;
  level: string;
  evidence: Array<{ type: string; description: string; weight: number; source: string }>;
  methodology: string;
  caveats: string[];
}

const LEVEL_BADGE: Record<string, string> = {
  'almost-certain': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  probable: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  'reasonably-likely': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  possible: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  doubtful: 'bg-slate-100 text-slate-600 dark:bg-[rgb(var(--surface-300))] dark:text-slate-400',
  improbable: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300',
};

export default function AttributionFramework(): JSX.Element {
  const [indicators, setIndicators] = useState('');
  const [context, setContext] = useState('');
  const [loading, setLoading] = useState(false);
  const [assessment, setAssessment] = useState<AttributionAssessment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedEvidence, setExpandedEvidence] = useState(false);

  const handleAssess = useCallback(async () => {
    if (!indicators.trim()) return;
    setLoading(true);
    setError(null);
    setAssessment(null);
    try {
      const data = await api.post<AttributionAssessment>('/api/v1/threat-intel/predictive/attribution', {
        indicators: indicators
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        context: context.trim() || undefined,
      });
      setAssessment(data);
    } catch (err) {
      console.error('AttributionFramework failed:', err instanceof Error ? err.message : String(err));
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [indicators, context]);

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Scale size={28} />}
      title="Attribution Framework"
      description="Multi-signal attribution with confidence scoring."
    >
      <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/40 shadow-e1 p-5 mb-6">
        <h2 className="font-display font-bold text-sm mb-3">Indicators & Evidence</h2>
        <textarea
          value={indicators}
          onChange={(e) => setIndicators(e.target.value)}
          placeholder="Enter IOCs, one per line…"
          className="w-full h-28 bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-xl p-3 text-sm font-mono text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400 resize-y"
        />
        <div className="mt-3">
          <label htmlFor="attribution-context" className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">
            Context (optional)
          </label>
          <input
            id="attribution-context"
            type="text"
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="e.g., targeting financial sector"
            className="w-full bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
          />
        </div>
        <button
          onClick={() => void handleAssess()}
          disabled={loading || !indicators.trim()}
          className="mt-3 w-full px-5 py-2.5 bg-brand-600 hover:bg-brand-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed rounded-xl text-sm font-semibold text-white transition-colors flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Scale size={14} />}
          {loading ? 'Analyzing…' : 'Assess Attribution'}
        </button>
      </div>
      {error && (
        <div className="rounded-xl border border-rose-300/70 dark:border-rose-800/60 bg-rose-50/60 dark:bg-rose-950/30 p-4 mb-6 flex items-center gap-3">
          <AlertTriangle size={16} className="text-rose-600 dark:text-rose-400 flex-shrink-0" />
          <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p>
        </div>
      )}
      {assessment && (
        <div className="space-y-5 animate-fade-in-up">
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/40 shadow-e1 p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="font-display font-bold text-lg">{assessment.actor}</h2>
                <span className={`text-micro font-mono px-1.5 py-0.5 rounded ${LEVEL_BADGE[assessment.level] ?? ''}`}>
                  {assessment.level}
                </span>
              </div>
              <div className="text-right">
                <div className="text-3xl font-display font-bold text-brand-600 dark:text-brand-400">
                  {assessment.confidence}%
                </div>
                <div className="text-micro font-mono text-slate-400">confidence</div>
              </div>
            </div>
            <div className="w-full bg-slate-200 dark:bg-[rgb(var(--surface-300))] rounded-full h-2">
              <div className="bg-brand-500 h-2 rounded-full" style={{ width: `${assessment.confidence}%` }} />
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/40 shadow-e1 overflow-hidden">
            <button
              onClick={() => setExpandedEvidence(!expandedEvidence)}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-200)/0.2)] transition-colors"
            >
              <span className="font-display font-bold text-sm">Evidence ({assessment.evidence.length})</span>
              {expandedEvidence ? (
                <ChevronDown size={14} className="text-slate-400" />
              ) : (
                <ChevronRight size={14} className="text-slate-400" />
              )}
            </button>
            {expandedEvidence && (
              <div className="px-4 pb-4 space-y-2 border-t border-slate-100 dark:border-[rgb(var(--border-400))]">
                {assessment.evidence.map((e, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 py-2 border-b border-slate-100 dark:border-[rgb(var(--border-400))]/50 last:border-0"
                  >
                    <span className="text-micro font-mono px-1.5 py-0.5 rounded bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 shrink-0">
                      {e.type}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-slate-700 dark:text-slate-300">{e.description}</div>
                      <div className="text-micro font-mono text-slate-400 mt-0.5">
                        Weight: {e.weight} · Source: {e.source}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {assessment.methodology && (
            <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/40 shadow-e1 p-5">
              <h3 className="font-display font-bold text-sm mb-2">Methodology</h3>
              <p className="text-xs text-muted leading-relaxed">{assessment.methodology}</p>
            </div>
          )}
          {assessment.caveats.length > 0 && (
            <div className="rounded-xl border border-amber-300/50 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/20 p-5">
              <h3 className="font-display font-bold text-sm mb-2 flex items-center gap-2 text-amber-700 dark:text-amber-300">
                <AlertTriangle size={14} /> Caveats
              </h3>
              <ul className="space-y-1">
                {assessment.caveats.map((c, i) => (
                  <li key={i} className="text-xs text-amber-600 dark:text-amber-400">
                    • {c}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </DataPageLayout>
  );
}
