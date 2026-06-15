import { describe, it, expect } from 'vitest';
describe('supply-chain/types envelopes', () => {
    it('SCSoftwareResult is constructible with required fields', () => {
        const finding = {
            id: 'MAL-2024-0001',
            malicious: true,
            aliases: ['GHSA-xxxx'],
            cvss: '9.8',
            severity: 'critical',
        };
        const r = {
            source: 'osv.dev',
            status: 'ok',
            fetched_at: new Date().toISOString(),
            package: 'left-pad',
            ecosystem: 'npm',
            total: 1,
            malicious_count: 1,
            findings: [finding],
        };
        expect(r.findings[0].malicious).toBe(true);
        expect(r.malicious_count).toBe(1);
    });
    it('SCAddressSignal.category accepts a LabelCategory and null', () => {
        const a = {
            source: 'Tornado Cash list',
            status: 'ok',
            fetched_at: new Date().toISOString(),
            address: '0x722122df12d4e14e13ac3b6895a86e84145b6967',
            category: 'mixer',
            sanctioned: null,
            risk_flags: ['tornado-pool'],
        };
        const inconclusive = { ...a, category: null, sanctioned: null };
        expect(a.category).toBe('mixer');
        expect(inconclusive.category).toBeNull();
    });
    it('SCInfraResult carries citable facts', () => {
        const r = {
            source: 'Spamhaus ASN-DROP',
            status: 'ok',
            fetched_at: new Date().toISOString(),
            resource: 'AS64500',
            listed: true,
            facts: [{ label: 'name', value: 'BULLETPROOF-AS', url: 'https://x' }],
        };
        expect(r.facts[0].label).toBe('name');
    });
    it('SCStatus and SCBase honest-status contract holds', () => {
        const statuses = ['ok', 'empty', 'error', 'needs-key'];
        const b = { source: 's', status: 'needs-key', fetched_at: 'now', error: 'no key' };
        expect(statuses).toContain(b.status);
    });
    it('Fetchish is assignable from globalThis.fetch', () => {
        const f = globalThis.fetch.bind(globalThis);
        expect(typeof f).toBe('function');
    });
});
