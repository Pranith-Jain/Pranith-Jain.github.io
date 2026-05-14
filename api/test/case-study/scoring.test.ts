import { describe, it, expect } from 'vitest';
import { recencyScore, severityScore, noveltyScore, finalScore } from '../../src/case-study/scoring';

const now = new Date('2026-05-14T12:00:00Z');

describe('recencyScore', () => {
  it('is 1.0 for events within last 24h', () => {
    const t = new Date('2026-05-13T13:00:00Z').toISOString();
    expect(recencyScore(t, now)).toBeCloseTo(1.0, 2);
  });

  it('decays linearly to 0 over 14 days', () => {
    const t = new Date('2026-04-30T12:00:00Z').toISOString(); // 14d ago
    expect(recencyScore(t, now)).toBeCloseTo(0, 2);
  });

  it('is 0 for events older than 14 days', () => {
    const t = new Date('2026-04-01T12:00:00Z').toISOString();
    expect(recencyScore(t, now)).toBe(0);
  });
});

describe('severityScore', () => {
  it('returns CVSS/10 when given a number', () => {
    expect(severityScore({ cvss: 9.8 })).toBeCloseTo(0.98, 2);
    expect(severityScore({ cvss: 5 })).toBeCloseTo(0.5, 2);
  });

  it('returns 1.0 if KEV-listed regardless of CVSS', () => {
    expect(severityScore({ cvss: 4, kev: true })).toBe(1.0);
  });

  it('scales victim count for ransomware (5+ = 1.0)', () => {
    expect(severityScore({ victims: 1 })).toBeCloseTo(0.2, 2);
    expect(severityScore({ victims: 5 })).toBe(1.0);
    expect(severityScore({ victims: 100 })).toBe(1.0);
  });

  it('returns 0.5 default for no signals', () => {
    expect(severityScore({})).toBe(0.5);
  });
});

describe('noveltyScore', () => {
  it('is 1.0 if not previously seen', () => {
    expect(noveltyScore(null, now)).toBe(1.0);
  });

  it('is 0.0 if seen today', () => {
    expect(noveltyScore({ lastSeenAt: now.toISOString() }, now)).toBe(0);
  });

  it('linearly increases over 90 days', () => {
    const t = new Date(now.getTime() - 45 * 24 * 3600 * 1000).toISOString();
    expect(noveltyScore({ lastSeenAt: t }, now)).toBeCloseTo(0.5, 2);
  });
});

describe('finalScore', () => {
  it('weighted average of recency, severity, novelty with source weight', () => {
    const s = finalScore({
      recency: 1.0,
      severity: 1.0,
      novelty: 1.0,
      sourceWeight: 1.0,
    });
    expect(s).toBeCloseTo(1.0, 2);
  });

  it('drops when novelty drops', () => {
    const hi = finalScore({ recency: 1, severity: 1, novelty: 1, sourceWeight: 1 });
    const lo = finalScore({ recency: 1, severity: 1, novelty: 0, sourceWeight: 1 });
    expect(lo).toBeLessThan(hi);
  });
});
