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
    // For an IP, AbuseIPDB (w=4) and Shodan (w=2) weigh more than VirusTotal/OTX (w=1)
    const heavy = compositeScore('ipv4', [ok('abuseipdb', 90), ok('shodan', 80)]);
    const light = compositeScore('ipv4', [ok('virustotal', 90), ok('otx', 80)]);
    expect(heavy.score).toBeGreaterThan(light.score);
  });

  it('weights hash-focused providers higher for hash indicators', () => {
    const heavy = compositeScore('hash', [ok('virustotal', 90), ok('hybridanalysis', 80)]);
    const light = compositeScore('hash', [ok('otx', 80)]);
    expect(heavy.score).toBeGreaterThan(light.score);
  });

  it('high confidence with 5+ providers, medium with 3-4, low with 1-2', () => {
    const high = compositeScore('ipv4', [
      ok('virustotal', 30),
      ok('abuseipdb', 30),
      ok('shodan', 30),
      ok('threatfox', 30),
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

  describe('NSRL / strong-clean down-weighting', () => {
    const clean = (source: ProviderId): ProviderResult => ({
      source,
      status: 'ok',
      score: 0,
      verdict: 'clean',
      raw_summary: { known_good: true },
      tags: ['known-good'],
      fetched_at: new Date().toISOString(),
      cached: false,
    });

    it('caps single-strong-malicious into suspicious when NSRL says known-good', () => {
      // hashlookup (weight 3 for hash) reports known-good; threatfox (weight 4)
      // reports malicious. Without clean-cap → floor 50 → suspicious. With
      // clean-cap → also suspicious (49) but explicitly NOT malicious.
      const r = compositeScore('hash', [clean('hashlookup'), ok('threatfox', 90)]);
      expect(r.verdict).toBe('suspicious');
      expect(r.score).toBeLessThan(70);
    });

    it('lets 2+ strong-malicious override even a NSRL known-good hit', () => {
      // Genuine consensus conflict — surface the malicious side rather than
      // hiding it behind the clean signal.
      const r = compositeScore('hash', [clean('hashlookup'), ok('threatfox', 90), ok('virustotal', 80)]);
      expect(r.verdict).toBe('malicious');
      expect(r.score).toBeGreaterThanOrEqual(75);
    });

    it('caps to clean when NSRL is the only strong signal (no malicious flags)', () => {
      // hashlookup known-good + a couple of zero-scoring blocklist 'ok'
      // results. Without clean-cap the score is already 0; with clean-cap
      // it stays clean. Regression guard: ensure we don't accidentally
      // *raise* the score on a pure clean signal.
      const r = compositeScore('hash', [clean('hashlookup'), ok('otx', 0), ok('malwarebazaar', 0)]);
      expect(r.verdict).toBe('clean');
      expect(r.score).toBeLessThan(40);
    });

    it('low-weight clean verdict does not trigger the cap', () => {
      // tweetfeed has weight 2 for hash, below the strong-clean threshold (≥3).
      // A tweetfeed-clean + threatfox-malicious should still trigger the
      // single-strong-malicious floor of 50.
      const r = compositeScore('hash', [clean('tweetfeed'), ok('threatfox', 90)]);
      expect(r.verdict).toBe('suspicious');
      expect(r.score).toBeGreaterThanOrEqual(50);
    });
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
