/**
 * Tactical "accent" hue for a SOC panel — used to color its KPI value,
 * corner brackets, section header, and chart bars. Each tone follows the
 * brand pill convention: `-500/40` border + `-500/10` bg + dark-mode
 * `-300` text on a dark-mode `-900/60` panel. The TONE_TEXT map also
 * drives the corner-bracket border via `replace('text-', 'border-')`,
 * so the dark: variant propagates automatically.
 */
export type SocTone = 'red' | 'cyan' | 'purple' | 'amber' | 'emerald' | 'blue' | 'rose';

/**
 * Text/foreground hue. The light-mode shade is a brand-aligned `-700` so
 * the color is readable on white cards; dark mode uses the pale `-300`
 * shade so the color glows on the slate-900 panel.
 */
export const TONE_TEXT: Record<SocTone, string> = {
  red: 'text-red-700 dark:text-red-300',
  cyan: 'text-cyan-700 dark:text-cyan-300',
  purple: 'text-purple-700 dark:text-purple-300',
  amber: 'text-amber-700 dark:text-amber-300',
  emerald: 'text-emerald-700 dark:text-emerald-300',
  blue: 'text-sky-700 dark:text-sky-300',
  rose: 'text-rose-700 dark:text-rose-300',
};

export const TONE_BG: Record<SocTone, string> = {
  red: 'bg-red-500',
  cyan: 'bg-cyan-500',
  purple: 'bg-purple-500',
  amber: 'bg-amber-500',
  emerald: 'bg-emerald-500',
  blue: 'bg-sky-500',
  rose: 'bg-rose-500',
};

/**
 * Pill background — brand `-500/10` tint in light mode (visible on white
 * cards without screaming) and the tactical `-900/60` panel in dark mode.
 * Status badge, header icon container, and KPI corner accents all reuse this.
 */
export const TONE_PILL_BG: Record<SocTone, string> = {
  red: 'bg-red-500/10 dark:bg-slate-900/60',
  cyan: 'bg-cyan-500/10 dark:bg-slate-900/60',
  purple: 'bg-purple-500/10 dark:bg-slate-900/60',
  amber: 'bg-amber-500/10 dark:bg-slate-900/60',
  emerald: 'bg-emerald-500/10 dark:bg-slate-900/60',
  blue: 'bg-sky-500/10 dark:bg-slate-900/60',
  rose: 'bg-rose-500/10 dark:bg-slate-900/60',
};

export const TONE_RING: Record<SocTone, string> = {
  red: 'border-red-500/30 ring-red-500/30 dark:border-red-400/30',
  cyan: 'border-cyan-500/30 ring-cyan-500/30 dark:border-cyan-400/30',
  purple: 'border-purple-500/30 ring-purple-500/30 dark:border-purple-400/30',
  amber: 'border-amber-500/30 ring-amber-500/30 dark:border-amber-400/30',
  emerald: 'border-emerald-500/30 ring-emerald-500/30 dark:border-emerald-400/30',
  blue: 'border-sky-500/30 ring-sky-500/30 dark:border-sky-400/30',
  rose: 'border-rose-500/30 ring-rose-500/30 dark:border-rose-400/30',
};

/**
 * Drop-shadow glow. In light mode we use the deeper `-600` hue at lower
 * alpha so the halo is visible against a white card without overwhelming
 * the text. In dark mode the brighter `-300` shade glows on the slate panel.
 */
export const TONE_GLOW: Record<SocTone, string> = {
  red: 'drop-shadow-[0_0_14px_rgba(220,38,38,0.35)] dark:drop-shadow-[0_0_18px_rgba(248,113,113,0.55)]',
  cyan: 'drop-shadow-[0_0_14px_rgba(8,145,178,0.35)] dark:drop-shadow-[0_0_18px_rgba(34,211,238,0.55)]',
  purple: 'drop-shadow-[0_0_14px_rgba(147,51,234,0.35)] dark:drop-shadow-[0_0_18px_rgba(192,132,252,0.55)]',
  amber: 'drop-shadow-[0_0_14px_rgba(217,119,6,0.35)] dark:drop-shadow-[0_0_18px_rgba(251,191,36,0.55)]',
  emerald: 'drop-shadow-[0_0_14px_rgba(5,150,105,0.35)] dark:drop-shadow-[0_0_18px_rgba(52,211,153,0.55)]',
  blue: 'drop-shadow-[0_0_14px_rgba(2,132,199,0.35)] dark:drop-shadow-[0_0_18px_rgba(56,189,248,0.55)]',
  rose: 'drop-shadow-[0_0_14px_rgba(225,29,72,0.35)] dark:drop-shadow-[0_0_18px_rgba(251,113,133,0.55)]',
};
