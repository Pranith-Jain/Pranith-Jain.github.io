/**
 * Canonical severity tones — used everywhere a CVE / detection / risk pill
 * is rendered. The five-step ramp (rose → orange → amber → slate → sky) maps
 * to threat-meaning, not a colour gradient — `low` is *intentionally* slate
 * (neutral), not green. A low-severity finding is still a finding, and green
 * reads as "safe/done" which conflicts with the severity meaning.
 *
 * Lives outside Badge.tsx so the component file can satisfy the
 * react-refresh/only-export-components rule (Fast Refresh needs files to
 * export components only). Same split pattern as tool-sections.ts.
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export const SEVERITY_TONE: Record<Severity, string> = {
  critical: 'border-rose-500/50 bg-rose-500/15 text-rose-700 dark:text-rose-300',
  high: 'border-orange-500/50 bg-orange-500/15 text-orange-700 dark:text-orange-300',
  medium: 'border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-300',
  low: 'border-slate-400/50 bg-slate-400/10 text-slate-600 dark:text-slate-300',
  info: 'border-sky-500/50 bg-sky-500/15 text-sky-700 dark:text-sky-300',
};

/**
 * Solid bar/dot fill per severity — for progress bars, count strips, and
 * legend dots where the translucent badge tone (SEVERITY_TONE) reads too
 * faint. Same ramp and same `low`=slate rule.
 */
export const SEVERITY_BAR: Record<Severity, string> = {
  critical: 'bg-rose-500',
  high: 'bg-orange-500',
  medium: 'bg-amber-500',
  low: 'bg-slate-400',
  info: 'bg-sky-500',
};
