import { memo } from 'react';
import type { Verdict } from '../../lib/dfir/types';

interface VerdictChipProps {
  verdict: Verdict;
  /** Number of providers that contributed to this verdict (optional). */
  contributing?: number;
  /** Total number of providers checked (optional). */
  total?: number;
  /** Confidence level from composite score (optional). */
  confidence?: 'high' | 'medium' | 'low';
  /** Show compact mode for tables. */
  compact?: boolean;
}

const VERDICT_STYLES: Record<Verdict, string> = {
  clean: 'bg-emerald-500/15 dark:bg-emerald-400/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40',
  suspicious: 'bg-amber-500/15 dark:bg-amber-400/15 text-amber-600 dark:text-amber-400 border-amber-500/40',
  malicious: 'bg-rose-500/15 dark:bg-rose-400/15 text-rose-600 dark:text-rose-400 border-rose-500/40',
  unknown: 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700',
};

const CONFIDENCE_STYLES: Record<string, string> = {
  high: 'text-emerald-600 dark:text-emerald-400',
  medium: 'text-amber-600 dark:text-amber-400',
  low: 'text-slate-500 dark:text-slate-400',
};

const CONFIDENCE_LABELS: Record<string, string> = {
  high: 'HIGH',
  medium: 'MED',
  low: 'LOW',
};

/**
 * Verdict chip with confidence indicators.
 * Shows the verdict (clean/suspicious/malicious/unknown) along with
 * provider consensus and confidence level for analyst decision support.
 *
 * @example
 * <VerdictChip verdict="malicious" contributing={8} total={10} confidence="high" />
 * <VerdictChip verdict="clean" compact />
 */
export const VerdictChip = memo(function VerdictChip({
  verdict,
  contributing,
  total,
  confidence,
  compact = false,
}: VerdictChipProps) {
  // Compact mode: just the verdict label
  if (compact) {
    return (
      <span
        className={`inline-block px-2 py-0.5 text-xs font-mono uppercase tracking-wide rounded border ${VERDICT_STYLES[verdict]}`}
      >
        {verdict}
      </span>
    );
  }

  // Full mode: verdict + confidence + provider count
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`inline-block px-2 py-0.5 text-xs font-mono uppercase tracking-wide rounded border ${VERDICT_STYLES[verdict]}`}
      >
        {verdict}
      </span>
      {confidence && (
        <span className={`text-micro font-mono ${CONFIDENCE_STYLES[confidence]}`} title={`Confidence: ${confidence}`}>
          {CONFIDENCE_LABELS[confidence]}
        </span>
      )}
      {contributing !== undefined && total !== undefined && total > 0 && (
        <span
          className="text-micro font-mono text-slate-500 dark:text-slate-400"
          title={`${contributing} of ${total} providers contributed`}
        >
          {contributing}/{total}
        </span>
      )}
    </span>
  );
});
