/**
 * Lightweight client-side NATO Admiralty Code computation for IOCs that
 * come from the live-iocs / correlation feeds (where the API doesn't
 * attach a grade per row).
 *
 * Reliability is set by the source — known curated lists score B, OSINT
 * aggregators C, social/firehose D. Credibility is set by the artifact
 * type — file hashes are most persistent (=2), domains/URLs middle
 * (=3), IPs lowest (=4, because they rotate fast).
 *
 * Source IDs match the live-iocs handler. Unknown sources fall back to
 * D (reasonable upper bound for "unknown reliability").
 */

export type AdmiraltyReliability = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export type AdmiraltyCredibility = 1 | 2 | 3 | 4 | 5 | 6;

export interface AdmiraltyGrade {
  reliability: AdmiraltyReliability;
  credibility: AdmiraltyCredibility;
  label: string;
}

const SOURCE_RELIABILITY: Record<string, AdmiraltyReliability> = {
  // abuse.ch family — curated, vetted, well-maintained
  urlhaus: 'B',
  threatfox: 'B',
  malwarebazaar: 'B',
  sslbl: 'B',
  yaraify: 'B',
  // institutional / curated lists
  'sans-isc': 'B',
  'cisa-kev': 'A',
  spamhaus: 'B',
  // OSINT aggregators / GitHub-maintained
  'c2-intel': 'C',
  otx: 'C',
  shodan: 'C',
  censys: 'C',
  netlas: 'C',
  greynoise: 'C',
  c2tracker: 'B',
  // social / community
  tweetfeed: 'D',
  reddit: 'D',
  // commercial wrappers
  virustotal: 'B',
  abuseipdb: 'B',
  // MyThreatIntel (sourced from many places — average C)
  mti: 'C',
  mythreatintel: 'C',
  // catch-all
  '': 'D',
};

const KIND_CREDIBILITY: Record<string, AdmiraltyCredibility> = {
  hash: 2,
  ipv4: 4,
  ipv6: 4,
  ip: 4,
  domain: 3,
  url: 3,
  email: 3,
};

export function gradeForLiveIoc(source: string, kind: string): AdmiraltyGrade {
  const reliability = SOURCE_RELIABILITY[source.toLowerCase()] ?? 'D';
  const credibility = KIND_CREDIBILITY[kind.toLowerCase()] ?? 4;
  return { reliability, credibility, label: `${reliability}${credibility}` };
}
