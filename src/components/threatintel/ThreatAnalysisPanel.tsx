import { useState, useCallback } from 'react';
import { Brain, Shield, AlertTriangle, RefreshCw, X, ChevronDown, ChevronUp } from 'lucide-react';

interface EventAnalysis {
  summary: string;
  threat_level: string;
  confidence: string;
  impact: string;
  recommended_actions: string[];
  related_ttps: string[];
  context: string;
}

interface CountryAnalysis {
  country: string;
  overall_threat_level: string;
  executive_summary: string;
  cyber_threats: string;
  geopolitical_risks: string;
  key_actors: string[];
  active_conflicts: string[];
  recommended_posture: string;
  trend: string;
}

interface IndicatorAnalysis {
  indicator: string;
  type: string;
  assessment: string;
  risk_level: string;
  confidence: string;
  possibleAttribution: string | null;
  recommendedActions: string[];
}

type AnalysisResult = EventAnalysis | CountryAnalysis | IndicatorAnalysis;

interface ThreatAnalysisPanelProps {
  type: 'event' | 'country' | 'indicator';
  title: string;
  description?: string;
  country?: string;
  indicator?: string;
  severity?: string;
  kind?: string;
  source?: string;
  events?: Array<{ title: string; kind: string; severity: string; source: string; country?: string }>;
  onClose: () => void;
}

const THREAT_COLORS: Record<string, string> = {
  critical: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
  high: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
  medium: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  low: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  unknown: 'text-slate-400 bg-slate-500/10 border-slate-500/30',
};

const TREND_ICONS: Record<string, string> = {
  improving: '↓',
  stable: '→',
  deteriorating: '↑',
};

export function ThreatAnalysisPanel({
  type,
  title,
  description,
  country,
  indicator,
  severity,
  kind,
  source,
  events,
  onClose,
}: ThreatAnalysisPanelProps) {
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [model, setModel] = useState<string | null>(null);

  const fetchAnalysis = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/threat-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          title,
          description,
          country,
          indicator,
          severity,
          kind,
          source,
          events,
        }),
      });
      if (res.status === 429) {
        setError('Rate limited — try again in a moment');
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAnalysis(data.analysis);
      setModel(data.model);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [type, title, description, country, indicator, severity, kind, source, events]);

  // Auto-fetch on mount
  useState(() => {
    fetchAnalysis();
  });

  const isEvent = type === 'event' && analysis && 'summary' in analysis;
  const isCountry = type === 'country' && analysis && 'executive_summary' in analysis;
  const isIndicator = type === 'indicator' && analysis && 'assessment' in analysis;

  return (
    <div className="rounded-xl border border-brand-500/30 bg-brand-500/5 animate-fade-in overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-brand-500/10">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/15">
            <Brain size={16} className="text-brand-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">AI Threat Analysis</h3>
              {model && (
                <span className="text-micro font-mono px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-400">
                  {model}
                </span>
              )}
            </div>
            <p className="text-micro text-slate-500 mt-0.5">{title}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => fetchAnalysis()}
            disabled={loading}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))] transition-colors"
            title="Re-analyze"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            type="button"
            onClick={() => setExpanded((p) => !p)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))] transition-colors"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))] transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Content */}
      {expanded && (
        <div className="p-4 space-y-4">
          {/* Loading */}
          {loading && !analysis && (
            <div className="flex items-center gap-3 py-6 justify-center">
              <RefreshCw size={16} className="animate-spin text-brand-400" />
              <span className="text-sm text-slate-400">Analyzing threat intelligence…</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 text-center">
              <p className="text-xs text-rose-400">{error}</p>
              <button
                type="button"
                onClick={fetchAnalysis}
                className="mt-2 text-xs font-mono text-brand-400 hover:underline"
              >
                Retry
              </button>
            </div>
          )}

          {/* Event Analysis */}
          {isEvent && <EventAnalysisContent analysis={analysis as EventAnalysis} />}

          {/* Country Analysis */}
          {isCountry && <CountryAnalysisContent analysis={analysis as CountryAnalysis} />}

          {/* Indicator Analysis */}
          {isIndicator && <IndicatorAnalysisContent analysis={analysis as IndicatorAnalysis} />}
        </div>
      )}
    </div>
  );
}

function EventAnalysisContent({ analysis }: { analysis: EventAnalysis }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono rounded-lg border ${THREAT_COLORS[analysis.threat_level] || THREAT_COLORS.unknown}`}
        >
          <Shield size={12} />
          {analysis.threat_level?.toUpperCase()}
        </span>
        <span className="text-micro font-mono text-slate-500">confidence: {analysis.confidence}</span>
      </div>

      <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{analysis.summary}</p>

      {analysis.impact && (
        <div className="rounded-lg bg-slate-100 dark:bg-[rgb(var(--surface-300)/0.5)] p-3">
          <span className="text-micro font-mono uppercase text-slate-500 block mb-1">Impact</span>
          <p className="text-xs text-slate-600 dark:text-slate-400">{analysis.impact}</p>
        </div>
      )}

      {analysis.context && (
        <div className="rounded-lg bg-slate-100 dark:bg-[rgb(var(--surface-300)/0.5)] p-3">
          <span className="text-micro font-mono uppercase text-slate-500 block mb-1">Context</span>
          <p className="text-xs text-slate-600 dark:text-slate-400">{analysis.context}</p>
        </div>
      )}

      {analysis.recommended_actions?.length > 0 && (
        <div>
          <span className="text-micro font-mono uppercase text-slate-500 block mb-1.5">Recommended Actions</span>
          <ul className="space-y-1">
            {analysis.recommended_actions.map((action, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
                <span className="text-brand-400 mt-0.5">•</span>
                {action}
              </li>
            ))}
          </ul>
        </div>
      )}

      {analysis.related_ttps?.filter(Boolean).length > 0 && (
        <div>
          <span className="text-micro font-mono uppercase text-slate-500 block mb-1.5">MITRE ATT&CK</span>
          <div className="flex flex-wrap gap-1.5">
            {analysis.related_ttps.filter(Boolean).map((ttp, i) => (
              <span
                key={i}
                className="text-micro font-mono px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20"
              >
                {ttp}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CountryAnalysisContent({ analysis }: { analysis: CountryAnalysis }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono rounded-lg border ${THREAT_COLORS[analysis.overall_threat_level] || THREAT_COLORS.unknown}`}
        >
          <AlertTriangle size={12} />
          {analysis.overall_threat_level?.toUpperCase()}
        </span>
        <span className="text-micro font-mono text-slate-500">
          trend: {TREND_ICONS[analysis.trend] || '→'} {analysis.trend}
        </span>
      </div>

      <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{analysis.executive_summary}</p>

      {analysis.cyber_threats && (
        <div className="rounded-lg bg-rose-500/5 border border-rose-500/10 p-3">
          <span className="text-micro font-mono uppercase text-rose-400 block mb-1">Cyber Threats</span>
          <p className="text-xs text-slate-600 dark:text-slate-400">{analysis.cyber_threats}</p>
        </div>
      )}

      {analysis.geopolitical_risks && (
        <div className="rounded-lg bg-amber-500/5 border border-amber-500/10 p-3">
          <span className="text-micro font-mono uppercase text-amber-400 block mb-1">Geopolitical Risks</span>
          <p className="text-xs text-slate-600 dark:text-slate-400">{analysis.geopolitical_risks}</p>
        </div>
      )}

      {analysis.active_conflicts?.length > 0 && (
        <div>
          <span className="text-micro font-mono uppercase text-slate-500 block mb-1.5">Active Conflicts</span>
          <div className="flex flex-wrap gap-1.5">
            {analysis.active_conflicts.map((c, i) => (
              <span
                key={i}
                className="text-micro font-mono px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20"
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      )}

      {analysis.key_actors?.length > 0 && (
        <div>
          <span className="text-micro font-mono uppercase text-slate-500 block mb-1.5">Key Actors</span>
          <div className="flex flex-wrap gap-1.5">
            {analysis.key_actors.map((a, i) => (
              <span
                key={i}
                className="text-micro font-mono px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20"
              >
                {a}
              </span>
            ))}
          </div>
        </div>
      )}

      {analysis.recommended_posture && (
        <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/10 p-3">
          <span className="text-micro font-mono uppercase text-emerald-400 block mb-1">Recommended Posture</span>
          <p className="text-xs text-slate-600 dark:text-slate-400">{analysis.recommended_posture}</p>
        </div>
      )}
    </div>
  );
}

function IndicatorAnalysisContent({ analysis }: { analysis: IndicatorAnalysis }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono rounded-lg border ${THREAT_COLORS[analysis.risk_level] || THREAT_COLORS.unknown}`}
        >
          <Shield size={12} />
          {analysis.risk_level?.toUpperCase()}
        </span>
        <span className="text-micro font-mono px-1.5 py-0.5 rounded bg-slate-500/10 text-slate-400">
          {analysis.type}
        </span>
        <span className="text-micro font-mono text-slate-500">confidence: {analysis.confidence}</span>
      </div>

      <div className="rounded-lg bg-slate-100 dark:bg-[rgb(var(--surface-300)/0.5)] p-3 font-mono text-xs text-slate-300 break-all">
        {analysis.indicator}
      </div>

      <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{analysis.assessment}</p>

      {analysis.possibleAttribution && (
        <div className="rounded-lg bg-purple-500/5 border border-purple-500/10 p-3">
          <span className="text-micro font-mono uppercase text-purple-400 block mb-1">Possible Attribution</span>
          <p className="text-xs text-slate-600 dark:text-slate-400">{analysis.possibleAttribution}</p>
        </div>
      )}

      {analysis.recommendedActions?.length > 0 && (
        <div>
          <span className="text-micro font-mono uppercase text-slate-500 block mb-1.5">Recommended Actions</span>
          <ul className="space-y-1">
            {analysis.recommendedActions.map((action, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
                <span className="text-brand-400 mt-0.5">•</span>
                {action}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
