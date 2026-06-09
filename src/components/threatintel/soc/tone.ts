/**
 * Color tokens for the SOC dashboards. All chart fills, severity tokens,
 * and per-domain palettes live here — pages never define their own colors.
 *
 * Severity tokens mirror `tailwind.config.js` so a critical finding reads
 * the same on any page (rose → amber → emerald → slate).
 */

export type SocSeverity = 'critical' | 'high' | 'medium' | 'low' | 'ok' | 'info';

/* ─── Tailwind class tokens ───────────────────────────────────────── */

export const SEVERITY_TEXT: Record<SocSeverity, string> = {
  critical: 'text-rose-700 dark:text-rose-300',
  high: 'text-orange-600 dark:text-orange-300',
  medium: 'text-amber-600 dark:text-amber-300',
  low: 'text-emerald-600 dark:text-emerald-300',
  ok: 'text-emerald-600 dark:text-emerald-300',
  info: 'text-sky-600 dark:text-sky-300',
};

export const SEVERITY_PILL: Record<SocSeverity, string> = {
  critical: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  high: 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  medium: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  low: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  ok: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  info: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
};

export const SEVERITY_DOT: Record<SocSeverity, string> = {
  critical: 'bg-rose-500',
  high: 'bg-orange-500',
  medium: 'bg-amber-500',
  low: 'bg-emerald-500',
  ok: 'bg-emerald-500',
  info: 'bg-sky-500',
};

/* ─── Hex fill palettes (chart colours) ───────────────────────────── */

/** Severity → fill hex — mirrors tailwind severity tokens exactly. */
export const CHART_SEV: Record<string, string> = {
  CRITICAL: '#e11d48',
  HIGH: '#f59e0b',
  MEDIUM: '#f59e0b',
  LOW: '#10b981',
  NONE: '#64748b',
  UNKNOWN: '#475569',
};

/** Canonical severity ordering (highest → lowest). */
export const SEV_ORDER: string[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NONE', 'UNKNOWN'];

/**
 * Ranked-list severity gradient. Top-ranked items use severity colours
 * (rose → amber) so the most important threat visually pops; lower
 * ranks fade through sky to slate.
 */
export const CHART_RANK = ['#e11d48', '#f43f5e', '#f59e0b', '#0ea5e9', '#38bdf8', '#7dd3fc', '#94a3b8', '#64748b'];

/** Single-brand fill for time-series / timeline bars (not ranked data). */
export const CHART_DAILY = '#2c3ee5';

/* ─── Domain-specific palettes ────────────────────────────────────── */

/** Ransomware sector → fill hex. Mapped from tailwind severity so a
 *  Healthcare spike reads as critical and Finance as high, etc. */
export const CHART_SECTOR: Record<string, string> = {
  Healthcare: '#e11d48',
  Finance: '#f43f5e',
  Government: '#f43f5e',
  Technology: '#f59e0b',
  Manufacturing: '#f59e0b',
  Education: '#0ea5e9',
  Retail: '#0ea5e9',
  Energy: '#0ea5e9',
  'Professional Services': '#f59e0b',
  Transportation: '#0ea5e9',
  Media: '#94a3b8',
  Unknown: '#64748b',
};

/** IOC kind → fill hex. Brand-first so IP/URL (network-blockable) use
 *  the primary brand hue, Domain uses sky, hash uses slate. */
export const CHART_IOC_KIND: Record<string, string> = {
  ip: '#2c3ee5',
  url: '#435ef1',
  domain: '#0ea5e9',
  hash: '#64748b',
};

/** IOC criticality tier → fill hex. Uses the severity scale. */
export const CHART_CRIT: Record<string, string> = {
  critical: '#e11d48',
  sensitive: '#f59e0b',
  informational: '#0ea5e9',
};
