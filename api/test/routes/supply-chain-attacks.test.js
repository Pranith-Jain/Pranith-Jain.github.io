import { SELF } from 'cloudflare:test';
import { describe, it, expect, vi, beforeEach } from 'vitest';
beforeEach(() => {
    vi.restoreAllMocks();
});
const SAMPLE = JSON.stringify({
    name: 'Supply Chain Attack Incident Catalog',
    description: 'A neutral, comprehensive public reference.',
    license: 'Catalog data is free to cite with attribution to supplychainattack.org.',
    revised: '2026-06-10',
    count: 3,
    incidents: [
        {
            id: 'malware-in-foo',
            url: 'https://supplychainattack.org/incident/malware-in-foo',
            title: 'Malware in foo',
            status: 'active',
            severity: 'critical',
            ecosystems: ['npm'],
            attackVectors: ['compromised-package'],
            disclosedDate: '2026-06-10',
            lastUpdated: '2026-06-10',
            blastRadius: 'Any system with the package installed',
            affectedEntities: [{ name: 'foo', note: 'npm package' }],
            summary: 'The npm package foo contains malware.',
            iocs: { packages: ['foo'] },
            remediation: ['Immediately remove foo'],
            sources: [{ url: 'https://github.com/advisories/GHSA-aaaa', title: 'GHSA-aaaa', publisher: 'GitHub Advisory Database' }],
        },
        {
            id: 'malware-in-bar',
            url: 'https://supplychainattack.org/incident/malware-in-bar',
            title: 'Malware in bar',
            status: 'resolved',
            severity: 'high',
            ecosystems: ['pypi'],
            attackVectors: ['account-takeover'],
            disclosedDate: '2026-06-09',
            lastUpdated: '2026-06-09',
            blastRadius: '',
            affectedEntities: [{ name: 'bar' }],
            summary: '',
            iocs: { packages: ['bar'] },
            remediation: [],
            sources: [],
        },
        {
            id: 'malware-in-baz',
            url: 'https://supplychainattack.org/incident/malware-in-baz',
            title: 'Malware in baz',
            status: 'active',
            severity: 'critical',
            ecosystems: ['npm'],
            attackVectors: ['compromised-package'],
            disclosedDate: '2026-06-08',
            lastUpdated: '2026-06-08',
            blastRadius: 'x',
            affectedEntities: [{ name: 'baz' }],
            summary: 'baz bad',
            iocs: { packages: ['baz'] },
            remediation: ['remove baz'],
            sources: [{ url: 'https://github.com/advisories/GHSA-bbbb', title: 'GHSA-bbbb', publisher: 'GitHub Advisory Database' }],
        },
    ],
});
function mockUpstream(status, body) {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(body, { status, headers: { 'Content-Type': 'application/json' } }));
}
describe('GET /api/v1/supply-chain-attacks', () => {
    // FIRST: error path — runs before any success can populate the global
    // KV last-good (supplychain:lastgood:v1), which would otherwise mask the 502.
    it('502s when upstream is unavailable and no last-good exists', async () => {
        mockUpstream(404, 'not found');
        const r = await SELF.fetch('https://x/api/v1/supply-chain-attacks?limit=104');
        expect(r.status).toBe(502);
        const body = (await r.json());
        expect(body.source).toBe('supplychainattack.org');
    });
    it('returns normalized incidents + facets + attribution', async () => {
        mockUpstream(200, SAMPLE);
        const r = await SELF.fetch('https://x/api/v1/supply-chain-attacks?limit=101');
        expect(r.status).toBe(200);
        const body = (await r.json());
        expect(body.source).toBe('supplychainattack.org');
        expect(body.license).toContain('free to cite with attribution');
        expect(body.total).toBe(3);
        // snake_case normalization
        expect(body.incidents[0].attack_vectors).toEqual(['compromised-package']);
        expect(body.incidents[0].disclosed_date).toBe('2026-06-10');
        expect(body.incidents[0].iocs.packages).toEqual(['foo']);
        // facets reflect the FULL catalog
        expect(body.facets.ecosystems.npm).toBe(2);
        expect(body.facets.ecosystems.pypi).toBe(1);
        expect(body.facets.statuses.active).toBe(2);
        expect(body.facets.statuses.resolved).toBe(1);
    });
    it('filters by ecosystem (facets stay full-set)', async () => {
        mockUpstream(200, SAMPLE);
        const r = await SELF.fetch('https://x/api/v1/supply-chain-attacks?ecosystem=pypi&limit=102');
        expect(r.status).toBe(200);
        const body = (await r.json());
        expect(body.count).toBe(1);
        expect(body.incidents.every((i) => i.ecosystems.includes('pypi'))).toBe(true);
        expect(body.facets.ecosystems.npm).toBe(2); // full-set facet survives filtering
    });
    it('filters by status', async () => {
        mockUpstream(200, SAMPLE);
        const r = await SELF.fetch('https://x/api/v1/supply-chain-attacks?status=resolved&limit=103');
        expect(r.status).toBe(200);
        const body = (await r.json());
        expect(body.count).toBe(1);
        expect(body.incidents[0].status).toBe('resolved');
    });
    it('400s on a non-numeric limit (validate() schema parity)', async () => {
        const r = await SELF.fetch('https://x/api/v1/supply-chain-attacks?limit=abc');
        expect(r.status).toBe(400);
    });
    it('sets a Cache-Control header on success', async () => {
        mockUpstream(200, SAMPLE);
        const r = await SELF.fetch('https://x/api/v1/supply-chain-attacks?limit=105');
        expect(r.headers.get('Cache-Control')).toContain('max-age');
    });
});
