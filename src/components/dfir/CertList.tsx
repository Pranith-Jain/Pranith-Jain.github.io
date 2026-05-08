import { useState } from 'react';
import type { DomainLookupResponse } from '../../lib/dfir/types';

type ViewMode = 'list' | 'timeline';

export function CertList({ certs }: { certs: DomainLookupResponse['certificates'] }): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  const sortedByDate = [...certs].sort((a, b) => new Date(a.not_before).getTime() - new Date(b.not_before).getTime());
  const visible = expanded ? certs : certs.slice(0, 10);
  const visibleTimeline = expanded ? sortedByDate : sortedByDate.slice(0, 10);

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="font-display font-bold text-lg">
          Certificate Transparency{' '}
          <span className="text-sm font-mono text-slate-600 dark:text-slate-400">({certs.length} entries)</span>
        </h3>
        <div className="flex gap-1" role="group" aria-label="View mode">
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1 text-xs font-mono rounded-full border transition-colors ${
              viewMode === 'list'
                ? 'bg-brand-600 dark:bg-brand-500 text-white border-brand-600 dark:border-brand-500'
                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-brand-500/40'
            }`}
            aria-pressed={viewMode === 'list'}
          >
            List
          </button>
          <button
            onClick={() => setViewMode('timeline')}
            className={`px-3 py-1 text-xs font-mono rounded-full border transition-colors ${
              viewMode === 'timeline'
                ? 'bg-brand-600 dark:bg-brand-500 text-white border-brand-600 dark:border-brand-500'
                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-brand-500/40'
            }`}
            aria-pressed={viewMode === 'timeline'}
          >
            Timeline
          </button>
        </div>
      </div>

      {viewMode === 'timeline' ? (
        <ol className="relative ml-4 border-l-2 border-slate-200 dark:border-slate-800">
          {visibleTimeline.map((c) => (
            <li key={c.id} className="mb-4 ml-4">
              <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-brand-500" aria-hidden="true" />
              <time className="text-xs font-mono text-slate-500">
                {c.not_before.slice(0, 10)} → {c.not_after.slice(0, 10)}
              </time>
              <p className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100">{c.issuer}</p>
              {c.subjects.length > 0 && (
                <p className="text-xs font-mono text-slate-600 dark:text-slate-400 mt-0.5">
                  {c.subjects.slice(0, 2).join(' · ')}
                </p>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <div className="space-y-2">
          {visible.map((c) => (
            <div key={c.id} className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-display font-semibold text-slate-900 dark:text-slate-100">{c.issuer}</span>
                <span className="font-mono text-xs text-slate-600 dark:text-slate-400">
                  {c.not_before.slice(0, 10)} → {c.not_after.slice(0, 10)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {c.subjects.slice(0, 4).map((s) => (
                  <span
                    key={s}
                    className="text-xs font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 break-all"
                  >
                    {s}
                  </span>
                ))}
                {c.subjects.length > 4 && (
                  <span className="text-xs font-mono text-slate-500">+{c.subjects.length - 4} more</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {certs.length > 10 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 text-xs font-mono text-brand-600 dark:text-brand-400 hover:underline"
        >
          {expanded ? 'show less' : `show all ${certs.length}`}
        </button>
      )}
    </section>
  );
}
