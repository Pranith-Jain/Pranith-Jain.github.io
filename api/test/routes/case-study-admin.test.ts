import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { registerAdminRoutes } from '../../src/routes/case-study-admin';
import type { Candidate } from '../../src/case-study/types';

// Mock the wasm-backed rasteriser so the route tests run under --pool=forks
// (Node.js) without requiring the resvg wasm bundle. The mock returns a
// minimal valid PNG header so the 200-case can assert content-type and the
// PNG magic byte.
vi.mock('../../src/lib/social-carousel-raster', () => ({
  carouselSlideToPng: vi.fn(async (_env: unknown, _svg: string) => {
    // Minimal 8-byte PNG signature
    return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }),
}));

function mockEnv(): any {
  const store = new Map<string, string>();
  const kv = {
    async get(k: string, t?: 'json') {
      const v = store.get(k);
      if (v === undefined) return null;
      return t === 'json' ? JSON.parse(v) : v;
    },
    async put(k: string, v: string) {
      store.set(k, v);
    },
    async delete(k: string) {
      store.delete(k);
    },
    async list(opts: { prefix: string }) {
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
  const a = new Hono<any>();
  registerAdminRoutes(a);
  return a;
}

const cand: Candidate = {
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
    const r = await app().request(
      '/api/v1/admin/candidates',
      {
        headers: { 'X-Admin-Token': 'sekret' },
      },
      env
    );
    expect(r.status).toBe(200);
    const body = (await r.json()) as any;
    expect(body.pending).toHaveLength(1);
  });

  it('approve moves candidate from pending to approved', async () => {
    const env = mockEnv();
    env.__store.set(`candidates:cve:${cand.key}`, JSON.stringify(cand));
    const r = await app().request(
      `/api/v1/admin/candidates/${cand.key}/approve`,
      {
        method: 'POST',
        headers: { 'X-Admin-Token': 'sekret' },
      },
      env
    );
    expect(r.status).toBe(200);
    expect(env.__store.has(`approved:${cand.key}`)).toBe(true);
  });

  it('social approve sets status=approved, enqueues for autopost, and surfaces in the queue agenda', async () => {
    const env = mockEnv();
    const slug = 'cve-2026-1234-fortigate';
    // Approve the twitter copy with a due (past) scheduledAt.
    const approveRes = await app().request(
      `/api/v1/admin/social-schedule/${slug}/twitter/approve`,
      {
        method: 'POST',
        headers: { 'X-Admin-Token': 'sekret', 'content-type': 'application/json' },
        body: JSON.stringify({ scheduledAt: '2026-06-25T09:00:00Z' }),
      },
      env
    );
    expect(approveRes.status).toBe(200);
    const sched = JSON.parse(env.__store.get(`social-schedule:${slug}`) as string);
    expect(sched.twitter.status).toBe('approved');
    // Enqueued in the advisory autopost queue.
    const queue = JSON.parse(env.__store.get('social-autopost-queue') as string);
    expect(queue).toEqual([{ slug, platform: 'twitter' }]);
    // Agenda endpoint resolves the queue against the schedule.
    const agendaRes = await app().request(
      '/api/v1/admin/social-queue',
      { headers: { 'X-Admin-Token': 'sekret' } },
      env
    );
    const agenda = (await agendaRes.json()) as any;
    expect(agenda.autopostEnabled).toBe(false); // SOCIAL_AUTOPOST_ENABLED unset
    expect(agenda.queue[0]).toMatchObject({ slug, platform: 'twitter', status: 'approved' });
  });

  it('social unapprove reverts status to pending', async () => {
    const env = mockEnv();
    const slug = 'cve-2026-1234-fortigate';
    await app().request(
      `/api/v1/admin/social-schedule/${slug}/linkedin/approve`,
      { method: 'POST', headers: { 'X-Admin-Token': 'sekret' } },
      env
    );
    await app().request(
      `/api/v1/admin/social-schedule/${slug}/linkedin/unapprove`,
      { method: 'POST', headers: { 'X-Admin-Token': 'sekret' } },
      env
    );
    const sched = JSON.parse(env.__store.get(`social-schedule:${slug}`) as string);
    expect(sched.linkedin.status).toBe('pending');
  });

  it('skip removes a candidate', async () => {
    const env = mockEnv();
    env.__store.set(`candidates:cve:${cand.key}`, JSON.stringify(cand));
    const r = await app().request(
      `/api/v1/admin/candidates/${cand.key}/skip?type=cve`,
      {
        method: 'POST',
        headers: { 'X-Admin-Token': 'sekret' },
      },
      env
    );
    expect(r.status).toBe(200);
    expect(env.__store.has(`candidates:cve:${cand.key}`)).toBe(false);
  });

  it('skip writes a 30-day suppression record', async () => {
    const env = mockEnv();
    env.__store.set(`candidates:cve:${cand.key}`, JSON.stringify(cand));
    const r = await app().request(
      `/api/v1/admin/candidates/${cand.key}/skip?type=cve`,
      { method: 'POST', headers: { 'X-Admin-Token': 'sekret' } },
      env
    );
    expect(r.status).toBe(200);
    const dedup = JSON.parse(env.__store.get('meta:dedup-index') as string);
    expect(dedup[cand.key].suppressedUntil).toBeTruthy();
    expect(new Date(dedup[cand.key].suppressedUntil).getTime()).toBeGreaterThan(Date.now());
  });

  it('skip-all clears every pending candidate and suppresses them', async () => {
    const env = mockEnv();
    env.__store.set('candidates:cve:cve-1', JSON.stringify({ ...cand, key: 'cve-1' }));
    env.__store.set('candidates:actor:actor-1', JSON.stringify({ ...cand, key: 'actor-1', type: 'actor' }));
    const r = await app().request(
      '/api/v1/admin/candidates/skip-all',
      { method: 'POST', headers: { 'X-Admin-Token': 'sekret' } },
      env
    );
    expect(r.status).toBe(200);
    const body = (await r.json()) as any;
    expect(body.cleared).toBe(2);
    expect(env.__store.has('candidates:cve:cve-1')).toBe(false);
    expect(env.__store.has('candidates:actor:actor-1')).toBe(false);
    const dedup = JSON.parse(env.__store.get('meta:dedup-index') as string);
    expect(dedup['cve-1'].suppressedUntil).toBeTruthy();
    expect(dedup['actor-1'].suppressedUntil).toBeTruthy();
  });

  it('skip-all with ?type clears only that type', async () => {
    const env = mockEnv();
    env.__store.set('candidates:cve:cve-1', JSON.stringify({ ...cand, key: 'cve-1' }));
    env.__store.set('candidates:actor:actor-1', JSON.stringify({ ...cand, key: 'actor-1', type: 'actor' }));
    const r = await app().request(
      '/api/v1/admin/candidates/skip-all?type=cve',
      { method: 'POST', headers: { 'X-Admin-Token': 'sekret' } },
      env
    );
    expect(r.status).toBe(200);
    expect(((await r.json()) as any).cleared).toBe(1);
    expect(env.__store.has('candidates:cve:cve-1')).toBe(false);
    expect(env.__store.has('candidates:actor:actor-1')).toBe(true);
  });

  const hdr = { 'X-Admin-Token': 'sekret' };
  const jhdr = { 'X-Admin-Token': 'sekret', 'content-type': 'application/json' };
  const getSchedule = async (env: any) =>
    (await (await app().request('/api/v1/admin/schedule', { headers: hdr }, env)).json()) as any;

  it('publish-soon schedules an approved candidate due now, reschedule moves it', async () => {
    const env = mockEnv();
    env.__store.set('approved:cve-soon-1', JSON.stringify({ ...cand, key: 'cve-soon-1', status: 'approved' }));

    const soon = await app().request(
      '/api/v1/admin/approved/cve-soon-1/publish-soon',
      { method: 'POST', headers: hdr },
      env
    );
    expect(soon.status).toBe(200);
    let sched = await getSchedule(env);
    const slot = sched.schedule.find((s: any) => s.candidateId === 'cve-soon-1');
    expect(slot).toBeTruthy();
    expect(slot.status).toBe('pending');

    const r = await app().request(
      '/api/v1/admin/schedule/cve-soon-1/reschedule',
      { method: 'POST', headers: jhdr, body: JSON.stringify({ slotAt: '2030-01-01T10:00:00.000Z' }) },
      env
    );
    expect(r.status).toBe(200);
    sched = await getSchedule(env);
    expect(sched.schedule.find((s: any) => s.candidateId === 'cve-soon-1').slotAt).toBe('2030-01-01T10:00:00.000Z');
  });

  it('publish-soon 404s an unknown approved candidate', async () => {
    const env = mockEnv();
    const r = await app().request('/api/v1/admin/approved/nope/publish-soon', { method: 'POST', headers: hdr }, env);
    expect(r.status).toBe(404);
  });

  it('reschedule rejects an invalid slotAt with 400', async () => {
    const env = mockEnv();
    const r = await app().request(
      '/api/v1/admin/schedule/whatever/reschedule',
      { method: 'POST', headers: jhdr, body: JSON.stringify({ slotAt: 'not-a-date' }) },
      env
    );
    expect(r.status).toBe(400);
  });

  it('reschedule 404s an unknown slot', async () => {
    const env = mockEnv();
    const r = await app().request(
      '/api/v1/admin/schedule/no-such-slot/reschedule',
      { method: 'POST', headers: jhdr, body: JSON.stringify({ slotAt: '2030-01-01T10:00:00.000Z' }) },
      env
    );
    expect(r.status).toBe(404);
  });

  it('social-schedule: upsert a planned time then mark posted', async () => {
    const env = mockEnv();
    // Unscheduled → null
    let r = await app().request('/api/v1/admin/social-schedule/my-post-1', { headers: hdr }, env);
    expect(r.status).toBe(200);
    expect(((await r.json()) as any).schedule).toBeNull();

    // Plan a twitter time
    r = await app().request(
      '/api/v1/admin/social-schedule/my-post-1/twitter',
      { method: 'POST', headers: jhdr, body: JSON.stringify({ scheduledAt: '2026-06-10T09:00:00.000Z' }) },
      env
    );
    expect(r.status).toBe(200);
    expect(((await r.json()) as any).schedule.twitter.scheduledAt).toBe('2026-06-10T09:00:00.000Z');

    // Mark linkedin posted (independent of twitter)
    r = await app().request(
      '/api/v1/admin/social-schedule/my-post-1/linkedin/mark-posted',
      { method: 'POST', headers: hdr },
      env
    );
    expect(r.status).toBe(200);
    const body = ((await r.json()) as any).schedule;
    expect(body.linkedin.status).toBe('posted');
    expect(body.twitter.scheduledAt).toBe('2026-06-10T09:00:00.000Z'); // unchanged
  });

  it('schedule self-heals a published slot whose post was removed (1 list, not N gets)', async () => {
    const env = mockEnv();
    env.__store.set(
      'schedule:upcoming',
      JSON.stringify([
        { candidateId: 'gone', slotAt: '2026-06-01T00:00:00.000Z', status: 'published', publishedSlug: 'gone-slug' },
        { candidateId: 'live', slotAt: '2026-06-02T00:00:00.000Z', status: 'published', publishedSlug: 'live-slug' },
      ])
    );
    env.__store.set('posts:live-slug', JSON.stringify({ slug: 'live-slug' }));
    const r = await app().request('/api/v1/admin/schedule', { headers: hdr }, env);
    expect(r.status).toBe(200);
    const sched = ((await r.json()) as any).schedule;
    expect(sched.find((s: any) => s.candidateId === 'gone').status).toBe('pending');
    expect(sched.find((s: any) => s.candidateId === 'live').status).toBe('published');
  });

  it('social-index reports per-platform presence from one list (no per-post fan-out)', async () => {
    const env = mockEnv();
    env.__store.set('social:post-a', JSON.stringify({ slug: 'post-a', twitter: 't', linkedin: 'l', generatedAt: '' }));
    env.__store.set('social:post-b:twitter', 'just twitter');
    const r = await app().request('/api/v1/admin/social-index', { headers: hdr }, env);
    expect(r.status).toBe(200);
    const idx = ((await r.json()) as any).index;
    expect(idx['post-a']).toEqual({ twitter: true, linkedin: true });
    expect(idx['post-b']).toEqual({ twitter: true, linkedin: false });
  });

  it('social-schedule: rejects an unknown platform with 400', async () => {
    const env = mockEnv();
    const r = await app().request(
      '/api/v1/admin/social-schedule/my-post-1/mastodon',
      { method: 'POST', headers: jhdr, body: JSON.stringify({ status: 'posted' }) },
      env
    );
    expect(r.status).toBe(400);
  });

  // ─── Carousel slide PNG render route ─────────────────────────────────

  it('carousel PNG: returns 200 image/png with PNG magic byte for valid slug+index', async () => {
    const env = mockEnv();
    // Seed a SocialContent with a 3-slide carousel under the social:<slug> KV key
    const socialContent = {
      slug: 'test-post',
      twitter: '',
      linkedin: '',
      generatedAt: '2026-06-24T00:00:00Z',
      carousel: {
        format: 'instagram',
        slides: [
          { index: 0, headline: 'Hook slide headline' },
          { index: 1, headline: 'Content slide', body: 'Body text' },
          { index: 2, headline: 'Call to action', kind: 'cta' },
        ],
      },
    };
    env.__store.set('social:test-post', JSON.stringify(socialContent));

    const r = await app().request('/api/v1/admin/social/carousel/test-post/0.png', { headers: hdr }, env);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('image/png');
    const body = new Uint8Array(await r.arrayBuffer());
    // PNG magic byte
    expect(body[0]).toBe(0x89);
  });

  it('carousel PNG: returns 404 for an out-of-range slide index', async () => {
    const env = mockEnv();
    const socialContent = {
      slug: 'test-post-2',
      twitter: '',
      linkedin: '',
      generatedAt: '2026-06-24T00:00:00Z',
      carousel: {
        format: 'instagram',
        slides: [{ index: 0, headline: 'Only slide' }],
      },
    };
    env.__store.set('social:test-post-2', JSON.stringify(socialContent));

    const r = await app().request('/api/v1/admin/social/carousel/test-post-2/99.png', { headers: hdr }, env);
    expect(r.status).toBe(404);
  });
});
