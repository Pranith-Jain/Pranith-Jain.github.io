import { memo } from 'react';
import { ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
import type { BlacklistCheck } from '../../lib/dfir/reputation';

interface Props {
  bl: BlacklistCheck;
  compact?: boolean;
  showName?: boolean;
}

/**
 * Three-state badge:
 *   - listed   → rose, ShieldAlert      ("the DNSBL says this IP/domain is on its list")
 *   - blocked  → slate, ShieldQuestion  ("the DNSBL refused our query because we used a public DoH resolver — answer is unknown, NOT a positive listing")
 *   - clean    → emerald, ShieldCheck   ("the DNSBL responded with no records")
 */
function BlacklistBadgeInner({ bl, compact, showName = true }: Props): JSX.Element {
  const size = compact ? 8 : 12;
  let tone: string;
  let label: string;
  let Icon: typeof ShieldAlert;
  let title: string | undefined;
  if (bl.blocked) {
    tone = 'border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-400';
    label = 'blocked';
    Icon = ShieldQuestion;
    title =
      bl.detail ??
      'This list blocks queries from public DNS resolvers — we cannot confirm listed status from the browser. See an external multi-RBL service for an authoritative check.';
  } else if (bl.listed) {
    tone = 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300';
    label = 'listed';
    Icon = ShieldAlert;
    title = bl.detail;
  } else {
    tone = 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300';
    label = 'clean';
    Icon = ShieldCheck;
  }
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 text-micro font-mono uppercase tracking-wider px-2 py-0.5 rounded border ${tone}`}
    >
      <Icon size={size} aria-hidden="true" />
      {showName ? `${bl.name}: ${label}` : label}
    </span>
  );
}

export const BlacklistBadge = memo(BlacklistBadgeInner);
