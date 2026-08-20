import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Brain, RefreshCw, X, Shield } from 'lucide-react';
import { ShareBar } from '../intel/ShareBar';

interface PostAnalysis {
  summary: string;
  threat_level: string;
  confidence: string;
  impact: string;
  recommended_actions: string[];
  context: string;
  /** The /api/v1/threat-analysis EVENT schema returns related_ttps (not ttps). */
  related_ttps?: string[];
  iocs?: string[];
  tweet?: string;
  raw?: string;
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
        signal: AbortSignal.timeout(35_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const parsed = data.analysis as PostAnalysis;
      if (data?.parse_failed) {
        // Unstructured model output — surface the raw text instead of an
        // empty card.
        setAnalysis({ ...parsed, raw: String(parsed?.raw ?? '') });
      } else {
        setAnalysis(parsed);
      }
      setModel(data.model);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [title, description, source, analysis]);

  const cardRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [btnPos, setBtnPos] = useState<{ top: number; left: number; right: boolean } | null>(null);

  // Compute button position for portal placement
  useEffect(() => {
    if (!open || !btnRef.current) {
      setBtnPos(null);
      return;
    }
    const btn = btnRef.current;
    const rect = btn.getBoundingClientRect();
    // Determine if card should open left or right of button
    const openLeft = rect.right + 420 > window.innerWidth - 16;
    setBtnPos({ top: rect.bottom + 8, left: openLeft ? rect.left - 420 : rect.left, right: !openLeft });
  }, [open, analysis]);

  // Reposition on scroll / resize
  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      if (!btnRef.current) return;
      const rect = btnRef.current.getBoundingClientRect();
      const openLeft = rect.right + 420 > window.innerWidth - 16;
      setBtnPos({ top: rect.bottom + 8, left: openLeft ? rect.left - 420 : rect.left, right: !openLeft });
    };
    window.addEventListener('scroll', reposition, { passive: true });
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition);
      window.removeEventListener('resize', reposition);
    };
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        cardRef.current &&
        !cardRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={btnRef}
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

      {open &&
        btnPos &&
        createPortal(
          <div
            ref={cardRef}
            style={{
              position: 'fixed',
              top: `${btnPos.top}px`,
              ...(btnPos.right ? { left: `${btnPos.left}px` } : { right: '16px' }),
            }}
            className="z-[9999] w-[calc(100vw-2rem)] sm:w-[420px] max-h-[70vh] sm:max-h-[500px] overflow-y-auto rounded-xl border border-brand-500/30 bg-white dark:bg-[rgb(var(--surface-200))] shadow-2xl animate-fade-in"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 dark:border-[rgb(var(--border-400))]/50 sticky top-0 bg-white dark:bg-[rgb(var(--surface-200))] z-10">
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
                  aria-label="Refresh"
                  onClick={fetchAnalysis}
                  disabled={loading}
                  className="p-1 rounded text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
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
                  {analysis.raw ? (
                    <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3">
                      <p className="text-xs text-amber-600 dark:text-amber-400 mb-1.5">
                        The model returned unstructured text — raw output shown below:
                      </p>
                      <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap font-mono">
                        {analysis.raw}
                      </p>
                    </div>
                  ) : (
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

                      {analysis.related_ttps?.filter(Boolean).length ? (
                        <div>
                          <span className="text-micro font-mono uppercase text-slate-500 block mb-1">MITRE ATT&CK</span>
                          <div className="flex flex-wrap gap-1">
                            {analysis.related_ttps.filter(Boolean).map((t, i) => (
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
                              <li
                                key={i}
                                className="flex items-start gap-1.5 text-xs text-slate-600 dark:text-slate-400"
                              >
                                <span className="text-brand-400 mt-0.5">•</span>
                                {a}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  )}

                  <AnalysisShareRow analysis={analysis} title={title} />
                </>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

function AnalysisShareRow({ analysis, title }: { analysis: PostAnalysis; title: string }) {
  const pageUrl = typeof window !== 'undefined' ? window.location.href : '';
  const shareText = analysis.tweet || analysis.summary || `Threat analysis: ${title}`;
  return (
    <div className="pt-2 border-t border-slate-200 dark:border-[rgb(var(--border-400))]/50">
      <ShareBar shareText={shareText} url={pageUrl} size="sm" label="Share:" />
    </div>
  );
}
