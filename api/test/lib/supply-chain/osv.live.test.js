import { describe, it, expect } from 'vitest';
import { queryOsvPackage } from '../../../src/lib/supply-chain/osv';
// Network-gated: skipped by default (CI/local default runs stay offline).
// Run on demand: cd api && npx vitest run test/lib/supply-chain/osv.live.test.ts
describe.skip('queryOsvPackage (LIVE OSV.dev format smoke)', () => {
    it('lodash@4.17.4 still returns mapped findings with a CVSS', async () => {
        const r = await queryOsvPackage('lodash', 'npm', '4.17.4');
        expect(r.status).toBe('ok');
        expect(r.total).toBeGreaterThan(0);
        expect(r.findings.some((f) => f.cvss || f.summary)).toBe(true);
    });
});
