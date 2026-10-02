/**
 * Canonical severity tones - used everywhere a CVE / detection / risk pill
 * is rendered. The five-step ramp (rose → orange → amber → slate → sky) maps
 * to threat-meaning, not a colour gradient - `low` is *intentionally* slate
 * (neutral), not green. A low-severity finding is still a finding, and green
 * reads as "safe/done" which conflicts with the severity meaning.
 *
 * Lives outside Badge.tsx so the component file can satisfy the
 * react-refresh/only-export-components rule (Fast Refresh needs files to
 * export components only). Same split pattern as tool-sections.ts.
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/**
 * The single chokepoint for turning an upstream severity string into a
 * `Severity`. Upstreams disagree on case, spelling, and vocabulary: CVSS uses
 * `CRITICAL`/`None`, CISA KEV uses `Critical`, and some feeds emit Spanish
 * (`crítico`) or synonyms (`important`, `moderate`). Every page that rendered
 * a severity pill used to carry its own local copy of this switch, which is how
 * `CisaKevCatalog` ended up colouring `low` emerald while the rest of the app
 * used slate.
 *
 * Unknown and missing values fall back to `low` — the neutral step. Never
 * `info`: an unrecognised value from a feed is missing data, and rendering it
 * as "informational" would quietly downgrade a real finding to a footnote.
 * Callers that genuinely have no severity should render nothing rather than
 * reach for this function.
 */
export function normalizeSeverity(raw: string | null | undefined): Severity {
  // NFD-normalise before comparing so that "critico" spelled with a combining
  // acute (i + U+0301) matches the precomposed U+00ED spelling. Both forms
  // occur in the wild and `toLowerCase` alone does not reconcile them.
  const key = (raw ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
  switch (key) {
    case 'critical':
    case 'critico':
    case 'critica':
    case 'severo':
    case 'severe':
      return 'critical';
    case 'high':
    case 'alto':
    case 'important':
      return 'high';
    case 'medium':
    case 'moderate':
    case 'medio':
      return 'medium';
    case 'info':
    case 'informational':
    case 'none':
      return 'info';
    case 'low':
    case 'bajo':
      return 'low';
    default:
      return 'low';
  }
}

export const SEVERITY_TONE: Record<Severity, string> = {
  critical: 'border-rose-500/50 bg-rose-500/15 text-rose-700 dark:text-rose-300',
  // Light-mode text steps are -800, not -700: chips render at text-xs bold
  // (12px), so SC 1.4.3 needs the full 4.5:1 and the large-text 3:1
  // allowance does not apply. Measured on the composited 15% tint over white,
  // -700 gave 4.44 (high) / 4.47 (medium) — just under. -800 gives 6.27 /
  // 6.31 while staying inside the same hue family.
  high: 'border-orange-500/50 bg-orange-500/15 text-orange-800 dark:text-orange-300',
  medium: 'border-amber-500/50 bg-amber-500/15 text-amber-800 dark:text-amber-300',
  low: 'border-slate-400/50 bg-slate-400/10 text-body',
  info: 'border-sky-500/50 bg-sky-500/15 text-sky-700 dark:text-sky-300',
};

/**
 * Solid bar/dot fill per severity - for progress bars, count strips, and
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
