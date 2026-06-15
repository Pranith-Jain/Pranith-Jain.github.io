import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { buildReportHandler, getReportHandler } from '../../src/routes/report';
import { requireAdminMiddleware } from '../../src/lib/admin-auth';
import { validate } from '../../src/lib/validate';
import { reportBuildSchema } from '../../src/lib/validation-schemas';
// Mirror how api/src/index.ts wires the report routes: admin gate + validate.
function app() {
    const a = new Hono();
    a.use('/api/v1/report', requireAdminMiddleware);
    a.use('/api/v1/report/*', requireAdminMiddleware);
    a.post('/api/v1/report/build', validate('json', reportBuildSchema), buildReportHandler);
    a.get('/api/v1/report/:id', getReportHandler);
    return a;
}
// ADMIN_TOKEN set; REPORT_BUILDER intentionally unbound in this harness so the
// handler reaches its 503 guard once auth + validation pass.
const env = () => ({ ADMIN_TOKEN: 'sekret' });
function post(body, auth = true) {
    return app().request('/api/v1/report/build', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(auth ? { Authorization: 'Bearer sekret' } : {}) },
        body: JSON.stringify(body),
    }, env());
}
describe('POST /api/v1/report/build', () => {
    it('401 without an admin token', async () => {
        const r = await post({ subject: 'LockBit' }, false);
        expect(r.status).toBe(401);
    });
    it('400 on an invalid body (missing subject)', async () => {
        const r = await post({ template: 'cve' });
        expect(r.status).toBe(400);
    });
    it('400 on an out-of-enum template', async () => {
        const r = await post({ subject: 'LockBit', template: 'not-a-template' });
        expect(r.status).toBe(400);
    });
    it('reaches the handler (503) once auth + validation pass and the DO is unbound', async () => {
        const r = await post({ subject: 'LockBit', template: 'ransomware-group', tlp: 'AMBER' });
        expect(r.status).toBe(503);
    });
});
describe('GET /api/v1/report/:id', () => {
    it('401 without an admin token', async () => {
        const r = await app().request('/api/v1/report/abc', {}, env());
        expect(r.status).toBe(401);
    });
});
