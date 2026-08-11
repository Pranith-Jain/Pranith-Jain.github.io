import { describe, it, expect } from 'vitest';
import {
  _test_evaluateGrounding,
  _test_buildStoredSources,
  _test_extractCveIds,
  _test_decideTrendAcceptance,
} from '../../../src/case-study/discovery/agentic-trends';

describe('agentic-trends stored-source filtering', () => {
  it('drops confirmed-broken URLs so they never reach extractSources / post.sources', () => {
    const stored = _test_buildStoredSources(['https://good.example/a', 'https://valid-host.example/fabricated-path'], {
      'https://good.example/a': 'ok',
      'https://valid-host.example/fabricated-path': 'broken',
    });
    expect(stored).toEqual(['https://good.example/a']);
  });

  it('keeps ok + unchecked URLs and de-dupes', () => {
    const stored = _test_buildStoredSources(['https://a.example/x', 'https://a.example/x', 'https://b.example/y'], {
      'https://a.example/x': 'unchecked',
      'https://b.example/y': 'ok',
    });
    expect(stored).toEqual(['https://a.example/x', 'https://b.example/y']);
  });
});

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

describe('extractCveIds', () => {
  it('pulls well-formed CVE ids from title, rationale, hook, angle, entities', () => {
    const ids = _test_extractCveIds({
      title: 'CVE-2026-12345 in Acme',
      type: 'cve',
      rationale: 'Critical flaw.',
      hook: 'A 9.8 RCE.',
      angle: 'Mass exploitation.',
      evidence: { entities: ['CVE-2026-99999'] },
      trendingSignal: 0.9,
    });
    expect(ids).toEqual(['CVE-2026-12345', 'CVE-2026-99999']);
  });

  it('deduplicates CVE ids across fields', () => {
    const ids = _test_extractCveIds({
      title: 'CVE-2026-11111',
      type: 'cve',
      rationale: 'See CVE-2026-11111.',
      hook: '',
      angle: '',
      evidence: {},
      trendingSignal: 0.8,
    });
    expect(ids).toEqual(['CVE-2026-11111']);
  });

  it('rejects out-of-range years', () => {
    const ids = _test_extractCveIds({
      title: 'CVE-2019-99999',
      type: 'cve',
      rationale: 'Old vuln.',
      hook: '',
      angle: '',
      evidence: {},
      trendingSignal: 0.5,
    });
    expect(ids).toEqual([]);
  });
});

describe('decideTrendAcceptance', () => {
  it('accepts when at least one source URL is verified ok', () => {
    const r = _test_decideTrendAcceptance({
      hasRealSource: true,
      hasRealCve: true,
      sourceStatuses: { 'https://example.com/a': 'unchecked', 'https://example.com/b': 'ok' },
    });
    expect(r.accepted).toBe(true);
  });

  it('rejects when all sources are unchecked (WAF block / HEAD-200 fake slug)', () => {
    const r = _test_decideTrendAcceptance({
      hasRealSource: true,
      hasRealCve: false,
      sourceStatuses: { 'https://example.com/fake': 'unchecked' },
    });
    expect(r.accepted).toBe(false);
    expect(r.reason).toMatch(/unchecked/);
  });

  it('rejects when at least one source is confirmed broken and none ok', () => {
    const r = _test_decideTrendAcceptance({
      hasRealSource: true,
      hasRealCve: false,
      sourceStatuses: { 'https://example.com/a': 'broken', 'https://example.com/b': 'unchecked' },
    });
    expect(r.accepted).toBe(false);
    expect(r.reason).toMatch(/broken/);
  });

  it('accepts CVE-only candidate when NVD probe found ok', () => {
    const r = _test_decideTrendAcceptance({
      hasRealSource: false,
      hasRealCve: true,
      sourceStatuses: {},
      cveStatuses: { 'CVE-2026-12345': 'ok' },
    });
    expect(r.accepted).toBe(true);
  });

  it('accepts CVE-only candidate when NVD probe is unchecked (benefit of doubt)', () => {
    const r = _test_decideTrendAcceptance({
      hasRealSource: false,
      hasRealCve: true,
      sourceStatuses: {},
      cveStatuses: { 'CVE-2026-99999': 'unchecked' },
    });
    expect(r.accepted).toBe(true);
  });

  it('rejects CVE-only candidate when every named CVE is missing from NVD', () => {
    const r = _test_decideTrendAcceptance({
      hasRealSource: false,
      hasRealCve: true,
      sourceStatuses: {},
      cveStatuses: { 'CVE-2025-1234': 'broken', 'CVE-2026-99999': 'broken' },
    });
    expect(r.accepted).toBe(false);
    expect(r.reason).toMatch(/every named CVE missing from NVD/);
  });

  it('rejects ungrounded candidate (no sources, no CVE)', () => {
    const r = _test_decideTrendAcceptance({
      hasRealSource: false,
      hasRealCve: false,
      sourceStatuses: {},
    });
    expect(r.accepted).toBe(false);
    expect(r.reason).toMatch(/ungrounded/);
  });

  it('falls through to CVE gate when source check failed (no ok source)', () => {
    const r = _test_decideTrendAcceptance({
      hasRealSource: true,
      hasRealCve: true,
      sourceStatuses: { 'https://example.com/fake': 'unchecked' },
      cveStatuses: { 'CVE-2026-12345': 'ok' },
    });
    // Source gate rejects (no ok), but CVE probe accepts → accepted overall.
    expect(r.accepted).toBe(true);
  });
});
