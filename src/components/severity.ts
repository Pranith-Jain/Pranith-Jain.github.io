/**
 * Canonical severity tones — the typed, recipe-backed source of truth.
 *
 * Migrated from hardcoded Tailwind class strings to Panda CSS recipes
 * (src/styled/recipes.ts). The class strings emitted by
 * `severityPill({ tone: 'critical' })` are byte-equivalent to the
 * legacy strings — confirmed by inspecting the generated CSS.
 *
 * The five-step ramp (rose → orange → amber → slate → sky) maps to
 * threat-meaning, not a colour gradient — `low` is *intentionally*
 * slate (neutral), not green. A low-severity finding is still a
 * finding, and green reads as "safe/done" which conflicts with the
 * severity meaning.
 *
 * Lives outside Badge.tsx so the component file can satisfy the
 * react-refresh/only-export-components rule (Fast Refresh needs files
 * to export components only). Same split pattern as tool-sections.ts.
 */
import { severityPill, severityBar } from '../styled/recipes';

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/**
 * Backward-compat: pre-Panda class strings for callers that still
 * interpolate directly into className. New code should use
 * <SeverityPill tone={...}> instead. The strings here are produced
 * by the recipes so any Panda config change propagates automatically.
 */
export const SEVERITY_TONE: Record<Severity, string> = {
  critical: severityPill({ tone: 'critical' }),
  high: severityPill({ tone: 'high' }),
  medium: severityPill({ tone: 'medium' }),
  low: severityPill({ tone: 'low' }),
  info: severityPill({ tone: 'info' }),
};

/**
 * Solid bar/dot fill per severity — for progress bars, count strips,
 * and legend dots where the translucent badge tone (SEVERITY_TONE)
 * reads too faint. Same ramp and same `low`=slate rule.
 */
export const SEVERITY_BAR: Record<Severity, string> = {
  critical: severityBar({ tone: 'critical' }),
  high: severityBar({ tone: 'high' }),
  medium: severityBar({ tone: 'medium' }),
  low: severityBar({ tone: 'low' }),
  info: severityBar({ tone: 'info' }),
};
