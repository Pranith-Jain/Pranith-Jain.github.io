import { useState, useCallback } from 'react';
import { BackLink } from '../../components/BackLink';
import { api } from '../../lib/api-client';
import { ArrowLeft, Target, Loader2, AlertTriangle, ChevronRight, ChevronDown, Zap } from 'lucide-react';

interface Phase {
  name: string;
  status: 'completed' | 'active' | 'upcoming';
  start_date?: string;
  indicators: string[];
  techniques: string[];
}
interface CampaignLifecycle {
  id: string;
  name: string;
  actor: string;
  phases: Phase[];
  current_phase: string;
  predicted_next: string;
  confidence: number;
}

const PHASE_STATUS: Record<string, string> = {
  completed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  active: 'bg-brand-100 text-brand-800 dark:bg-brand-900/30 dark:text-brand-300',
  upcoming: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};

export default function CampaignLifecycle(): JSX.Element {
  const [campaignName, setCampaignName] = useState('');
  const [indicators, setIndicators] = useState('');
  const [loading, setLoading] = useState(false);
  const [lifecycle, setLifecycle] = useState<CampaignLifecycle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedPhase, setExpandedPhase] = useState<string | null>(null);

  const handleAnalyze = useCallback(async () => {
    if (!campaignName.trim()) return;
    setLoading(true);
    setError(null);
    setLifecycle(null);
    try {
      const data = await api.post<CampaignLifecycle>('/api/v1/threat-intel/campaign/analyze', {
        campaign: campaignName.trim(),
        indicators: indicators
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
      });
      setLifecycle(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [campaignName, indicators]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>
      <div className="animate-fade-in-up mb-10">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 flex items-center gap-3">
          <Target size={28} className="text-brand-600 dark:text-brand-400" /> Campaign Lifecycle
        </h1>
        <p className="text-slate-600 dark:text-slate-400 max-w-2xl leading-relaxed">
          Track campaigns from preparation to monetization.
        </p>
      </div>
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-5 mb-6">
        <input
          type="text"
          value={campaignName}
          onChange={(e) => setCampaignName(e.target.value)}
          placeholder="Campaign name…"
          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400 mb-3"
        />
        <textarea
          value={indicators}
          onChange={(e) => setIndicators(e.target.value)}
          placeholder="Related IOCs (optional, one per line)…"
          className="w-full h-20 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-3 text-sm font-mono text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400 resize-y"
        />
        <button
          onClick={handleAnalyze}
          disabled={loading || !campaignName.trim()}
          className="mt-3 w-full px-5 py-2.5 bg-brand-600 hover:bg-brand-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg text-sm font-semibold text-white transition-colors flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Target size={14} />}
          {loading ? 'Analyzing…' : 'Analyze Campaign'}
        </button>
      </div>
      {error && (
        <div className="rounded-xl border border-rose-300/70 dark:border-rose-800/60 bg-rose-50/60 dark:bg-rose-950/30 p-4 mb-6 flex items-center gap-3">
          <AlertTriangle size={16} className="text-rose-600 dark:text-rose-400 flex-shrink-0" />
          <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p>
        </div>
      )}
      {lifecycle && (
        <div className="space-y-5 animate-fade-in-up">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-5">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-display font-bold text-lg">{lifecycle.name}</h2>
              <span className="text-[10px] font-mono text-slate-400">Confidence: {lifecycle.confidence}%</span>
            </div>
            <div className="text-sm text-slate-600 dark:text-slate-400">Actor: {lifecycle.actor}</div>
            <div className="flex items-center gap-2 mt-2 text-xs">
              <span className="font-mono text-brand-600 dark:text-brand-400">Current: {lifecycle.current_phase}</span>
              <ChevronRight size={12} className="text-slate-400" />
              <span className="font-mono text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <Zap size={12} /> Next: {lifecycle.predicted_next}
              </span>
            </div>
          </div>
          <div className="space-y-2">
            {lifecycle.phases.map((phase, i) => {
              const isOpen = expandedPhase === phase.name;
              return (
                <div
                  key={phase.name}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 overflow-hidden"
                >
                  <button
                    onClick={() => setExpandedPhase(isOpen ? null : phase.name)}
                    className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-900/20 transition-colors"
                  >
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white ${phase.status === 'completed' ? 'bg-emerald-500' : phase.status === 'active' ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-700'}`}
                    >
                      {phase.status === 'completed' ? '✓' : i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{phase.name}</div>
                      {phase.start_date && (
                        <div className="text-[10px] font-mono text-slate-400">{phase.start_date}</div>
                      )}
                    </div>
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${PHASE_STATUS[phase.status]}`}>
                      {phase.status}
                    </span>
                    {isOpen ? (
                      <ChevronDown size={14} className="text-slate-400" />
                    ) : (
                      <ChevronRight size={14} className="text-slate-400" />
                    )}
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 pt-0 border-t border-slate-100 dark:border-slate-800">
                      {phase.indicators.length > 0 && (
                        <div className="mt-3 mb-2">
                          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">
                            Indicators
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {phase.indicators.map((ind, j) => (
                              <span
                                key={j}
                                className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-slate-500"
                              >
                                {ind}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {phase.techniques.length > 0 && (
                        <div>
                          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">
                            Techniques
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {phase.techniques.map((t, j) => (
                              <span
                                key={j}
                                className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
