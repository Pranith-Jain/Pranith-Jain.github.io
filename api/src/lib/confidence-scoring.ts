/**
 * Confidence Scoring Framework
 *
 * Admiralty/NATO reliability scale (A1-F6) with source reliability ×
 * information credibility matrix, confidence decay over time, and
 * multi-source corroboration.
 */

export type SourceReliability = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export type InfoCredibility = '1' | '2' | '3' | '4' | '5' | '6';

export interface ConfidenceAssessment {
  source_reliability: SourceReliability;
  info_credibility: InfoCredibility;
  composite_score: number;
  label: string;
  description: string;
}

export interface SourceProfile {
  source_id: string;
  name: string;
  reliability: SourceReliability;
  track_record: number;
  total_reports: number;
  confirmed_reports: number;
  false_positives: number;
  last_reported: string;
}

/** Admiralty reliability matrix — maps source × info to a 0-100 score */
const RELIABILITY_MATRIX: Record<SourceReliability, Record<InfoCredibility, number>> = {
  A: { '1': 100, '2': 90, '3': 75, '4': 60, '5': 40, '6': 20 },
  B: { '1': 90, '2': 80, '3': 65, '4': 50, '5': 30, '6': 15 },
  C: { '1': 75, '2': 65, '3': 50, '4': 40, '5': 20, '6': 10 },
  D: { '1': 60, '2': 50, '3': 40, '4': 30, '5': 15, '6': 5 },
  E: { '1': 40, '2': 30, '3': 20, '4': 15, '5': 5, '6': 2 },
  F: { '1': 20, '2': 15, '3': 10, '4': 5, '5': 2, '6': 1 },
};

const RELIABILITY_LABELS: Record<SourceReliability, string> = {
  A: 'Completely Reliable', B: 'Usually Reliable', C: 'Fairly Reliable',
  D: 'Not Usually Reliable', E: 'Unreliable', F: 'Reliability Cannot Be Judged',
};

const CREDIBILITY_LABELS: Record<InfoCredibility, string> = {
  '1': 'Confirmed', '2': 'Probably True', '3': 'Possibly True',
  '4': 'Doubtful', '5': 'Improbable', '6': 'Truth Cannot Be Judged',
};

/** Calculate confidence from Admiralty scale */
export function calculateConfidence(reliability: SourceReliability, credibility: InfoCredibility): ConfidenceAssessment {
  const score = RELIABILITY_MATRIX[reliability]?.[credibility] ?? 0;
  let label: string;
  if (score >= 80) label = 'High Confidence';
  else if (score >= 60) label = 'Moderate Confidence';
  else if (score >= 40) label = 'Low Confidence';
  else if (score >= 20) label = 'Very Low Confidence';
  else label = 'No Confidence';
  return { source_reliability: reliability, info_credibility: credibility, composite_score: score, label, description: `${RELIABILITY_LABELS[reliability]} / ${CREDIBILITY_LABELS[credibility]}` };
}

/** Multi-source corroboration — combines multiple assessments */
export function combineConfidenceAssessments(assessments: ConfidenceAssessment[]): number {
  if (assessments.length === 0) return 0;
  if (assessments.length === 1) return assessments[0].composite_score;
  const scores = assessments.map((a) => a.composite_score).sort((a, b) => b - a);
  // Weighted combination: best source counts more
  let combined = 0;
  let totalWeight = 0;
  for (let i = 0; i < scores.length; i++) {
    const weight = 1 / (i + 1);
    combined += scores[i] * weight;
    totalWeight += weight;
  }
  return Math.round(combined / totalWeight);
}

/** Confidence decay over time */
export function applyConfidenceDecay(baseConfidence: number, lastSeen: string, decayHalfLifeDays: number): number {
  const ageDays = (Date.now() - new Date(lastSeen).getTime()) / (1000 * 60 * 60 * 24);
  const decayFactor = Math.pow(0.5, ageDays / decayHalfLifeDays);
  return Math.max(0, Math.round(baseConfidence * decayFactor));
}

/** Calculate source track record reliability */
export function calculateSourceReliability(profile: SourceProfile): SourceReliability {
  if (profile.total_reports < 5) return 'F';
  const accuracy = profile.confirmed_reports / profile.total_reports;
  if (accuracy >= 0.95) return 'A';
  if (accuracy >= 0.85) return 'B';
  if (accuracy >= 0.70) return 'C';
  if (accuracy >= 0.50) return 'D';
  return 'E';
}

/** Get all possible reliability values for UI */
export function getReliabilityScale(): Array<{ value: string; label: string; description: string }> {
  return Object.entries(RELIABILITY_LABELS).map(([value, label]) => ({ value, label, description: label }));
}

/** Get all possible credibility values for UI */
export function getCredibilityScale(): Array<{ value: string; label: string; description: string }> {
  return Object.entries(CREDIBILITY_LABELS).map(([value, label]) => ({ value, label, description: label }));
}
