import type { Verdict } from '../../lib/dfir/types';

const STYLES: Record<Verdict, string> = {
  clean: 'bg-[#10b981]/15 text-[#10b981] border-[#10b981]/40',
  suspicious: 'bg-[#f59e0b]/15 text-[#f59e0b] border-[#f59e0b]/40',
  malicious: 'bg-[#ef4444]/15 text-[#ef4444] border-[#ef4444]/40',
  unknown: 'bg-[#71717a]/15 text-[#a1a1aa] border-[#71717a]/40',
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
