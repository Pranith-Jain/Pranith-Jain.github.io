import type { LabelCategory } from './address-labels';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface RiskInput {
  sanctioned: boolean;
  scamFlagged: boolean;
  labelCategory: LabelCategory | null;
}

export interface RiskScore {
  level: RiskLevel;
  score: number; // 0-100
  signals: string[];
}

function levelFor(score: number): RiskLevel {
  if (score >= 90) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

/** Deterministic, no I/O. Highest contributing signal sets the score. */
export function scoreAddress(input: RiskInput): RiskScore {
  const signals: string[] = [];
  let score = 0;

  if (input.sanctioned) {
    score = Math.max(score, 100);
    signals.push('OFAC-sanctioned address');
  }
  if (input.labelCategory === 'mixer' || input.labelCategory === 'sanctioned') {
    score = Math.max(score, 95);
    signals.push(`Labeled as ${input.labelCategory}`);
  }
  if (input.scamFlagged) {
    score = Math.max(score, 80);
    signals.push('Flagged by ScamSniffer (phishing / drainer)');
  }
  if (input.labelCategory === 'ransomware' || input.labelCategory === 'scammer') {
    score = Math.max(score, 75);
    signals.push(`Labeled as ${input.labelCategory}`);
  }
  if (input.labelCategory === 'exchange' || input.labelCategory === 'bridge' || input.labelCategory === 'defi') {
    signals.push(`Known ${input.labelCategory}`);
  }

  return { level: levelFor(score), score, signals };
}
