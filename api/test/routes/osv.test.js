import { describe, it, expect, afterEach } from 'vitest';
import { Hono } from 'hono';
import { env as testEnv } from 'cloudflare:test';
import { validate } from '../../src/lib/validate';
import { osvScanSchema } from '../../src/lib/validation-schemas';
import { osvScanHandler } from '../../src/routes/osv';
function app() {
    const a = new Hono();
    a.post('/api/v1/osv/scan', validate('json', osvScanSchema), osvScanHandler);
    return a;
}
const env = () => ({ ...testEnv, OPEN_PUBLIC_READS: 'true' });
const json = { 'content-type': 'application/json' };
const realFetch = globalThis.fetch;
afterEach(() => {
    globalThis.fetch = realFetch;
});
describe('osv/scan route (frozen contract)', () => {
    it('400s an empty package list (schema mirrors handler reads)', async () => {
        const r = await app().request('/api/v1/osv/scan', { method: 'POST', headers: json, body: JSON.stringify({ packages: [] }) }, env());
        expect(r.status).toBe(400);
    });
    it('emits the legacy wire shape with severity=CVSS', async () => {
        globalThis.fetch = (async (url) => {
            const u = String(url);
            if (u.endsWith('/v1/querybatch'))
                return new Response(JSON.stringify({ results: [{ vulns: [{ id: 'GHSA-z' }] }] }), { status: 200 });
            return new Response(JSON.stringify({ summary: 'boom', severity: [{ type: 'CVSS_V3', score: '7.5' }], aliases: ['CVE-1'] }), { status: 200 });
        });
        const r = await app().request('/api/v1/osv/scan', { method: 'POST', headers: json, body: JSON.stringify({ packages: [{ name: 'p', ecosystem: 'npm' }] }) }, env());
        expect(r.status).toBe(200);
        const b = (await r.json());
        expect(b.total_packages).toBe(1);
        expect(b.detailed_capped).toBe(false);
        expect(b.results[0].package).toBe('p');
        expect(b.results[0].vulns[0].id).toBe('GHSA-z');
        expect(b.results[0].vulns[0].severity).toBe('7.5'); // legacy: severity carries CVSS score
    });
});
