import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { registerAdminRoutes } from '../../src/routes/case-study-admin';
function mockEnv() {
    const store = new Map();
    const kv = {
        async get(k, t) {
            const v = store.get(k);
            if (v === undefined)
                return null;
            return t === 'json' ? JSON.parse(v) : v;
        },
        async put(k, v) {
            store.set(k, v);
        },
        async delete(k) {
            store.delete(k);
        },
        async list(opts) {
            return {
                keys: Array.from(store.keys())
                    .filter((k) => k.startsWith(opts.prefix))
                    .map((name) => ({ name })),
                list_complete: true,
                cursor: '',
            };
        },
    };
    return { CASE_STUDIES: kv, ADMIN_TOKEN: 'sekret', __store: store };
}
function app() {
    const a = new Hono();
    registerAdminRoutes(a);
    return a;
}
const cand = {
    key: 'cve-2026-1234',
    type: 'cve',
    title: 'X',
    rationale: 'r',
    score: 0.9,
    evidence: {},
    discoveredAt: '2026-05-14T06:00:00Z',
    status: 'pending',
};
describe('admin routes', () => {
    it('rejects requests without token', async () => {
        const r = await app().request('/api/v1/admin/candidates', {}, mockEnv());
        expect(r.status).toBe(401);
    });
    it('accepts requests with token via header', async () => {
        const env = mockEnv();
        env.__store.set(`candidates:cve:${cand.key}`, JSON.stringify(cand));
        const r = await app().request('/api/v1/admin/candidates', {
            headers: { 'X-Admin-Token': 'sekret' },
        }, env);
        expect(r.status).toBe(200);
        const body = (await r.json());
        expect(body.pending).toHaveLength(1);
    });
    it('approve moves candidate from pending to approved', async () => {
        const env = mockEnv();
        env.__store.set(`candidates:cve:${cand.key}`, JSON.stringify(cand));
        const r = await app().request(`/api/v1/admin/candidates/${cand.key}/approve`, {
            method: 'POST',
            headers: { 'X-Admin-Token': 'sekret' },
        }, env);
        expect(r.status).toBe(200);
        expect(env.__store.has(`approved:${cand.key}`)).toBe(true);
    });
    it('skip removes a candidate', async () => {
        const env = mockEnv();
        env.__store.set(`candidates:cve:${cand.key}`, JSON.stringify(cand));
        const r = await app().request(`/api/v1/admin/candidates/${cand.key}/skip?type=cve`, {
            method: 'POST',
            headers: { 'X-Admin-Token': 'sekret' },
        }, env);
        expect(r.status).toBe(200);
        expect(env.__store.has(`candidates:cve:${cand.key}`)).toBe(false);
    });
    it('skip writes a 30-day suppression record', async () => {
        const env = mockEnv();
        env.__store.set(`candidates:cve:${cand.key}`, JSON.stringify(cand));
        const r = await app().request(`/api/v1/admin/candidates/${cand.key}/skip?type=cve`, { method: 'POST', headers: { 'X-Admin-Token': 'sekret' } }, env);
        expect(r.status).toBe(200);
        const dedup = JSON.parse(env.__store.get('meta:dedup-index'));
        expect(dedup[cand.key].suppressedUntil).toBeTruthy();
        expect(new Date(dedup[cand.key].suppressedUntil).getTime()).toBeGreaterThan(Date.now());
    });
    it('skip-all clears every pending candidate and suppresses them', async () => {
        const env = mockEnv();
        env.__store.set('candidates:cve:cve-1', JSON.stringify({ ...cand, key: 'cve-1' }));
        env.__store.set('candidates:actor:actor-1', JSON.stringify({ ...cand, key: 'actor-1', type: 'actor' }));
        const r = await app().request('/api/v1/admin/candidates/skip-all', { method: 'POST', headers: { 'X-Admin-Token': 'sekret' } }, env);
        expect(r.status).toBe(200);
        const body = (await r.json());
        expect(body.cleared).toBe(2);
        expect(env.__store.has('candidates:cve:cve-1')).toBe(false);
        expect(env.__store.has('candidates:actor:actor-1')).toBe(false);
        const dedup = JSON.parse(env.__store.get('meta:dedup-index'));
        expect(dedup['cve-1'].suppressedUntil).toBeTruthy();
        expect(dedup['actor-1'].suppressedUntil).toBeTruthy();
    });
    it('skip-all with ?type clears only that type', async () => {
        const env = mockEnv();
        env.__store.set('candidates:cve:cve-1', JSON.stringify({ ...cand, key: 'cve-1' }));
        env.__store.set('candidates:actor:actor-1', JSON.stringify({ ...cand, key: 'actor-1', type: 'actor' }));
        const r = await app().request('/api/v1/admin/candidates/skip-all?type=cve', { method: 'POST', headers: { 'X-Admin-Token': 'sekret' } }, env);
        expect(r.status).toBe(200);
        expect((await r.json()).cleared).toBe(1);
        expect(env.__store.has('candidates:cve:cve-1')).toBe(false);
        expect(env.__store.has('candidates:actor:actor-1')).toBe(true);
    });
    const hdr = { 'X-Admin-Token': 'sekret' };
    const jhdr = { 'X-Admin-Token': 'sekret', 'content-type': 'application/json' };
    const getSchedule = async (env) => (await (await app().request('/api/v1/admin/schedule', { headers: hdr }, env)).json());
    it('publish-soon schedules an approved candidate due now, reschedule moves it', async () => {
        const env = mockEnv();
        env.__store.set('approved:cve-soon-1', JSON.stringify({ ...cand, key: 'cve-soon-1', status: 'approved' }));
        const soon = await app().request('/api/v1/admin/approved/cve-soon-1/publish-soon', { method: 'POST', headers: hdr }, env);
        expect(soon.status).toBe(200);
        let sched = await getSchedule(env);
        const slot = sched.schedule.find((s) => s.candidateId === 'cve-soon-1');
        expect(slot).toBeTruthy();
        expect(slot.status).toBe('pending');
        const r = await app().request('/api/v1/admin/schedule/cve-soon-1/reschedule', { method: 'POST', headers: jhdr, body: JSON.stringify({ slotAt: '2030-01-01T10:00:00.000Z' }) }, env);
        expect(r.status).toBe(200);
        sched = await getSchedule(env);
        expect(sched.schedule.find((s) => s.candidateId === 'cve-soon-1').slotAt).toBe('2030-01-01T10:00:00.000Z');
    });
    it('publish-soon 404s an unknown approved candidate', async () => {
        const env = mockEnv();
        const r = await app().request('/api/v1/admin/approved/nope/publish-soon', { method: 'POST', headers: hdr }, env);
        expect(r.status).toBe(404);
    });
    it('reschedule rejects an invalid slotAt with 400', async () => {
        const env = mockEnv();
        const r = await app().request('/api/v1/admin/schedule/whatever/reschedule', { method: 'POST', headers: jhdr, body: JSON.stringify({ slotAt: 'not-a-date' }) }, env);
        expect(r.status).toBe(400);
    });
    it('reschedule 404s an unknown slot', async () => {
        const env = mockEnv();
        const r = await app().request('/api/v1/admin/schedule/no-such-slot/reschedule', { method: 'POST', headers: jhdr, body: JSON.stringify({ slotAt: '2030-01-01T10:00:00.000Z' }) }, env);
        expect(r.status).toBe(404);
    });
    it('social-schedule: upsert a planned time then mark posted', async () => {
        const env = mockEnv();
        // Unscheduled → null
        let r = await app().request('/api/v1/admin/social-schedule/my-post-1', { headers: hdr }, env);
        expect(r.status).toBe(200);
        expect((await r.json()).schedule).toBeNull();
        // Plan a twitter time
        r = await app().request('/api/v1/admin/social-schedule/my-post-1/twitter', { method: 'POST', headers: jhdr, body: JSON.stringify({ scheduledAt: '2026-06-10T09:00:00.000Z' }) }, env);
        expect(r.status).toBe(200);
        expect((await r.json()).schedule.twitter.scheduledAt).toBe('2026-06-10T09:00:00.000Z');
        // Mark linkedin posted (independent of twitter)
        r = await app().request('/api/v1/admin/social-schedule/my-post-1/linkedin/mark-posted', { method: 'POST', headers: hdr }, env);
        expect(r.status).toBe(200);
        const body = (await r.json()).schedule;
        expect(body.linkedin.status).toBe('posted');
        expect(body.twitter.scheduledAt).toBe('2026-06-10T09:00:00.000Z'); // unchanged
    });
    it('schedule self-heals a published slot whose post was removed (1 list, not N gets)', async () => {
        const env = mockEnv();
        env.__store.set('schedule:upcoming', JSON.stringify([
            { candidateId: 'gone', slotAt: '2026-06-01T00:00:00.000Z', status: 'published', publishedSlug: 'gone-slug' },
            { candidateId: 'live', slotAt: '2026-06-02T00:00:00.000Z', status: 'published', publishedSlug: 'live-slug' },
        ]));
        env.__store.set('posts:live-slug', JSON.stringify({ slug: 'live-slug' }));
        const r = await app().request('/api/v1/admin/schedule', { headers: hdr }, env);
        expect(r.status).toBe(200);
        const sched = (await r.json()).schedule;
        expect(sched.find((s) => s.candidateId === 'gone').status).toBe('pending');
        expect(sched.find((s) => s.candidateId === 'live').status).toBe('published');
    });
    it('social-index reports per-platform presence from one list (no per-post fan-out)', async () => {
        const env = mockEnv();
        env.__store.set('social:post-a', JSON.stringify({ slug: 'post-a', twitter: 't', linkedin: 'l', generatedAt: '' }));
        env.__store.set('social:post-b:twitter', 'just twitter');
        const r = await app().request('/api/v1/admin/social-index', { headers: hdr }, env);
        expect(r.status).toBe(200);
        const idx = (await r.json()).index;
        expect(idx['post-a']).toEqual({ twitter: true, linkedin: true });
        expect(idx['post-b']).toEqual({ twitter: true, linkedin: false });
    });
    it('social-schedule: rejects an unknown platform with 400', async () => {
        const env = mockEnv();
        const r = await app().request('/api/v1/admin/social-schedule/my-post-1/mastodon', { method: 'POST', headers: jhdr, body: JSON.stringify({ status: 'posted' }) }, env);
        expect(r.status).toBe(400);
    });
});
