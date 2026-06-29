/**
 * SSVC-V (Stakeholder-Specific Vulnerability Categorization — Vulnerability)
 * decision model.
 *
 * Maps the SSVC-V decision tree to compute Act / Prioritise / Track / Watch
 * decisions from CVSS, EPSS, CISA KEV, ransomware use, and exploit status.
 *
 * SSVC-V uses a decision-tree approach with these key dimensions:
 *   - Exploitation: none / poc / active
 *   - Automatable: no / yes
 *   - Exposure: small / controlled / open
 *   - Mission Impact: degraded / crippled / failure
 *   - Mission Wellbeing: degraded / crippled / failure
 *
 * Our implementation maps available data into these dimensions and computes
 * the decision outcome.
 */

export type SsvcDecision = 'act' | 'prioritise' | 'track' | 'watch';
export type SsvcExploitation = 'none' | 'poc' | 'active';
export type SsvcAutomatable = 'no' | 'yes';
export type SsvcExposure = 'small' | 'controlled' | 'open';
export type SsvcImpact = 'degraded' | 'crippled' | 'failure';

export interface SsvcInput {
  /** Is there evidence of active exploitation? */
  exploitation: SsvcExploitation;
  /** Can exploitation be automated (wormable, scriptable)? */
  automatable: SsvcAutomatable;
  /** How exposed is the vulnerable service to attack surface? */
  exposure: SsvcExposure;
  /** Mission impact if exploited (confidentiality/integrity/availability). */
  missionImpact: SsvcImpact;
  /** Mission wellbeing impact (safety, financial, regulatory). */
  missionWellbeing: SsvcImpact;
}

export interface SsvcResult {
  decision: SsvcDecision;
  exploitation: SsvcExploitation;
  automatable: SsvcAutomatable;
  exposure: SsvcExposure;
  missionImpact: SsvcImpact;
  missionWellbeing: SsvcImpact;
  rationale: string;
}

/**
 * Compute SSVC-V decision from available CVE intelligence data.
 * Maps CVSS/EPSS/KEV/ransomware signals into SSVC-V dimensions.
 */
export function computeSsvcV(params: {
  cvssScore: number | null;
  epssScore: number | null;
  cisaKev: boolean;
  ransomwareUse: boolean;
  exploitStatus: 'none' | 'poc' | 'active' | null;
  automatable?: boolean;
  isPublicFacing?: boolean;
  missionImpact?: 'degraded' | 'crippled' | 'failure';
}): SsvcResult {
  // ── Dimension mapping ─────────────────────────────────────────────────

  // Exploitation: map from exploit status, boosted by EPSS
  const epss = params.epssScore ?? 0;
  const exploitation: SsvcExploitation =
    params.exploitStatus === 'active' || params.cisaKev || params.ransomwareUse
      ? 'active'
      : params.exploitStatus === 'poc' || epss >= 0.5
        ? 'poc'
        : 'none';

  // Automatable: CVSS network vector + low attack complexity = automatable.
  // High EPSS (> 0.2) also suggests the vulnerability is easily exploitable.
  const automatable: SsvcAutomatable =
    params.automatable === true ? 'yes' : (params.cvssScore ?? 0) >= 7.0 || epss >= 0.2 ? 'yes' : 'no';

  // Exposure: is the service internet-facing?
  const exposure: SsvcExposure =
    params.isPublicFacing === true
      ? 'open'
      : params.isPublicFacing === false
        ? 'controlled'
        : (params.cvssScore ?? 0) >= 9.0
          ? 'open'
          : 'small';

  // Mission impact: map from CVSS
  const missionImpact: SsvcImpact =
    params.missionImpact ??
    ((params.cvssScore ?? 0) >= 9.0 ? 'failure' : (params.cvssScore ?? 0) >= 7.0 ? 'crippled' : 'degraded');

  // Mission wellbeing: high CVSS + active exploitation = failure
  const missionWellbeing: SsvcImpact =
    exploitation === 'active' && (params.cvssScore ?? 0) >= 7.0
      ? 'failure'
      : exploitation === 'active'
        ? 'crippled'
        : 'degraded';

  // ── Decision tree ─────────────────────────────────────────────────────
  const decision = computeDecision({ exploitation, automatable, exposure, missionImpact, missionWellbeing });

  return {
    decision,
    exploitation,
    automatable,
    exposure,
    missionImpact,
    missionWellbeing,
    rationale: buildRationale(decision, { exploitation, automatable, exposure, missionImpact, missionWellbeing }),
  };
}

/**
 * SSVC-V decision tree (v2).
 *
 * The tree is traversed in this order:
 *   Exploitation → Automatable → Exposure → Mission Impact → Decision
 *
 * Outcomes:
 *   - Act: Exploitation active + any path leads to Action
 *   - Prioritise: Exploitation PoC + medium-high impact
 *   - Track: No known exploitation, low-medium impact
 *   - Watch: Everything else
 */
function computeDecision(input: SsvcInput): SsvcDecision {
  const { exploitation, automatable, exposure, missionImpact, missionWellbeing } = input;

  // ACT: Active exploitation + any automatable path
  if (exploitation === 'active') {
    if (automatable === 'yes') return 'act';
    if (exposure === 'open' || exposure === 'controlled') return 'act';
    if (missionImpact === 'failure' || missionWellbeing === 'failure') return 'act';
    return 'prioritise';
  }

  // PRIORITISE: PoC available + open exposure
  if (exploitation === 'poc') {
    if (exposure === 'open') return 'prioritise';
    if (automatable === 'yes') return 'prioritise';
    if (missionImpact !== 'degraded' || missionWellbeing !== 'degraded') return 'prioritise';
    return 'track';
  }

  // TRACK: No exploitation + open exposure + automatable
  if (exploitation === 'none') {
    if (exposure === 'open' && automatable === 'yes') return 'track';
    if (missionImpact !== 'degraded' || missionWellbeing !== 'degraded') return 'track';
    return 'watch';
  }

  return 'watch';
}

function buildRationale(decision: SsvcDecision, input: SsvcInput): string {
  const parts: string[] = [
    `Exploitation: ${input.exploitation}`,
    `Automatable: ${input.automatable}`,
    `Exposure: ${input.exposure}`,
    `Mission impact: ${input.missionImpact}`,
    `Mission wellbeing: ${input.missionWellbeing}`,
  ];

  const label =
    decision === 'act'
      ? 'Act now — actively exploited vulnerability with high mission impact'
      : decision === 'prioritise'
        ? 'Prioritise within next patch cycle — PoC available or open exposure'
        : decision === 'track'
          ? 'Track for changes — no active exploitation but conditions are favorable'
          : 'Watch — no active exploitation, low mission impact';

  return `${label}. ${parts.join(', ')}.`;
}

/**
 * Shorthand: compute SSVC-V from just CVE-relevant booleans.
 * Useful when you have KEV/ransomware status but not full CVSS.
 */
export function computeSsvcQuick(params: {
  kev: boolean;
  ransomwareUse: boolean;
  epssScore: number | null;
  cvssScore: number | null;
}): SsvcDecision {
  const result = computeSsvcV({
    cvssScore: params.cvssScore,
    epssScore: params.epssScore,
    cisaKev: params.kev,
    ransomwareUse: params.ransomwareUse,
    exploitStatus: params.kev ? 'active' : params.ransomwareUse ? 'active' : null,
    isPublicFacing: (params.cvssScore ?? 0) >= 7.0,
  });
  return result.decision;
}
