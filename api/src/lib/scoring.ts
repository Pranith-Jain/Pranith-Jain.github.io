import type { ProviderId, ProviderResult, Verdict } from '../providers/types';
import type { IndicatorType } from './indicator';

/** Per-indicator-type provider weights. Higher = more trusted for this type. */
const WEIGHTS: Record<IndicatorType, Partial<Record<ProviderId, number>>> = {
  ipv4: {
    abuseipdb: 4,
    shodan: 2,
    virustotal: 1,
    otx: 1,
    spamhaus: 4,
    threatfox: 4,
    urlhaus: 3,
    tor: 1,
    openphish: 1,
    cinsarmy: 3,
    bitwire: 3,
    blocklistde: 2,
    binarydefense: 3,
    ipsum: 4,
    malwareworld: 3,
    tweetfeed: 2,
    // GreyNoise community: low score-weight because the classification is
    // best-effort and ratelimited. The real value is the RIOT signal
    // ('benign service') which the UI surfaces as a separate tag.
    greynoise: 2,
  },
  ipv6: {
    abuseipdb: 4,
    shodan: 2,
    virustotal: 1,
    otx: 1,
    threatfox: 4,
    greynoise: 2,
  },
  domain: {
    virustotal: 2,
    urlscan: 2,
    otx: 2,
    shodan: 1,
    threatfox: 3,
    urlhaus: 3,
    openphish: 3,
    doh: 1,
    phishingArmy: 4,
    malwareworld: 3,
    tweetfeed: 2,
  },
  url: {
    virustotal: 2,
    urlscan: 3,
    otx: 2,
    threatfox: 4,
    urlhaus: 4,
    openphish: 4,
    phishingArmy: 3,
    tweetfeed: 2,
  },
  hash: {
    virustotal: 4,
    hybridanalysis: 3,
    otx: 1,
    threatfox: 4,
    malwarebazaar: 4,
    hashlookup: 3,
    tweetfeed: 2,
  },
  email: { otx: 1, virustotal: 1 },
  unknown: {},
};

export interface CompositeScore {
  score: number;
  verdict: Verdict;
  confidence: 'low' | 'medium' | 'high';
  contributing: number;
}

/**
 * Composite verdict from multiple-provider IOC lookups.
 *
 * The old algorithm was a pure weighted average — that breaks for security
 * IOCs because a "clean" verdict from a blocklist just means "not on our
 * list", not "definitely innocent". With 15+ providers, even 3 high-
 * confidence malicious flags get diluted to "clean" by the 12 zero-scores.
 *
 * The new algorithm is malicious-biased:
 *
 *   1. Count high-weight providers that flagged malicious (weight≥2, score≥70).
 *      Two or more independent strong-malicious hits → composite is at least 75.
 *      A single strong-malicious hit → composite is at least 50.
 *   2. After the bias, take the max of (biased floor, weighted average).
 *   3. Verdict thresholds unchanged: ≥70 malicious, ≥40 suspicious, else clean.
 *
 * Example (user's report): spamhaus 90 + bitwire 80 + otx 80 with 13 zeros →
 *   weightedAvg ≈ 17, but two strong hits ⇒ score floor 75 → verdict malicious.
 */
export function compositeScore(type: IndicatorType, results: ProviderResult[]): CompositeScore {
  const weights = WEIGHTS[type] ?? {};
  const ok = results.filter((r) => r.status === 'ok');
  if (ok.length === 0) {
    return { score: 0, verdict: 'unknown', confidence: 'low', contributing: 0 };
  }

  let weightedSum = 0;
  let totalWeight = 0;
  for (const r of ok) {
    const w = weights[r.source] ?? 1;
    weightedSum += r.score * w;
    totalWeight += w;
  }
  const weightedAvg = totalWeight > 0 ? weightedSum / totalWeight : 0;

  // Count strong-malicious flags (purposeful blocklists / abuse-feeds that
  // identified the indicator — weight ≥2 and score ≥70). Each is independent
  // evidence of badness; multiple agree → strong consensus.
  const strongMalicious = ok.filter((r) => (weights[r.source] ?? 1) >= 2 && r.score >= 70).length;
  // Softer signal: any non-trivial flag from a weighted provider.
  const anySuspicious = ok.some((r) => (weights[r.source] ?? 1) >= 2 && r.score >= 40);

  let score: number;
  if (strongMalicious >= 2) {
    score = Math.max(75, Math.round(weightedAvg));
  } else if (strongMalicious >= 1) {
    score = Math.max(50, Math.round(weightedAvg));
  } else if (anySuspicious) {
    score = Math.max(40, Math.round(weightedAvg));
  } else {
    score = Math.round(weightedAvg);
  }

  let verdict: Verdict;
  if (score >= 70) verdict = 'malicious';
  else if (score >= 40) verdict = 'suspicious';
  else verdict = 'clean';

  const confidence: CompositeScore['confidence'] = ok.length >= 5 ? 'high' : ok.length >= 3 ? 'medium' : 'low';

  return { score, verdict, confidence, contributing: ok.length };
}
