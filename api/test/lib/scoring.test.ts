import { describe, it, expect } from 'vitest';
import { compositeScore } from '../../src/lib/scoring';
import type { ProviderResult, ProviderId } from '../../src/providers/types';

const ok = (source: ProviderId, score: number): ProviderResult => ({
  source,
  status: 'ok',
  score,
  verdict: score >= 70 ? 'malicious' : score >= 40 ? 'suspicious' : 'clean',
  raw_summary: {},
  tags: [],
  fetched_at: new Date().toISOString(),
  cached: false,
});

describe('compositeScore', () => {
  it('returns 0 for empty results', () => {
    const { score, verdict, confidence } = compositeScore('ipv4', []);
    expect(score).toBe(0);
    expect(verdict).toBe('unknown');
    expect(confidence).toBe('low');
  });

  it('weights IP-focused providers higher for IP indicators', () => {
    // For an IP, AbuseIPDB and GreyNoise weigh more than VirusTotal/OTX
    const heavy = compositeScore('ipv4', [ok('abuseipdb', 90), ok('greynoise', 80)]);
    const light = compositeScore('ipv4', [ok('virustotal', 90), ok('otx', 80)]);
    expect(heavy.score).toBeGreaterThan(light.score);
  });

  it('weights hash-focused providers higher for hash indicators', () => {
    const heavy = compositeScore('hash', [ok('virustotal', 90), ok('hybridanalysis', 80)]);
    const light = compositeScore('hash', [ok('otx', 90), ok('pulsedive', 80)]);
    expect(heavy.score).toBeGreaterThan(light.score);
  });

  it('high confidence with 5+ providers, medium with 3-4, low with 1-2', () => {
    const high = compositeScore('ipv4', [
      ok('virustotal', 30),
      ok('abuseipdb', 30),
      ok('shodan', 30),
      ok('greynoise', 30),
      ok('otx', 30),
    ]);
    const med = compositeScore('ipv4', [ok('virustotal', 30), ok('abuseipdb', 30), ok('shodan', 30)]);
    const low = compositeScore('ipv4', [ok('virustotal', 30)]);
    expect(high.confidence).toBe('high');
    expect(med.confidence).toBe('medium');
    expect(low.confidence).toBe('low');
  });

  it('verdict thresholds: <40 clean, 40-69 suspicious, >=70 malicious', () => {
    expect(compositeScore('ipv4', [ok('abuseipdb', 30)]).verdict).toBe('clean');
    expect(compositeScore('ipv4', [ok('abuseipdb', 50)]).verdict).toBe('suspicious');
    expect(compositeScore('ipv4', [ok('abuseipdb', 80)]).verdict).toBe('malicious');
  });

  it('contributing count reflects only ok-status results', () => {
    const errResult: ProviderResult = {
      source: 'shodan',
      status: 'error',
      score: 0,
      verdict: 'unknown',
      raw_summary: {},
      tags: [],
      error: '401',
      fetched_at: new Date().toISOString(),
      cached: false,
    };
    const r = compositeScore('ipv4', [ok('abuseipdb', 50), errResult]);
    expect(r.contributing).toBe(1);
  });
});
