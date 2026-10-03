/**
 * Score banding — one place that decides what a 0-100 number *means*.
 *
 * ## Why this exists
 *
 * The platform scores entities in several independent places: Admiralty
 * confidence (`lib/confidence.ts`), IOC decay scoring (`lib/ioc-scoring.ts`),
 * graph node confidence (`routes/threat-graph.ts`), CVSS, and EPSS. Each grew
 * its own thresholds, so the same 72 reads as "high" on one surface and
 * "moderate" on another. Analysts then cannot calibrate to the colours.
 *
 * This module is the single mapping from score to band, plus adapters for
 * each producer so no call site re-derives a threshold.
 *
 * ## The `unknown` rule
 *
 * `bandScore(null)` is `'unknown'`, never `'low'`. This is the same defect
 * class fixed in `btcAbuseCheck` (a failed lookup returned `count: 0`, which
 * an LLM read as "clean") and in `prose-style` (a structural character was
 * conflated with a stylistic one). A score we could not compute carries no
 * evidence of low risk, and a colour that implies safety is the most
 * expensive kind of wrong answer on a threat surface.
 *
 * Because `unknown` is reachable, callers must handle it. The type system
 * forces that: `band` is a discriminant, so an exhaustive `switch` is the
 * expected rendering and a forgotten `unknown` case is a type error.
 */

export type ScoreBand = 'critical' | 'high' | 'medium' | 'low' | 'informational' | 'unknown';

/**
 * Which direction "high" points.
 *
 * The platform scores two things that are numerically identical and semantically
 * opposite, and conflating them is worse than having no shared module:
 *
 *   - `risk`       — a high number is bad. Threat score, IOC criticality, CVSS.
 *                    92 -> critical, red.
 *   - `confidence` — a high number is reassuring. "We are 95% sure this is
 *                    malicious." 92 -> very high, green.
 *
 * Surveyed before this was split: 4 surfaces colour high scores green and 5
 * colour them red, all with the same `>= 70` / `>= 40` thresholds. A single
 * colour helper would have made half of them wrong.
 */
export type ScorePolarity = 'risk' | 'confidence';

/**
 * Lower bound of each band on a 0-100 scale. Strictly decreasing.
 *
 * Thresholds are inherited from `lib/confidence.ts` so the Admiralty level
 * (`very_high` / `high` / `moderate` / `low` / `very_low`) and the visual band
 * cannot disagree: a `very_high` confidence is always a `critical` band.
 */
export const SCORE_BAND_THRESHOLDS = {
  critical: 85,
  high: 70,
  medium: 40,
  low: 20,
} as const;

/** Human labels. `informational` and `unknown` are not scored, so they have no number. */
export const SCORE_BAND_LABEL: Record<ScoreBand, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  informational: 'Informational',
  unknown: 'Unknown',
};

/** Suggested Tailwind classes per band, for consistent rendering everywhere. */
export const SCORE_BAND_CLASS: Record<ScoreBand, string> = {
  critical: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20',
  high: 'bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/20',
  medium: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20',
  low: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20',
  informational: 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20',
  // Deliberately not a "good" colour. Unknown is not a reassuring state.
  unknown: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30',
};

/**
 * Trust-polarity classes. Same bands, inverted ramp: a high score is
 * reassuring, so it takes the calm colour and a low score takes the alarm
 * colour.
 *
 * `unknown` is identical in both, deliberately. Not knowing is neither good
 * nor bad, and giving it a calm colour would imply absence of risk.
 */
export const CONFIDENCE_CLASS: Record<ScoreBand, string> = {
  critical: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20',
  high: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20',
  medium: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20',
  low: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20',
  informational: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20',
  unknown: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30',
};

/**
 * Labels for the trust axis. Reuses the Admiralty confidence vocabulary that
 * `lib/confidence.ts` already returns, so a band and a `Confidence` level can
 * never disagree about wording.
 */
export const CONFIDENCE_LABEL: Record<ScoreBand, string> = {
  critical: 'Very high confidence',
  high: 'High confidence',
  medium: 'Moderate confidence',
  low: 'Low confidence',
  informational: 'Very low confidence',
  unknown: 'Unassessed',
};

export interface BandedScore {
  /** The input score, or `null` when it could not be computed. */
  score: number | null;
  band: ScoreBand;
  /** Display label, e.g. "Critical". */
  label: string;
  /** Tailwind classes for a badge/pill. */
  className: string;
  /**
   * How much to trust the band itself, independent of what it says.
   *
   * A band computed from a single uncorroborated source is `weak` even when
   * the number is high; the colour is about the finding, this is about the
   * evidence behind it.
   */
  evidence: 'strong' | 'moderate' | 'weak';
  /** Short explanation, safe to render as a tooltip. */
  rationale: string;
}

export interface BandOptions {
  /**
   * Number of independent sources behind the score. Drives `evidence`.
   * Default 1 (unverified).
   */
  sourceCount?: number;
  /** Override the label, e.g. "KEV-listed". The band is unaffected. */
  label?: string;
  /**
   * Which direction a high score points. Default `'risk'`.
   *
   * Affects `className` and, when no explicit `label` is given, `label`
   * wording. Never omit this on a confidence surface: defaulting a confidence
   * score to the risk ramp renders "we are confident" in red.
   */
  polarity?: ScorePolarity;
}

function evidenceFor(sourceCount: number): BandedScore['evidence'] {
  if (sourceCount >= 3) return 'strong';
  if (sourceCount === 2) return 'moderate';
  return 'weak';
}

function bandFromNumber(score: number): Exclude<ScoreBand, 'unknown'> {
  if (score >= SCORE_BAND_THRESHOLDS.critical) return 'critical';
  if (score >= SCORE_BAND_THRESHOLDS.high) return 'high';
  if (score >= SCORE_BAND_THRESHOLDS.medium) return 'medium';
  if (score >= SCORE_BAND_THRESHOLDS.low) return 'low';
  return 'informational';
}

function describe(band: ScoreBand, sourceCount: number): string {
  const evidence = evidenceFor(sourceCount);
  switch (band) {
    case 'critical':
      return `Score at or above ${SCORE_BAND_THRESHOLDS.critical}. Act on this first. Evidence: ${evidence}.`;
    case 'high':
      return `Score at or above ${SCORE_BAND_THRESHOLDS.high}. Investigate promptly. Evidence: ${evidence}.`;
    case 'medium':
      return `Score at or above ${SCORE_BAND_THRESHOLDS.medium}. Worth a scheduled look. Evidence: ${evidence}.`;
    case 'low':
      return `Score at or above ${SCORE_BAND_THRESHOLDS.low}. Contextual only. Evidence: ${evidence}.`;
    case 'informational':
      return `Below ${SCORE_BAND_THRESHOLDS.low}. No action implied by the score alone. Evidence: ${evidence}.`;
    case 'unknown':
      // Never say "no risk". Say the score is missing.
      return 'No score available. This is not a low-risk result: the finding is unassessed.';
  }
}

/**
 * Map a 0-100 score to a band.
 *
 * `null`, `undefined` and `NaN` all yield `'unknown'`. Out-of-range values are
 * clamped rather than rejected, because a producer sending 0-1000 by mistake
 * should still render something rather than throw on a read path.
 */
export function bandScore(score: number | null | undefined, opts: BandOptions = {}): BandedScore {
  const sourceCount = Math.max(0, opts.sourceCount ?? 1);
  const polarity = opts.polarity ?? 'risk';
  const classes = polarity === 'risk' ? SCORE_BAND_CLASS : CONFIDENCE_CLASS;
  const labels = polarity === 'risk' ? SCORE_BAND_LABEL : CONFIDENCE_LABEL;

  if (score === null || score === undefined || Number.isNaN(score)) {
    return {
      score: null,
      band: 'unknown',
      label: opts.label ?? labels.unknown,
      className: classes.unknown,
      evidence: 'weak',
      rationale: describe('unknown', sourceCount),
    };
  }

  const clamped = Math.min(100, Math.max(0, Math.round(score)));
  const band = bandFromNumber(clamped);
  return {
    score: clamped,
    band,
    label: opts.label ?? labels[band],
    className: classes[band],
    evidence: evidenceFor(sourceCount),
    rationale: describe(band, sourceCount),
  };
}

/**
 * Band a score that measures *certainty*, not severity.
 *
 * Same thresholds as {@link bandScore}, inverted colour ramp and confidence
 * wording. Use this for anything phrased as "how sure are we", and
 * {@link bandScore} for anything phrased as "how bad is it".
 */
export function bandConfidence(score: number | null | undefined, opts: BandOptions = {}): BandedScore {
  return bandScore(score, { ...opts, polarity: 'confidence' });
}

/**
 * Band a CVSS base score (0.0-10.0) onto the 0-100 scale, then band it.
 *
 * CVSS v3 severity ratings map onto our bands as: none/low -> low,
 * medium -> medium, high -> high, critical -> critical. Scaling linearly and
 * reusing the thresholds would put a 7.5 AV base score at "high" and a 9.8
 * one at "high" too, collapsing the distinction that matters most. So the
 * CVSS severity labels are used directly.
 */
export function bandCvss(cvss: number | null | undefined, opts: BandOptions = {}): BandedScore {
  if (cvss === null || cvss === undefined || Number.isNaN(cvss)) {
    return bandScore(null, { ...opts, label: opts.label ?? 'CVSS unknown' });
  }
  const v = Math.min(10, Math.max(0, cvss));
  // Thresholds sit at the low edge of each CVSS severity band so a 7.0 is
  // already "high" rather than waiting for 7.1.
  const band: Exclude<ScoreBand, 'unknown'> =
    v >= 9 ? 'critical' : v >= 7 ? 'high' : v >= 4 ? 'medium' : v > 0 ? 'low' : 'informational';
  const sourceCount = Math.max(0, opts.sourceCount ?? 1);
  return {
    score: Math.round(v * 10),
    band,
    label: opts.label ?? SCORE_BAND_LABEL[band],
    className: SCORE_BAND_CLASS[band],
    evidence: evidenceFor(sourceCount),
    rationale: `CVSS ${v.toFixed(1)} base score. ${describe(band, sourceCount)}`,
  };
}

/**
 * Band an EPSS probability (0.0-1.0).
 *
 * EPSS is a probability of exploitation in the next 30 days, not a severity,
 * so the thresholds are shifted down: anything above 10% is already worth
 * acting on, and the top band starts at 50%.
 */
export function bandEpss(epss: number | null | undefined, opts: BandOptions = {}): BandedScore {
  if (epss === null || epss === undefined || Number.isNaN(epss)) {
    return bandScore(null, { ...opts, label: opts.label ?? 'EPSS unknown' });
  }
  const p = Math.min(1, Math.max(0, epss));
  const pct = p * 100;
  const band: Exclude<ScoreBand, 'unknown'> =
    pct >= 50 ? 'critical' : pct >= 25 ? 'high' : pct >= 10 ? 'medium' : pct >= 1 ? 'low' : 'informational';
  const sourceCount = Math.max(0, opts.sourceCount ?? 1);
  return {
    score: Math.round(pct),
    band,
    label: opts.label ?? SCORE_BAND_LABEL[band],
    className: SCORE_BAND_CLASS[band],
    evidence: evidenceFor(sourceCount),
    rationale: `EPSS ${pct.toFixed(1)}% probability of exploitation in the next 30 days. ${describe(band, sourceCount)}`,
  };
}

/** Every band, most severe first. Use for legends and filter chips. */
export const SCORE_BANDS: readonly ScoreBand[] = ['critical', 'high', 'medium', 'low', 'informational', 'unknown'];

/** True when the band implies an analyst should act now. */
export function isActionable(band: ScoreBand): boolean {
  return band === 'critical' || band === 'high';
}
