import { useMemo } from 'react';
import { X, FileText, BarChart3, Clock, Rss } from 'lucide-react';
import { sanitizeUrl } from '../../lib/sanitize-url';
import { formatRelativeTime } from '../../services/rssService';

interface SummaryEntry {
  title: string;
  link: string;
  source: string;
  pubDate: string;
  section: string;
}

interface FeedSummaryPanelProps {
  entries: SummaryEntry[];
  sectionLabels: Record<string, string>;
  onClose: () => void;
}

/**
 * Client-side feed summary - replaces the old AI "Daily Intelligence Digest".
 * Pure in-browser aggregation of the currently loaded articles (counts by
 * section and source, date range, latest headlines). No network call, no AI,
 * no failure mode: it always renders instantly from whatever feeds returned.
 */
export function FeedSummaryPanel({ entries, sectionLabels, onClose }: FeedSummaryPanelProps) {
  const summary = useMemo(() => {
    const bySection = new Map<string, number>();
    const bySource = new Map<string, number>();
    let newest = Number.NEGATIVE_INFINITY;
    let oldest = Number.POSITIVE_INFINITY;
    for (const e of entries) {
      bySection.set(e.section, (bySection.get(e.section) ?? 0) + 1);
      const host = e.source || 'unknown';
      bySource.set(host, (bySource.get(host) ?? 0) + 1);
      const t = Date.parse(e.pubDate);
      if (Number.isFinite(t)) {
        if (t > newest) newest = t;
        if (t < oldest) oldest = t;
      }
    }
    const sections = [...bySection.entries()].sort((a, b) => b[1] - a[1]);
    const sources = [...bySource.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    const latest = entries
      .filter((e) => Number.isFinite(Date.parse(e.pubDate)))
      .sort((a, b) => Date.parse(b.pubDate) - Date.parse(a.pubDate))
      .slice(0, 6);
    return {
      total: entries.length,
      sections,
      sources,
      latest,
      maxSection: sections.length > 0 ? sections[0]![1] : 1,
      newestLabel: Number.isFinite(newest) ? new Date(newest).toLocaleString() : null,
      oldestLabel: Number.isFinite(oldest) ? new Date(oldest).toLocaleString() : null,
    };
  }, [entries]);

  return (
    <div className="relative rounded-xl border border-brand-200/60 dark:border-brand-400/20 bg-gradient-to-br from-brand-50/40 via-white to-white dark:from-brand-500/[0.04] dark:via-[rgb(var(--surface-200))] dark:to-[rgb(var(--surface-200))] shadow-sm animate-fade-in overflow-hidden before:absolute before:inset-x-0 before:top-0 before:h-[2px] before:bg-gradient-to-r before:from-brand-500 before:via-rose-500 before:to-brand-500">
      <div className="flex items-center justify-between px-4 py-3 border-b border-brand-500/10 hover:bg-brand-50/50 dark:hover:bg-white/5 transition-colors">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-500/15">
            <BarChart3 size={16} className="text-brand-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Feed Summary</h3>
            <p className="text-micro text-slate-500">
              {summary.total} articles · {summary.sections.length} sections · {summary.sources.length}
              {summary.sources.length === 8 ? '+' : ''} sources
            </p>
          </div>
        </div>
        <button
          aria-label="Close"
          onClick={onClose}
          className="p-1.5 rounded-xl text-muted hover:text-slate-200 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      <div className="p-4 space-y-5 max-h-[600px] overflow-y-auto">
        {summary.newestLabel && (
          <div className="flex items-center gap-2 text-micro font-mono text-muted">
            <Clock size={11} />
            <span>
              {summary.oldestLabel} → {summary.newestLabel}
            </span>
          </div>
        )}

        {summary.sections.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-micro font-mono uppercase text-slate-500 flex items-center gap-1">
              <FileText size={10} /> By section
            </span>
            {summary.sections.map(([id, count]) => (
              <div key={id} className="flex items-center gap-2">
                <span className="text-xs text-body w-40 truncate flex-shrink-0">{sectionLabels[id] ?? id}</span>
                <div className="flex-1 h-2 rounded-full bg-slate-200/60 dark:bg-[rgb(var(--surface-300))] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-brand-500/60"
                    style={{ width: `${Math.max(6, Math.round((count / summary.maxSection) * 100))}%` }}
                  />
                </div>
                <span className="text-micro font-mono text-slate-500 w-8 text-right flex-shrink-0">{count}</span>
              </div>
            ))}
          </div>
        )}

        {summary.sources.length > 0 && (
          <div className="space-y-1">
            <span className="text-micro font-mono uppercase text-slate-500 flex items-center gap-1">
              <Rss size={10} /> Top sources
            </span>
            <div className="flex flex-wrap gap-1.5">
              {summary.sources.map(([host, count]) => (
                <span
                  key={host}
                  className="text-micro font-mono px-2 py-0.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] text-body bg-white dark:bg-[rgb(var(--surface-200))]"
                >
                  {host} <span className="text-slate-400">×{count}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {summary.latest.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-micro font-mono uppercase text-slate-500">Latest</span>
            <ul className="space-y-1.5">
              {summary.latest.map((e, i) => (
                <li key={`${e.link}-${i}`} className="flex items-start gap-2">
                  <span className="text-brand-400 mt-0.5">•</span>
                  <div className="min-w-0">
                    <a
                      href={sanitizeUrl(e.link) || undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-body hover:text-brand-500 dark:hover:text-brand-400 leading-snug transition-colors"
                    >
                      {e.title}
                    </a>
                    <span className="text-micro font-mono text-slate-500 ml-1.5">
                      {e.source}
                      {e.pubDate ? ` · ${formatRelativeTime(e.pubDate)}` : ''}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
