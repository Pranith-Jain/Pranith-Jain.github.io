import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { rssFeeds } from '../../data/rssFeeds';
import type { AggregatedFeedSourceStatus } from '../../services/rssService';

export interface ToggleSection {
  id: string;
  label: string;
  feedIds: string[];
}

interface SourceTogglePanelProps {
  sections: ToggleSection[];
  allFeedIds: string[];
  disabled: Set<string>;
  onToggle: (id: string) => void;
  onEnableAll: () => void;
  onDisableAll: () => void;
  feedStatuses: AggregatedFeedSourceStatus[];
}

/**
 * Shared per-feed toggle panel — used by pages that aggregate RSS feeds
 * (ThreatFeeds, TechAiNews, ScamWatch, etc.). Renders a section-grouped
 * grid of checkboxes with the live ok/error status reported by the
 * aggregator next to each name, so the user can both pick which feeds
 * to query AND see why the missing ones aren't returning data.
 */
export function SourceTogglePanel({
  sections,
  allFeedIds,
  disabled,
  onToggle,
  onEnableAll,
  onDisableAll,
  feedStatuses,
}: SourceTogglePanelProps): JSX.Element {
  const statusByUrl = new Map<string, AggregatedFeedSourceStatus>();
  for (const s of feedStatuses) statusByUrl.set(s.url, s);

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 space-y-3 max-h-[420px] overflow-y-auto">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-mono text-slate-500">
          Toggle individual feeds. Disabling a feed both hides it AND skips the upstream fetch. Persisted in
          localStorage.
        </p>
        <div className="flex gap-1 shrink-0">
          <button
            type="button"
            onClick={onEnableAll}
            className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 hover:border-brand-500/40"
          >
            enable all ({allFeedIds.length})
          </button>
          <button
            type="button"
            onClick={onDisableAll}
            className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 hover:border-rose-500/40"
          >
            disable all
          </button>
        </div>
      </div>
      {sections.map((sec) => (
        <div key={sec.id}>
          <h3 className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-1.5">
            {sec.label}
            <span className="ml-1.5 opacity-60">
              · {sec.feedIds.filter((id) => !disabled.has(id)).length}/{sec.feedIds.length} on
            </span>
          </h3>
          <div className="grid sm:grid-cols-2 gap-1">
            {sec.feedIds.map((fid) => {
              const meta = rssFeeds.find((r) => r.id === fid);
              const status = meta?.url ? statusByUrl.get(meta.url) : undefined;
              const isEnabled = !disabled.has(fid);
              return (
                <button
                  key={fid}
                  type="button"
                  onClick={() => onToggle(fid)}
                  className={`flex items-center gap-2 rounded px-2 py-1 text-left border transition-colors ${
                    isEnabled
                      ? 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-brand-500/40'
                      : 'border-slate-200/40 dark:border-slate-800/40 bg-slate-100/40 dark:bg-slate-950/40 opacity-60'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isEnabled}
                    onChange={() => {
                      /* button handles click */
                    }}
                    className="rounded border-slate-400 shrink-0"
                    tabIndex={-1}
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block font-mono text-[11px] text-slate-700 dark:text-slate-300 truncate">
                      {meta?.name ?? fid}
                    </span>
                    {isEnabled && status && (
                      <span
                        className={`block text-[9px] font-mono truncate ${
                          status.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                        }`}
                        title={status.error}
                      >
                        {status.ok ? (
                          <>
                            <CheckCircle2 size={8} className="inline" /> {status.items} items
                          </>
                        ) : (
                          <>
                            <AlertTriangle size={8} className="inline" /> {status.error ?? 'failed'}
                          </>
                        )}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
