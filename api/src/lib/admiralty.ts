import type { ProviderId } from '../providers/types';
import type { IndicatorType } from './indicator';

/**
 * NATO Admiralty Code — reliability × credibility grading for intelligence.
 *
 * Reliability (A–F): how trustworthy the source is.
 *   A = Completely reliable   B = Usually reliable    C = Fairly reliable
 *   D = Not usually reliable  E = Unreliable           F = Cannot be judged
 *
 * Credibility (1–6): how likely the information is true.
 *   1 = Confirmed by other sources   2 = Probably true   3 = Possibly true
 *   4 = Doubtful                     5 = Improbable      6 = Cannot be judged
 */

export type Reliability = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export type Credibility = 1 | 2 | 3 | 4 | 5 | 6;

export interface AdmiraltyGrade {
  reliability: Reliability;
  credibility: Credibility;
  label: string;
}

/** Source-type reliability ceiling — the most authoritative source sets the cap. */
const SOURCE_RELIABILITY: Partial<Record<ProviderId, Reliability>> = {
  virustotal: 'B',
  abuseipdb: 'B',
  shodan: 'C',
  censys: 'C',
  netlas: 'C',
  otx: 'C',
  urlscan: 'C',
  hybridanalysis: 'B',
  spamhaus: 'B',
  threatfox: 'B',
  urlhaus: 'B',
  malwarebazaar: 'B',
  hashlookup: 'B',
  greynoise: 'C',
  c2tracker: 'B',
  sslbl: 'B',
  yaraify: 'C',
  malpedia: 'B',
};

/** Indicator-type baseline credibility — more persistent artifacts score higher. */
const TYPE_CREDIBILITY: Partial<Record<IndicatorType, Credibility>> = {
  hash: 2,
  ipv4: 4,
  ipv6: 4,
  domain: 3,
  url: 3,
  email: 3,
};

const RELIABILITY_ORDER: Record<Reliability, number> = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6 };

/**
 * Compute the Admiralty Code for an IOC given its type and the set of
 * providers that returned a result. The displayed grade is the minimum
 * (worst) of the reliability ceiling and credibility baseline — this is
 * the Hokage-Intel approach where an IP from MITRE shows as D4 rather
 * than A1, because IPs rotate fast (credibility cap D).
 */
export function admiraltyGrade(type: IndicatorType, sources: ProviderId[]): AdmiraltyGrade {
  if (sources.length === 0) {
    return { reliability: 'F', credibility: 6, label: 'F6' };
  }

  let reliability: Reliability = 'F';
  for (const s of sources) {
    const r = SOURCE_RELIABILITY[s];
    if (r && RELIABILITY_ORDER[r] < RELIABILITY_ORDER[reliability]) {
      reliability = r;
    }
  }

  const credibility = TYPE_CREDIBILITY[type] ?? 4;
  const label = `${reliability}${credibility}`;

  return { reliability, credibility, label };
}

/**
 * Human-readable description of what the grade means.
 */
export function admiraltyDescription(grade: AdmiraltyGrade): string {
  const relMap: Record<Reliability, string> = {
    A: 'Completely reliable source',
    B: 'Usually reliable source',
    C: 'Fairly reliable source',
    D: 'Not usually reliable source',
    E: 'Unreliable source',
    F: 'Cannot be judged',
  };
  const credMap: Record<Credibility, string> = {
    1: 'Confirmed by other sources',
    2: 'Probably true',
    3: 'Possibly true',
    4: 'Doubtful',
    5: 'Improbable',
    6: 'Cannot be judged',
  };
  return `${relMap[grade.reliability]} · ${credMap[grade.credibility]}`;
}
