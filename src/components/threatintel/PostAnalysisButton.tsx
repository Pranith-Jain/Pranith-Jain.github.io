import { useState, useCallback } from 'react';
import { Brain, RefreshCw, X, Shield, Check, Link2 } from 'lucide-react';

interface PostAnalysis {
  summary: string;
  threat_level: string;
  confidence: string;
  impact: string;
  recommended_actions: string[];
  context: string;
  iocs?: string[];
  ttps?: string[];
  tweet?: string;
}

interface PostAnalysisButtonProps {
  title: string;
  description?: string;
  source?: string;
  link?: string;
  compact?: boolean;
}

const THREAT_COLORS: Record<string, string> = {
  critical: 'text-rose-700 dark:text-rose-400 bg-rose-500/10 border-rose-500/30',
  high: 'text-orange-700 dark:text-orange-400 bg-orange-500/10 border-orange-500/30',
  medium: 'text-amber-700 dark:text-amber-400 bg-amber-500/10 border-amber-500/30',
  low: 'text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  unknown: 'text-slate-600 dark:text-slate-400 bg-slate-500/10 border-slate-500/30',
};

export function PostAnalysisButton({ title, description, source, compact }: PostAnalysisButtonProps) {
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
        className={`inline-flex items-center gap-1 text-micro font-mono rounded border transition-colors ${
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
        <div className="absolute right-0 top-full mt-2 z-50 w-[420px] max-h-[500px] overflow-y-auto rounded-xl border border-brand-500/30 bg-white dark:bg-[rgb(var(--surface-200))] shadow-2xl animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 dark:border-slate-700/50 sticky top-0 bg-white dark:bg-[rgb(var(--surface-200))] z-10">
            <div className="flex items-center gap-2">
              <Brain size={14} className="text-brand-400" />
              <span className="text-xs font-semibold text-slate-900 dark:text-slate-200">AI Analysis</span>
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
                className="p-1 rounded text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X size={12} />
              </button>
            </div>
          </div>

          <div className="p-4 space-y-3">
            {/* Loading */}
            {loading && !analysis && (
              <div className="flex items-center gap-2 justify-center py-6">
                <RefreshCw size={14} className="animate-spin text-brand-400" />
                <span className="text-xs text-slate-500 dark:text-slate-400">Analyzing…</span>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-3 text-center">
                <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
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

                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{analysis.summary}</p>

                {analysis.impact && (
                  <div className="rounded-xl bg-slate-100 dark:bg-[rgb(var(--surface-200))]/50 p-2.5">
                    <span className="text-micro font-mono uppercase text-slate-500 dark:text-slate-500 block mb-0.5">
                      Impact
                    </span>
                    <p className="text-xs text-slate-700 dark:text-slate-400">{analysis.impact}</p>
                  </div>
                )}

                {analysis.context && (
                  <div className="rounded-xl bg-slate-100 dark:bg-[rgb(var(--surface-200))]/50 p-2.5">
                    <span className="text-micro font-mono uppercase text-slate-500 dark:text-slate-500 block mb-0.5">
                      Context
                    </span>
                    <p className="text-xs text-slate-700 dark:text-slate-400">{analysis.context}</p>
                  </div>
                )}

                {analysis.iocs?.length ? (
                  <div>
                    <span className="text-micro font-mono uppercase text-slate-500 block mb-1">IOCs</span>
                    <div className="flex flex-wrap gap-1">
                      {analysis.iocs.map((ioc, i) => (
                        <span
                          key={i}
                          className="text-micro font-mono px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20 break-all"
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
                          className="text-micro font-mono px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20"
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
                        <li key={i} className="flex items-start gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                          <span className="text-brand-400 mt-0.5">•</span>
                          {a}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <AnalysisShareRow analysis={analysis} title={title} />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AnalysisShareRow({ analysis, title }: { analysis: PostAnalysis; title: string }) {
  const [copied, setCopied] = useState(false);
  const pageUrl = typeof window !== 'undefined' ? window.location.href : '';
  const shareText = analysis.tweet || analysis.summary || `Threat analysis: ${title}`;

  const copy = async () => {
    await navigator.clipboard.writeText(shareText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-1.5 pt-2 border-t border-slate-200 dark:border-slate-700/50">
      <span className="text-micro font-mono text-slate-500">Share:</span>
      <a
        href={`https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(pageUrl)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-micro font-mono px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600/50 hover:border-brand-500/50 text-slate-600 dark:text-slate-400 transition-colors"
      >
        <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="currentColor" aria-hidden="true">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
        X
      </a>
      <a
        href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(pageUrl)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-micro font-mono px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600/50 hover:border-brand-500/50 text-slate-600 dark:text-slate-400 transition-colors"
      >
        <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="currentColor" aria-hidden="true">
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
        </svg>
        LinkedIn
      </a>
      <button
        type="button"
        onClick={copy}
        className="inline-flex items-center gap-1 text-micro font-mono px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600/50 hover:border-brand-500/50 text-slate-600 dark:text-slate-400 transition-colors"
      >
        {copied ? <Check size={10} className="text-emerald-500" /> : <Link2 size={10} />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
