import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { authenticate, valveOpenUntilMs } from '../../src/lib/auth';
// Covers the external-read API-key gate added in d9a366c (which shipped without
// tests). The gate: external GET/HEAD need a key, UNLESS same-origin (website),
// OPTIONS preflight, or the OPEN_PUBLIC_READS valve.
function appWith(env) {
    const app = new Hono();
    app.use('*', authenticate('external-only'));
    app.all('/x', (c) => c.text('ok'));
    return (init = {}) => app.fetch(new Request('https://api.test/x', { method: init.method ?? 'GET', headers: init.headers }), env);
}
describe('external-read auth gate (authenticate "external-only")', () => {
    it('401s an external GET with no key and the valve off', async () => {
        const res = await appWith({})({});
        expect(res.status).toBe(401);
    });
    it('allows an external GET when OPEN_PUBLIC_READS=true (emergency valve)', async () => {
        const res = await appWith({ OPEN_PUBLIC_READS: 'true' })({});
        expect(res.status).toBe(200);
    });
    it('allows a same-origin GET (website) with no key', async () => {
        const res = await appWith({ SITE_URL: 'https://site.test' })({
            headers: { origin: 'https://site.test' },
        });
        expect(res.status).toBe(200);
    });
    it('always allows OPTIONS preflight (no credentials)', async () => {
        const res = await appWith({})({ method: 'OPTIONS' });
        expect(res.status).toBe(200);
    });
    // Fix A: same-origin GET fetches omit Origin and may have Referer stripped;
    // Sec-Fetch-Site is the robust signal the browser always sends.
    it('exempts a same-origin GET via Sec-Fetch-Site with NO Origin/Referer', async () => {
        const res = await appWith({})({ headers: { 'sec-fetch-site': 'same-origin' } });
        expect(res.status).toBe(200);
    });
    it('does NOT exempt same-site (single-origin SPA only reports same-origin)', async () => {
        const res = await appWith({})({ headers: { 'sec-fetch-site': 'same-site' } });
        expect(res.status).toBe(401);
    });
    it('401s a cross-site GET (Sec-Fetch-Site: cross-site, no key, valve off)', async () => {
        const res = await appWith({})({ headers: { 'sec-fetch-site': 'cross-site' } });
        expect(res.status).toBe(401);
    });
    it('ignores Sec-Fetch-Site when a foreign Origin is also present', async () => {
        const res = await appWith({})({
            headers: { 'sec-fetch-site': 'same-origin', origin: 'https://evil.example' },
        });
        expect(res.status).toBe(401);
    });
    it('401s a Sec-Fetch-Site: none navigation with no key', async () => {
        const res = await appWith({})({ headers: { 'sec-fetch-site': 'none' } });
        expect(res.status).toBe(401);
    });
});
// Fix B: the valve expires deterministically across isolates (no per-isolate timer).
describe('OPEN_PUBLIC_READS valve expiry', () => {
    it('opens reads while a future ISO/epoch-ms expiry has not passed', async () => {
        const futureIso = new Date(Date.now() + 60_000).toISOString();
        expect((await appWith({ OPEN_PUBLIC_READS: futureIso })({})).status).toBe(200);
        const futureMs = String(Date.now() + 60_000);
        expect((await appWith({ OPEN_PUBLIC_READS: futureMs })({})).status).toBe(200);
    });
    it('keeps reads gated once the expiry has passed', async () => {
        const pastIso = new Date(Date.now() - 60_000).toISOString();
        expect((await appWith({ OPEN_PUBLIC_READS: pastIso })({})).status).toBe(401);
    });
    it('treats blank/garbage values as closed', async () => {
        expect((await appWith({ OPEN_PUBLIC_READS: '' })({})).status).toBe(401);
        expect((await appWith({ OPEN_PUBLIC_READS: 'maybe' })({})).status).toBe(401);
    });
    it('valveOpenUntilMs parses the supported forms', () => {
        expect(valveOpenUntilMs(undefined)).toBeNull();
        expect(valveOpenUntilMs('')).toBeNull();
        expect(valveOpenUntilMs('nope')).toBeNull();
        expect(valveOpenUntilMs('true')).toBe(Number.POSITIVE_INFINITY);
        expect(valveOpenUntilMs('TRUE')).toBe(Number.POSITIVE_INFINITY);
        expect(valveOpenUntilMs('1893456000000')).toBe(1893456000000);
        expect(valveOpenUntilMs('2030-01-01T00:00:00Z')).toBe(Date.parse('2030-01-01T00:00:00Z'));
    });
});
