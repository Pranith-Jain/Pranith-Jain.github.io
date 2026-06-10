import { describe, it, expect } from 'vitest';
import { scoreAddress } from '../../src/lib/risk-score';

describe('scoreAddress', () => {
  it('sanctioned → critical', () => {
    const r = scoreAddress({ sanctioned: true, scamFlagged: false, labelCategory: null });
    expect(r.level).toBe('critical');
    expect(r.signals.some((s) => /sanction/i.test(s))).toBe(true);
  });

  it('mixer label → critical', () => {
    expect(scoreAddress({ sanctioned: false, scamFlagged: false, labelCategory: 'mixer' }).level).toBe('critical');
  });

  it('scam-flagged → high', () => {
    expect(scoreAddress({ sanctioned: false, scamFlagged: true, labelCategory: null }).level).toBe('high');
  });

  it('ransomware label → high', () => {
    expect(scoreAddress({ sanctioned: false, scamFlagged: false, labelCategory: 'ransomware' }).level).toBe('high');
  });

  it('exchange label → low (informational)', () => {
    expect(scoreAddress({ sanctioned: false, scamFlagged: false, labelCategory: 'exchange' }).level).toBe('low');
  });

  it('unknown plain wallet → low', () => {
    const r = scoreAddress({ sanctioned: false, scamFlagged: false, labelCategory: null });
    expect(r.level).toBe('low');
    expect(r.score).toBe(0);
  });
});
