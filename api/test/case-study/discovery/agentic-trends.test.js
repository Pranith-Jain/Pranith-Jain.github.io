import { describe, it, expect } from 'vitest';
import { _test_evaluateGrounding } from '../../../src/case-study/discovery/agentic-trends';
describe('agentic-trends grounding gate', () => {
  it('rejects a candidate with no real source URL and no CVE (the bogus-NK-APT pattern)', () => {
    const result = _test_evaluateGrounding({
      title: 'Agentic North Korean APT Group Targets Indian Government Entities',
      type: 'actor',
      rationale: 'State-sponsored group uses AI agents to target government entities.',
      hook: 'A new APT group is using agentic AI to attack the Indian government.',
      angle: 'AI-enabled tradecraft shift.',
      evidence: {
        entities: ['APT-99', 'North Korea', 'Indian government'],
        sources: ['example.com', 'yourdomain.com'],
        impact: 'Targets government entities in India.',
        urgency: 'Newly observed.',
      },
      trendingSignal: 0.85,
    });
    expect(result.hasRealSource).toBe(false);
    expect(result.hasRealCve).toBe(false);
    expect(result.rejectedReason).toMatch(/ungrounded/i);
  });
  it('accepts a candidate with a real source URL (BleepingComputer)', () => {
    const result = _test_evaluateGrounding({
      title: 'LockBit 5 returns with new affiliate program',
      type: 'ransom',
      rationale: 'Re-emergence of LockBit 5 with new tactics.',
      hook: 'LockBit 5 is back.',
      angle: 'Affiliate churn pattern.',
      evidence: {
        sources: ['https://www.bleepingcomputer.com/news/security/lockbit-5-returns/'],
      },
      trendingSignal: 0.9,
    });
    expect(result.hasRealSource).toBe(true);
    expect(result.realSources.length).toBe(1);
    expect(result.rejectedReason).toBeUndefined();
  });
  it('accepts a candidate with a well-formed CVE (year + sequence > 0)', () => {
    const result = _test_evaluateGrounding({
      title: 'CVE-2026-42607 in Grav CMS exploited in the wild',
      type: 'cve',
      rationale: 'Critical RCE in Grav CMS.',
      hook: 'A 9.1-CVSS RCE is being exploited.',
      angle: 'Mass-exploitation pattern.',
      evidence: {},
      trendingSignal: 0.95,
    });
    expect(result.hasRealCve).toBe(true);
    expect(result.rejectedReason).toBeUndefined();
  });
  it('rejects a candidate with a malformed CVE (year out of range)', () => {
    const result = _test_evaluateGrounding({
      title: 'Fake CVE-2019-99999 in some product',
      type: 'cve',
      rationale: 'Old CVE.',
      hook: 'Old CVE-2019-99999.',
      angle: 'Old vulnerability.',
      evidence: {},
      trendingSignal: 0.5,
    });
    expect(result.hasRealCve).toBe(false);
    expect(result.hasRealSource).toBe(false);
  });
  it('rejects a candidate with sources pointing only at fabricated hosts', () => {
    const result = _test_evaluateGrounding({
      title: 'Critical 0day in ExampleBrowser',
      type: 'cve',
      rationale: 'New zero-day.',
      hook: 'Critical 0day.',
      angle: 'Browser exploit.',
      evidence: {
        sources: ['https://example.com/article', 'https://yourdomain.com/news'],
      },
      trendingSignal: 0.8,
    });
    expect(result.hasRealSource).toBe(false);
  });
  it('extracts real sources from the hook/rationale/angle text', () => {
    const result = _test_evaluateGrounding({
      title: 'A new ransomware campaign',
      type: 'ransom',
      rationale: 'See https://krebsonsecurity.com/2026/06/new-campaign for details.',
      hook: 'A new campaign.',
      angle: 'Pattern analysis.',
      evidence: {},
      trendingSignal: 0.7,
    });
    expect(result.hasRealSource).toBe(true);
    expect(result.realSources[0]).toContain('krebsonsecurity.com');
  });
});
