import { AlertTriangle, CheckCircle2, CircleDashed, XCircle, type LucideIcon } from 'lucide-react';

/**
 * Shared visual language for platform health status.
 *
 * Two surfaces consume these tokens:
 *   - `/threatintel/feeds/status` — analyst workbench, full admiralty drill-down
 *   - `/status`                    — public, mobile-first landing page
 *
 * Keep this file as the single source of truth so both pages match.
 */
export type Status = 'ok' | 'degraded' | 'down' | 'cold';

export const PILL: Record<Status, { cls: string; label: string; icon: LucideIcon }> = {
  ok: {
    cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    label: 'OK',
    icon: CheckCircle2,
  },
  degraded: {
    cls: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    label: 'DEGRADED',
    icon: AlertTriangle,
  },
  down: {
    cls: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
    label: 'DOWN',
    icon: XCircle,
  },
  cold: {
    cls: 'border-slate-400/40 bg-slate-400/10 text-muted',
    label: 'COLD',
    icon: CircleDashed,
  },
};

/**
 * NATO Admiralty information-credibility label and tone.
 * See api/src/routes/feed-status.ts `infoCredibilityFor` for the source-of-truth mapping.
 */
export const CREDIBILITY: Record<number, { label: string; tone: string }> = {
  1: { label: '1 · Confirmed', tone: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  2: { label: '2 · Probably true', tone: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300' },
  3: { label: '3 · Possibly true', tone: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  4: { label: '4 · Doubtful', tone: 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300' },
  5: { label: '5 · Improbable', tone: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300' },
  6: { label: '6 · Cannot judge', tone: 'border-slate-400/40 bg-slate-400/10 text-muted' },
};

/**
 * Reliability (A–F) tone — fixed property of the source, distinct from
 * the per-data-point credibility. A=reliable, F=unreliable.
 */
export const RELIABILITY_TONE: Record<string, string> = {
  A: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  B: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  C: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  D: 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  E: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  F: 'border-slate-400/40 bg-slate-400/10 text-muted',
};

/**
 * Format an upstream age in seconds as a compact "Xs/Xm/Xh/Xd ago" string.
 */
export function ageString(s?: number): string {
  if (s === undefined) return '—';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
