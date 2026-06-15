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
    it('ransom-flagged → high (85) with family in signal', () => {
        const r = scoreAddress({
            sanctioned: false,
            scamFlagged: false,
            labelCategory: null,
            ransomFlagged: true,
            ransomFamily: 'LockBit',
        });
        expect(r.level).toBe('high');
        expect(r.score).toBe(85);
        expect(r.signals.some((s) => /ransomware payment wallet \(LockBit\)/i.test(s))).toBe(true);
    });
    it('ransom-flagged without a family still scores high', () => {
        const r = scoreAddress({
            sanctioned: false,
            scamFlagged: false,
            labelCategory: null,
            ransomFlagged: true,
            ransomFamily: null,
        });
        expect(r.level).toBe('high');
        expect(r.score).toBe(85);
        expect(r.signals.some((s) => /ransomware payment wallet/i.test(s))).toBe(true);
    });
    it('OFAC sanction still outranks a ransom hit (stays critical)', () => {
        const r = scoreAddress({
            sanctioned: true,
            scamFlagged: false,
            labelCategory: null,
            ransomFlagged: true,
            ransomFamily: 'Conti',
        });
        expect(r.level).toBe('critical');
        expect(r.score).toBe(100);
    });
    it('ransom hit outranks a ScamSniffer flag', () => {
        const r = scoreAddress({
            sanctioned: false,
            scamFlagged: true,
            labelCategory: null,
            ransomFlagged: true,
            ransomFamily: 'Conti',
        });
        expect(r.score).toBe(85);
        expect(r.signals.some((s) => /ScamSniffer/i.test(s))).toBe(true);
        expect(r.signals.some((s) => /ransomware payment wallet/i.test(s))).toBe(true);
    });
});
