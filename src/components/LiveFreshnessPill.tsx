import { Radio } from 'lucide-react';

export type FreshnessTone = 'live' | 'fresh' | 'recent' | 'stale' | 'cold' | 'unknown';

const TONE_CLS: Record<FreshnessTone, string> = {
  live: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  fresh: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  recent: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  stale: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  cold: 'border-slate-400/40 bg-slate-400/10 text-slate-600 dark:text-slate-300',
  unknown: 'border-slate-400/40 bg-slate-400/10 text-slate-500 dark:text-slate-400',
};

const TONE_LABEL: Record<FreshnessTone, string> = {
  live: 'live',
  fresh: 'fresh',
  recent: 'recent',
  stale: 'stale',
  cold: 'cold',
  unknown: 'no data',
};

interface LiveFreshnessPillProps {
  tone: FreshnessTone;
  label?: string;
  /** Optional relative time (e.g. "2 min ago"). Rendered in mono after the tone. */
  ago?: string;
  className?: string;
}

/**
 * Tiny pill for the "data freshness" indicator. Used in the AppHero meta
 * line of live pages (e.g. Live IOCs) so the visitor can see at a glance
 * whether the data on this page is fresh or stale.
 *
 * Replaces ad-hoc colored spans with a single tone → class map so a
 * "live" pill looks the same wherever it appears.
 */
export function LiveFreshnessPill({ tone, label, ago, className = '' }: LiveFreshnessPillProps): JSX.Element {
  const showLiveDot = tone === 'live' || tone === 'fresh';
  return (
    <span
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-micro font-mono uppercase tracking-wider ${TONE_CLS[tone]} ${className}`}
    >
      {showLiveDot ? (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
        </span>
      ) : (
        <Radio className="h-2.5 w-2.5" aria-hidden="true" />
      )}
      <span>{label ?? TONE_LABEL[tone]}</span>
      {ago && <span className="text-slate-500 dark:text-slate-400 normal-case tracking-normal">· {ago}</span>}
    </span>
  );
}
