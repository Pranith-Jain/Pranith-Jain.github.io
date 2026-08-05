/**
 * DataGapsPanel — renders the agent's tool-failure introspection.
 *
 * Shows which tools failed during the investigation, the diagnosed cause
 * (upstream-error, rate-limit, bad-args, timeout), what intelligence was
 * missed, and a diagnosis note. Rendered when the agent's final state
 * includes a `dataGaps` array.
 */
import { AlertTriangle, Wrench, Clock, Ban, ServerCrash, HelpCircle } from 'lucide-react';

export interface ToolFailure {
  tool: string;
  error: string;
  step: number;
  cause: 'upstream-error' | 'rate-limit' | 'bad-args' | 'timeout' | 'unknown';
  diagnosis: string;
  missedCapability: string;
}

const CAUSE_META: Record<ToolFailure['cause'], { icon: typeof AlertTriangle; color: string; label: string }> = {
  'upstream-error': { icon: ServerCrash, color: 'text-rose-600 dark:text-rose-400', label: 'Upstream Error' },
  'rate-limit': { icon: Clock, color: 'text-amber-600 dark:text-amber-400', label: 'Rate Limited' },
  'bad-args': { icon: Ban, color: 'text-orange-600 dark:text-orange-400', label: 'Bad Arguments' },
  timeout: { icon: Clock, color: 'text-amber-600 dark:text-amber-400', label: 'Timed Out' },
  unknown: { icon: HelpCircle, color: 'text-slate-500', label: 'Unknown' },
};

export function DataGapsPanel({ dataGaps }: { dataGaps: ToolFailure[] }): JSX.Element | null {
  if (!dataGaps || dataGaps.length === 0) return null;

  return (
    <div className="mt-3 rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-900/5 p-4">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
        <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Data Gaps & Limitations</h4>
        <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
          {dataGaps.length} tool{dataGaps.length === 1 ? '' : 's'} failed
        </span>
      </div>

      <div className="space-y-2">
        {dataGaps.map((f, i) => {
          const meta = CAUSE_META[f.cause] ?? CAUSE_META.unknown;
          const Icon = meta.icon;
          return (
            <div
              key={i}
              className="flex items-start gap-2 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-2.5"
            >
              <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${meta.color}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="rounded bg-sky-100 dark:bg-sky-900/30 px-1.5 py-0.5 text-xs font-mono text-sky-700 dark:text-sky-300">
                    <Wrench className="w-2.5 h-2.5 inline mr-0.5" />
                    {f.tool}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">step {f.step}</span>
                  <span className={`text-xs font-mono ${meta.color}`}>{meta.label}</span>
                </div>
                <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  <span className="font-mono text-slate-400">missed:</span> {f.missedCapability}
                </div>
                <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-500 italic">{f.diagnosis}</div>
                {f.error && (
                  <div className="mt-0.5 text-xs font-mono text-rose-500 dark:text-rose-400 truncate">
                    {f.error.slice(0, 120)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        These failures do not invalidate the findings above, but they limit coverage. If a critical question depends on
        a failed tool, retry the investigation or call the tool directly.
      </div>
    </div>
  );
}
