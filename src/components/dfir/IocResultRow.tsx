import { VerdictChip } from './VerdictChip';
import type { ProviderResultWire } from '../../lib/dfir/types';

export function IocResultRow({ r }: { r: ProviderResultWire }): JSX.Element {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="font-display font-semibold text-slate-900 dark:text-slate-100 capitalize">{r.source}</span>
        <VerdictChip verdict={r.verdict} />
      </div>
      <div className="flex items-center gap-4 text-sm font-mono text-slate-600 dark:text-slate-400">
        <span>
          score: <span className="text-slate-900 dark:text-slate-100">{r.score}</span>
        </span>
        {r.cached && <span className="text-brand-600 dark:text-brand-400">cached</span>}
        {r.status === 'error' && <span className="text-rose-600 dark:text-rose-400">err: {r.error}</span>}
        {r.status === 'unsupported' && <span className="text-slate-500">n/a for this type</span>}
      </div>
      {r.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {r.tags.slice(0, 6).map((t) => (
            <span
              key={t}
              className="text-xs font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800"
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
