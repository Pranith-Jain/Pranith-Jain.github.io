import { useState, useCallback, useEffect } from 'react';
import { Brain, Shield, AlertTriangle, RefreshCw, X, ChevronDown, ChevronUp } from 'lucide-react';
import { ShareBar } from '../intel/ShareBar';

interface EventAnalysis {
  summary: string;
  threat_level: string;
  confidence: string;
  impact: string;
  recommended_actions: string[];
  related_ttps: string[];
  context: string;
  /** Set when the model failed to emit structured JSON (parse_failed). */
  _raw?: string;
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
  unknown: 'text-muted bg-slate-500/10 border-slate-500/30',
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
        // 35s — the server walks the whole provider chain + Workers-AI
        // fallback; a hung provider must not pin the panel forever.
        signal: AbortSignal.timeout(35_000),
      });
      if (res.status === 429) {
        setError('Rate limited - try again in a moment');
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data?.parse_failed && data?.analysis?.raw) {
        // Model didn't return structured JSON — show the raw text rather
        // than an empty card (the old silent-failure mode).
        setAnalysis({
          summary: '',
          threat_level: '',
          confidence: '',
          impact: '',
          recommended_actions: [],
          related_ttps: [],
          context: '',
          _raw: String(data.analysis.raw),
        } as EventAnalysis);
      } else {
        setAnalysis(data.analysis);
      }
      setModel(data.model);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        setError('Timed out waiting for the model — retry in a moment');
        return;
      }
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [type, title, description, country, indicator, severity, kind, source, events]);

  // Auto-fetch on mount. (The old `useState(() => { fetchAnalysis(); })`
  // ran a side effect INSIDE the render-phase initializer — illegal React —
  // and double-fired under StrictMode, hitting the LLM twice per open.)
  useEffect(() => {
    fetchAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isEvent = type === 'event' && analysis && 'summary' in analysis;
  const isCountry = type === 'country' && analysis && 'executive_summary' in analysis;
  const isIndicator = type === 'indicator' && analysis && 'assessment' in analysis;

  return (
    <div className="relative surface-card animate-fade-in overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[rgb(var(--border-400))] hover:bg-slate-50 dark:hover:bg-[rgb(var(--hover-100))] transition-colors">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/10 dark:bg-brand-400/15">
            <Brain size={16} className="text-brand-600 dark:text-brand-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">AI Threat Analysis</h3>
              {model && (
                <span className="text-micro font-mono px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-600 dark:text-brand-400">
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
            className="p-1.5 rounded text-muted hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))] transition-colors"
            title="Re-analyze"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            type="button"
            onClick={() => setExpanded((p) => !p)}
            className="p-1.5 rounded text-muted hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))] transition-colors"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button
            aria-label="Close"
            type="button"
            onClick={onClose}
            className="p-1.5 rounded text-muted hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))] transition-colors"
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
              <span className="text-sm text-muted">Analyzing threat intelligence…</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-3 text-center">
              <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
              <button
                type="button"
                onClick={fetchAnalysis}
                className="mt-2 text-xs font-mono text-brand-600 dark:text-brand-400 hover:underline transition-colors"
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

          {/* Share row */}
          {analysis && <PanelShareRow analysis={analysis} title={title} />}
        </div>
      )}
    </div>
  );
}

function EventAnalysisContent({ analysis }: { analysis: EventAnalysis }) {
  if (analysis._raw) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3">
          <p className="text-xs text-amber-600 dark:text-amber-400 mb-1.5">
            The model returned unstructured text — raw output shown below:
          </p>
          <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap font-mono">
            {analysis._raw}
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono rounded-xl border ${THREAT_COLORS[analysis.threat_level] || THREAT_COLORS.unknown}`}
        >
          <Shield size={12} />
          {analysis.threat_level?.toUpperCase()}
        </span>
        <span className="text-micro font-mono text-slate-500">confidence: {analysis.confidence}</span>
      </div>

      <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{analysis.summary}</p>

      {analysis.impact && (
        <div className="rounded-xl bg-slate-100 dark:bg-[rgb(var(--surface-300)/0.5)] p-3">
          <span className="text-micro font-mono uppercase text-slate-500 block mb-1">Impact</span>
          <p className="text-xs text-muted">{analysis.impact}</p>
        </div>
      )}

      {analysis.context && (
        <div className="rounded-xl bg-slate-100 dark:bg-[rgb(var(--surface-300)/0.5)] p-3">
          <span className="text-micro font-mono uppercase text-slate-500 block mb-1">Context</span>
          <p className="text-xs text-muted">{analysis.context}</p>
        </div>
      )}

      {analysis.recommended_actions?.length > 0 && (
        <div>
          <span className="text-micro font-mono uppercase text-slate-500 block mb-1.5">Recommended Actions</span>
          <ul className="space-y-1">
            {analysis.recommended_actions.map((action, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-muted">
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
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono rounded-xl border ${THREAT_COLORS[analysis.overall_threat_level] || THREAT_COLORS.unknown}`}
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
        <div className="rounded-xl bg-rose-500/5 border border-rose-500/10 p-3">
          <span className="text-micro font-mono uppercase text-rose-400 block mb-1">Cyber Threats</span>
          <p className="text-xs text-muted">{analysis.cyber_threats}</p>
        </div>
      )}

      {analysis.geopolitical_risks && (
        <div className="rounded-xl bg-amber-500/5 border border-amber-500/10 p-3">
          <span className="text-micro font-mono uppercase text-amber-400 block mb-1">Geopolitical Risks</span>
          <p className="text-xs text-muted">{analysis.geopolitical_risks}</p>
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
        <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/10 p-3">
          <span className="text-micro font-mono uppercase text-emerald-400 block mb-1">Recommended Posture</span>
          <p className="text-xs text-muted">{analysis.recommended_posture}</p>
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
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono rounded-xl border ${THREAT_COLORS[analysis.risk_level] || THREAT_COLORS.unknown}`}
        >
          <Shield size={12} />
          {analysis.risk_level?.toUpperCase()}
        </span>
        <span className="text-micro font-mono px-1.5 py-0.5 rounded bg-slate-500/10 text-muted">{analysis.type}</span>
        <span className="text-micro font-mono text-slate-500">confidence: {analysis.confidence}</span>
      </div>

      <div className="rounded-xl bg-slate-100 dark:bg-[rgb(var(--surface-300)/0.5)] p-3 font-mono text-xs text-slate-300 break-all">
        {analysis.indicator}
      </div>

      <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{analysis.assessment}</p>

      {analysis.possibleAttribution && (
        <div className="rounded-xl bg-purple-500/5 border border-purple-500/10 p-3">
          <span className="text-micro font-mono uppercase text-purple-400 block mb-1">Possible Attribution</span>
          <p className="text-xs text-muted">{analysis.possibleAttribution}</p>
        </div>
      )}

      {analysis.recommendedActions?.length > 0 && (
        <div>
          <span className="text-micro font-mono uppercase text-slate-500 block mb-1.5">Recommended Actions</span>
          <ul className="space-y-1">
            {analysis.recommendedActions.map((action, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-muted">
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

function PanelShareRow({ analysis, title }: { analysis: AnalysisResult; title: string }) {
  const pageUrl = typeof window !== 'undefined' ? window.location.href : '';
  const tweet = (analysis as unknown as Record<string, unknown>).tweet as string | undefined;
  const summary =
    'summary' in analysis
      ? analysis.summary
      : 'executive_summary' in analysis
        ? analysis.executive_summary
        : 'assessment' in analysis
          ? analysis.assessment
          : title;
  const shareText = tweet || summary || `AI threat analysis: ${title}`;
  return (
    <div className="pt-3 border-t border-brand-500/10">
      <ShareBar shareText={shareText} url={pageUrl} size="sm" label="Share:" />
    </div>
  );
}
