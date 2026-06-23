import { describe, it, expect } from 'vitest';
import { ipv4ToInt, cidrRange, parseCidrRanges, ipv4InRanges } from '../../src/lib/cidr';
import { safeIso, safeIsoOr } from '../../src/lib/safe-date';
import { mitreTechniqueSchema, googleDorksSchema } from '../../src/lib/validation-schemas';
describe('cidr — CIDR membership (x4bnet / blocklist feeds)', () => {
    it('matches an IP inside a CIDR range (the x4bnet bug: bare IP vs CIDR string)', () => {
        const ranges = parseCidrRanges('2.56.16.0/22\n# comment\n2.26.157.0/24\n');
        expect(ipv4InRanges('2.26.157.42', ranges)).toBe(true);
        expect(ipv4InRanges('2.56.17.1', ranges)).toBe(true); // inside /22
        expect(ipv4InRanges('9.9.9.9', ranges)).toBe(false);
    });
    it('treats a bare IP line as a /32', () => {
        const ranges = parseCidrRanges('8.8.8.8\n');
        expect(ipv4InRanges('8.8.8.8', ranges)).toBe(true);
        expect(ipv4InRanges('8.8.8.9', ranges)).toBe(false);
    });
    it('rejects malformed IPs/CIDRs without throwing', () => {
        expect(ipv4ToInt('999.1.1.1')).toBeNull();
        expect(ipv4ToInt('not-an-ip')).toBeNull();
        expect(cidrRange('1.2.3.0/40')).toBeNull();
        expect(ipv4InRanges('::1', parseCidrRanges('1.0.0.0/8'))).toBe(false);
    });
});
describe('safe-date — never throws on junk upstream dates', () => {
    it('safeIso returns undefined for junk/missing, ISO for valid', () => {
        expect(safeIso('garbage')).toBeUndefined();
        expect(safeIso('')).toBeUndefined();
        expect(safeIso(null)).toBeUndefined();
        expect(safeIso('2026-01-02T03:04:05Z')).toBe('2026-01-02T03:04:05.000Z');
        expect(safeIso('Mon, 02 Jan 2026 03:04:05 GMT')).toBe('2026-01-02T03:04:05.000Z');
    });
    it('the old pattern threw — confirm the helper does NOT', () => {
        expect(() => new Date('totally not a date').toISOString()).toThrow();
        expect(() => safeIso('totally not a date')).not.toThrow();
    });
    it('safeIsoOr falls back instead of throwing', () => {
        expect(safeIsoOr('garbage', '2020-01-01T00:00:00.000Z')).toBe('2020-01-01T00:00:00.000Z');
        expect(safeIsoOr('2026-01-02T03:04:05Z')).toBe('2026-01-02T03:04:05.000Z');
    });
});
describe('route schemas now match their handlers (no false 400)', () => {
    it('mitreTechniqueSchema accepts the handler param `technique`', () => {
        expect(mitreTechniqueSchema.safeParse({ technique: 'T1059' }).success).toBe(true);
        expect(mitreTechniqueSchema.safeParse({ t: 'T1059.001' }).success).toBe(true);
        // missing is allowed by the middleware — the handler 400s on it itself.
        expect(mitreTechniqueSchema.safeParse({}).success).toBe(true);
    });
    it('googleDorksSchema accepts the handler param `q`', () => {
        expect(googleDorksSchema.safeParse({ q: 'site:example.com' }).success).toBe(true);
        expect(googleDorksSchema.safeParse({ q: 'test', num: '20' }).success).toBe(true);
    });
});
