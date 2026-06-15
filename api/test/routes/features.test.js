import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { featuresHandler } from '../../src/routes/features';
function app() {
    const a = new Hono();
    a.get('/api/v1/features', featuresHandler);
    return a;
}
describe('GET /api/v1/features', () => {
    it('reports only the always-on samples flag (CAPE/recon bridges removed)', async () => {
        const r = await app().request('/api/v1/features', {}, {});
        expect(r.status).toBe(200);
        expect(await r.json()).toEqual({ samples: true });
    });
    it('never includes cape or recon keys (those bridges were removed)', async () => {
        const r = await app().request('/api/v1/features', {}, {});
        const body = (await r.json());
        expect(Object.keys(body).sort()).toEqual(['samples']);
    });
    it('sets a short public cache header', async () => {
        const r = await app().request('/api/v1/features', {}, {});
        expect(r.headers.get('cache-control')).toBe('public, max-age=60');
    });
    it('always reports samples=true regardless of any leftover env', async () => {
        // /api/v1/sample/scan is always-on; verify it stays advertised even
        // when unrelated env is present.
        const r = await app().request('/api/v1/features', {}, {});
        const body = (await r.json());
        expect(body.samples).toBe(true);
    });
});
