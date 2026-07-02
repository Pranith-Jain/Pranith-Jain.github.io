import { memo } from 'react';

/**
 * NATO Admiralty Code badge — displays reliability × credibility grade
 * for an IOC based on source type and indicator type.
 */

interface AdmiraltyGrade {
  reliability: string;
  credibility: number;
  label: string;
}

const RELIABILITY_COLORS: Record<string, string> = {
  A: 'text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950',
  B: 'text-teal-600 dark:text-teal-400 border-teal-300 dark:border-teal-700 bg-teal-50 dark:bg-teal-950',
  C: 'text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950',
  D: 'text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950',
  E: 'text-rose-600 dark:text-rose-400 border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-950',
  F: 'text-slate-500 dark:text-slate-400 border-slate-300 dark:border-[rgb(var(--border-400))] bg-slate-100 dark:bg-[rgb(var(--surface-200))]',
};

function AdmiraltyBadgeInner({ admiralty, compact }: { admiralty: AdmiraltyGrade; compact?: boolean }): JSX.Element {
  const colors = RELIABILITY_COLORS[admiralty.reliability] ?? RELIABILITY_COLORS['F'];

  return (
    <span
      className={`inline-flex items-center gap-1 font-mono rounded border px-1.5 py-0.5 ${colors} ${
        compact ? 'text-micro' : 'text-mini'
      }`}
      title={`NATO Admiralty Code: ${admiralty.reliability}${admiralty.credibility} — Reliability ${admiralty.reliability}, Credibility ${admiralty.credibility}`}
    >
      <span className="font-bold">{admiralty.reliability}</span>
      <span className="opacity-70">{admiralty.credibility}</span>
    </span>
  );
}

export const AdmiraltyBadge = memo(AdmiraltyBadgeInner);
