import { useEffect, useState, useCallback } from 'react';
import { Sparkles, RefreshCw, Loader2 } from 'lucide-react';
import { adminAuthHeaders, readAdminToken } from '../../lib/admin-token';

/**
 * <AiSummaryCard> — AI-generated operational summary for a feed surface.
 *
 * Posts the visible items to /api/v1/ai-summary and renders the
 * analyst-grade summary. Cached per (surface, date) on the server so
 * repeated page loads are instant.
 *
 * Usage:
 *   <AiSummaryCard
 *     surface="CTI Writeups"
 *     items={writeups.map(w => ({ title: w.title, body: w.description ?? '', source: w.source }))}
 *   />
 */

export interface AiSummaryCardProps {
  /** Surface name shown in the card header + sent to the API. */
  surface: string;
  /** Items to summarize. title is required; body and source are optional. */
  items: Array<{ title: string; body?: string; source?: string }>;
  /** Override the day key (default: today's ISO date). */
  dayKey?: string;
  /** Extra CSS classes on the outer wrapper. */
  className?: string;
}

interface SummaryResponse {
  summary: string;
  modelUsed: string;
  itemCount: number;
}

export function AiSummaryCard({ surface, items, dayKey, className }: AiSummaryCardProps): JSX.Element | null {
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  const date = dayKey ?? new Date().toISOString().slice(0, 10);

  // AI summary is an operator-only feature: the endpoint is admin-gated, so a
  // public visitor (no admin token) would only ever get a 401. Gate the UI on
  // the same token so the card stays silent instead of surfacing that 401.
  const isAdmin = readAdminToken() !== null;

  const fetchSummary = useCallback(async () => {
    if (items.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/ai-summary', {
        method: 'POST',
        headers: { ...adminAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({
          surface,
          date,
          items: items.map((it) => ({
            title: it.title,
            body: it.body ?? '',
            source: it.source,
          })),
        }),
      });
      if (!res.ok) {
        if (res.status === 503) {
          setError('AI summary temporarily unavailable.');
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const json = (await res.json()) as SummaryResponse;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load summary.');
    } finally {
      setLoading(false);
    }
  }, [surface, date, items]);

  // Auto-fetch on mount when items are available (admins only).
  useEffect(() => {
    if (isAdmin && items.length > 0 && !data && !loading && !error) {
      fetchSummary();
    }
  }, [isAdmin, items.length, data, loading, error, fetchSummary]);

  // Don't render for non-admins (would only 401) or when there are no items.
  if (!isAdmin || items.length === 0) return null;

  return (
    <div
      className={`rounded-xl border border-brand-200/60 dark:border-brand-800/40 bg-gradient-to-br from-brand-50/80 to-white dark:from-brand-950/20 dark:to-slate-900 overflow-hidden ${className ?? ''}`}
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-brand-100/30 dark:hover:bg-brand-900/10 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-brand-600 dark:text-brand-400" />
          <span className="text-sm font-display font-bold text-slate-900 dark:text-slate-100">
            AI Summary — {surface}
          </span>
          {data && (
            <span className="text-micro font-mono text-slate-500 dark:text-slate-400 ml-1">
              {data.itemCount} items · {data.modelUsed.split(':').pop()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!loading && !data && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                fetchSummary();
              }}
              className="text-mini font-mono text-brand-600 dark:text-brand-400 hover:underline"
            >
              Generate
            </button>
          )}
          <span className="text-micro text-slate-400">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* Body */}
      {expanded && (
        <div className="px-4 pb-4">
          {loading && (
            <div className="flex items-center gap-2 py-4 text-sm text-slate-500 dark:text-slate-400">
              <Loader2 size={14} className="animate-spin" />
              Generating AI summary…
            </div>
          )}

          {error && (
            <div className="flex items-center justify-between py-3">
              <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
              <button
                type="button"
                onClick={fetchSummary}
                className="flex items-center gap-1.5 text-xs font-mono text-brand-600 dark:text-brand-400 hover:underline"
              >
                <RefreshCw size={12} /> Retry
              </button>
            </div>
          )}

          {data && (
            <div className="prose prose-sm dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
              {data.summary.split('\n').map((line, i) => {
                // Bold text rendering
                const parts = line.split(/(\*\*[^*]+\*\*)/g);
                return (
                  <p key={i} className={line.startsWith('- ') || line.startsWith('• ') ? 'ml-4' : ''}>
                    {parts.map((part, j) =>
                      part.startsWith('**') && part.endsWith('**') ? (
                        <strong key={j} className="text-slate-900 dark:text-white">
                          {part.slice(2, -2)}
                        </strong>
                      ) : (
                        <span key={j}>{part}</span>
                      )
                    )}
                  </p>
                );
              })}
            </div>
          )}

          {!loading && !error && !data && (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-2 italic">
              Click "Generate" to create an AI-powered summary of today's {surface.toLowerCase()}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
