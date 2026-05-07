import type { ProviderId, ProviderResult, Verdict } from '../providers/types';
import type { IndicatorType } from './indicator';

/** Per-indicator-type provider weights. Higher = more trusted for this type. */
const WEIGHTS: Record<IndicatorType, Partial<Record<ProviderId, number>>> = {
  ipv4: { abuseipdb: 4, greynoise: 2, shodan: 2, virustotal: 1, otx: 1, pulsedive: 1 },
  ipv6: { abuseipdb: 4, greynoise: 2, shodan: 2, virustotal: 1, otx: 1, pulsedive: 1 },
  domain: { virustotal: 2, urlscan: 2, otx: 2, pulsedive: 2, shodan: 1 },
  url: { virustotal: 2, urlscan: 3, otx: 2, pulsedive: 1 },
  hash: { virustotal: 4, hybridanalysis: 3, otx: 1, pulsedive: 1 },
  email: { otx: 1, virustotal: 1 },
  unknown: {},
};

export interface CompositeScore {
  score: number;
  verdict: Verdict;
  confidence: 'low' | 'medium' | 'high';
  contributing: number;
}

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
  const score = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

  let verdict: Verdict;
  if (score >= 70) verdict = 'malicious';
  else if (score >= 40) verdict = 'suspicious';
  else verdict = 'clean';

  const confidence: CompositeScore['confidence'] = ok.length >= 5 ? 'high' : ok.length >= 3 ? 'medium' : 'low';

  return { score, verdict, confidence, contributing: ok.length };
}
