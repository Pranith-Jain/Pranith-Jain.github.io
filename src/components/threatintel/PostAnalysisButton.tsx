import { useState, useCallback } from 'react';
import { Brain, RefreshCw, X, Shield, AlertTriangle } from 'lucide-react';

interface PostAnalysis {
  summary: string;
  threat_level: string;
  confidence: string;
  impact: string;
  recommended_actions: string[];
  context: string;
  iocs?: string[];
  ttps?: string[];
}

interface PostAnalysisButtonProps {
  title: string;
  description?: string;
  source?: string;
  link?: string;
  compact?: boolean;
}

const THREAT_COLORS: Record<string, string> = {
  critical: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
  high: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
  medium: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  low: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  unknown: 'text-slate-400 bg-slate-500/10 border-slate-500/30',
};

export function PostAnalysisButton({ title, description, source, link, compact }: PostAnalysisButtonProps) {
  const [open, setOpen] = useState(false);
  const [analysis, setAnalysis] = useState<PostAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);

  const fetchAnalysis = useCallback(async () => {
    if (analysis) {
      setOpen((p) => !p);
      return;
    }
    setLoading(true);
    setError(null);
    setOpen(true);
    try {
      const res = await fetch('/api/v1/threat-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'event',
          title,
          description: description?.slice(0, 1500),
          source,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAnalysis(data.analysis);
      setModel(data.model);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [title, description, source, analysis]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={fetchAnalysis}
        className={`inline-flex items-center gap-1 text-micro font-mono rounded-md border transition-colors ${
          compact ? 'px-1.5 py-0.5' : 'px-2 py-1'
        } ${
          open
            ? 'border-brand-500/40 bg-brand-500/10 text-brand-400'
            : 'border-slate-600/30 text-slate-500 hover:text-brand-400 hover:border-brand-500/30'
        }`}
        title="AI threat analysis"
      >
        <Brain size={compact ? 10 : 12} />
        {!compact && 'Analyze'}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-[420px] max-h-[500px] overflow-y-auto rounded-xl border border-brand-500/30 bg-[rgb(var(--surface-200))] shadow-2xl animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-700/50 sticky top-0 bg-[rgb(var(--surface-200))] z-10">
            <div className="flex items-center gap-2">
              <Brain size={14} className="text-brand-400" />
              <span className="text-xs font-semibold text-slate-200">AI Analysis</span>
              {model && (
                <span className="text-micro font-mono px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-400">
                  {model}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={fetchAnalysis}
                disabled={loading}
                className="p-1 rounded text-slate-400 hover:text-slate-200"
              >
                <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              </button>
              <button onClick={() => setOpen(false)} className="p-1 rounded text-slate-400 hover:text-slate-200">
                <X size={12} />
              </button>
            </div>
          </div>

          <div className="p-4 space-y-3">
            {/* Loading */}
            {loading && !analysis && (
              <div className="flex items-center gap-2 justify-center py-6">
                <RefreshCw size={14} className="animate-spin text-brand-400" />
                <span className="text-xs text-slate-400">Analyzing…</span>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 text-center">
                <p className="text-xs text-rose-400">{error}</p>
              </div>
            )}

            {/* Analysis */}
            {analysis && (
              <>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 text-micro font-mono rounded border ${THREAT_COLORS[analysis.threat_level] || THREAT_COLORS.unknown}`}
                  >
                    <Shield size={10} />
                    {analysis.threat_level?.toUpperCase()}
                  </span>
                  <span className="text-micro font-mono text-slate-500">conf: {analysis.confidence}</span>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">{analysis.summary}</p>

                {analysis.impact && (
                  <div className="rounded-lg bg-slate-800/50 p-2.5">
                    <span className="text-micro font-mono uppercase text-slate-500 block mb-0.5">Impact</span>
                    <p className="text-xs text-slate-400">{analysis.impact}</p>
                  </div>
                )}

                {analysis.context && (
                  <div className="rounded-lg bg-slate-800/50 p-2.5">
                    <span className="text-micro font-mono uppercase text-slate-500 block mb-0.5">Context</span>
                    <p className="text-xs text-slate-400">{analysis.context}</p>
                  </div>
                )}

                {analysis.iocs?.length ? (
                  <div>
                    <span className="text-micro font-mono uppercase text-slate-500 block mb-1">IOCs</span>
                    <div className="flex flex-wrap gap-1">
                      {analysis.iocs.map((ioc, i) => (
                        <span
                          key={i}
                          className="text-micro font-mono px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 break-all"
                        >
                          {ioc}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {analysis.ttps?.length ? (
                  <div>
                    <span className="text-micro font-mono uppercase text-slate-500 block mb-1">MITRE ATT&CK</span>
                    <div className="flex flex-wrap gap-1">
                      {analysis.ttps.map((t, i) => (
                        <span
                          key={i}
                          className="text-micro font-mono px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {analysis.recommended_actions?.length > 0 && (
                  <div>
                    <span className="text-micro font-mono uppercase text-slate-500 block mb-1">Actions</span>
                    <ul className="space-y-0.5">
                      {analysis.recommended_actions.map((a, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs text-slate-400">
                          <span className="text-brand-400 mt-0.5">•</span>
                          {a}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
