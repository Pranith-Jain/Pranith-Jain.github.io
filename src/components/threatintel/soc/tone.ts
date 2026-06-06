/**
 * Tactical "accent" hue for a SOC panel — used to color its KPI value,
 * corner brackets, section header, and chart bars. Each tone is a
 * canonical Tailwind text/bg/ring token plus a CSS drop-shadow glow
 * sized to match the design system.
 */
export type SocTone = 'red' | 'cyan' | 'purple' | 'amber' | 'emerald' | 'blue' | 'rose';

export const TONE_TEXT: Record<SocTone, string> = {
  red: 'text-red-300',
  cyan: 'text-cyan-300',
  purple: 'text-purple-300',
  amber: 'text-amber-300',
  emerald: 'text-emerald-300',
  blue: 'text-sky-300',
  rose: 'text-rose-300',
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

export const TONE_RING: Record<SocTone, string> = {
  red: 'ring-red-500/30',
  cyan: 'ring-cyan-500/30',
  purple: 'ring-purple-500/30',
  amber: 'ring-amber-500/30',
  emerald: 'ring-emerald-500/30',
  blue: 'ring-sky-500/30',
  rose: 'ring-rose-500/30',
};

export const TONE_GLOW: Record<SocTone, string> = {
  red: 'drop-shadow-[0_0_18px_rgba(248,113,113,0.55)]',
  cyan: 'drop-shadow-[0_0_18px_rgba(34,211,238,0.55)]',
  purple: 'drop-shadow-[0_0_18px_rgba(192,132,252,0.55)]',
  amber: 'drop-shadow-[0_0_18px_rgba(251,191,36,0.55)]',
  emerald: 'drop-shadow-[0_0_18px_rgba(52,211,153,0.55)]',
  blue: 'drop-shadow-[0_0_18px_rgba(56,189,248,0.55)]',
  rose: 'drop-shadow-[0_0_18px_rgba(251,113,133,0.55)]',
};
