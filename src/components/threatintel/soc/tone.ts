/**
 * Color tokens for the SOC dashboards. The dashboards are brand-aligned:
 * chrome (icons, h1, h2, panels) uses the canonical brand indigo; data
 * colors come from the severity scale in tailwind.config.js so a critical
 * reading on the SOC page reads the same as a critical reading on any
 * other page (rose-600, rose-500, amber-500, emerald-500, sky-500).
 *
 * Per-page "tactical" hue (ransomware=red, vulns=cyan, iocs=purple) is
 * gone — pages differentiate by their icon, title, and data, not by
 * custom chrome. The live/SOC character still comes from auto-refresh,
 * delta chips, and severity-driven status pills.
 */

/** Page-wide severity tokens — mirror tailwind.config.js `severity`. */
export type SocSeverity = 'critical' | 'high' | 'medium' | 'low' | 'ok' | 'info';

export const SEVERITY_TEXT: Record<SocSeverity, string> = {
  critical: 'text-rose-700 dark:text-rose-300',
  high: 'text-rose-600 dark:text-rose-300',
  medium: 'text-amber-600 dark:text-amber-300',
  low: 'text-emerald-600 dark:text-emerald-300',
  ok: 'text-emerald-600 dark:text-emerald-300',
  info: 'text-sky-600 dark:text-sky-300',
};

export const SEVERITY_PILL: Record<SocSeverity, string> = {
  critical: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  high: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  medium: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  low: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  ok: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  info: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
};

/** Status pill dot — solid severity hue. */
export const SEVERITY_DOT: Record<SocSeverity, string> = {
  critical: 'bg-rose-500',
  high: 'bg-rose-500',
  medium: 'bg-amber-500',
  low: 'bg-emerald-500',
  ok: 'bg-emerald-500',
  info: 'bg-sky-500',
};

/** Chart fill colors — keep the NVD/CVSS severity scale recognizable. */
export const CHART_SEV: Record<string, string> = {
  CRITICAL: '#e11d48', // rose-600
  HIGH: '#f43f5e', // rose-500
  MEDIUM: '#f59e0b', // amber-500
  LOW: '#0ea5e9', // sky-500
  NONE: '#64748b', // slate-500
  UNKNOWN: '#475569', // slate-600
};

/** Bar-chart brand-aligned scale. Top three = primary brand shade,
 *  mid = sky-400, long tail = slate. Use the same gradient for any
 *  ranked list so the SOC charts feel like the rest of the app. */
export const CHART_RANK = ['#2c3ee5', '#435ef1', '#6d8bf7', '#0ea5e9', '#38bdf8', '#7dd3fc', '#94a3b8', '#64748b'];
