import { ShieldAlert, ShieldCheck } from 'lucide-react';
import type { BlacklistCheck } from '../../lib/dfir/reputation';

interface Props {
  bl: BlacklistCheck;
  compact?: boolean;
  showName?: boolean;
}

export function BlacklistBadge({ bl, compact, showName = true }: Props): JSX.Element {
  const size = compact ? 8 : 12;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border ${bl.listed ? 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300' : 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300'}`}
    >
      {bl.listed ? <ShieldAlert size={size} aria-hidden="true" /> : <ShieldCheck size={size} aria-hidden="true" />}
      {showName ? `${bl.name}: ${bl.listed ? 'listed' : 'clean'}` : bl.listed ? 'listed' : 'clean'}
    </span>
  );
}
