import type { Verdict } from '../../lib/dfir/types';

const STYLES: Record<Verdict, string> = {
  clean: 'bg-emerald-500/15 dark:bg-emerald-400/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40',
  suspicious: 'bg-amber-500/15 dark:bg-amber-400/15 text-amber-600 dark:text-amber-400 border-amber-500/40',
  malicious: 'bg-rose-500/15 dark:bg-rose-400/15 text-rose-600 dark:text-rose-400 border-rose-500/40',
  unknown: 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700',
};

export function VerdictChip({ verdict }: { verdict: Verdict }): JSX.Element {
  return (
    <span
      className={`inline-block px-2 py-0.5 text-xs font-mono uppercase tracking-wide rounded border ${STYLES[verdict]}`}
    >
      {verdict}
    </span>
  );
}
