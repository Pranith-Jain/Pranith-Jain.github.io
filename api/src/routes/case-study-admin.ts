import { Hono } from 'hono';
import type { Env } from '../env';
import type { Candidate, CaseStudyType } from '../case-study/types';
import { requireAdminToken } from '../case-study/auth';
import { listCandidates, getCandidate, deleteCandidate } from '../case-study/storage/candidates';
import { approve, unapprove, listApproved } from '../case-study/storage/approved';
import { getSchedule } from '../case-study/storage/schedule';
import { listPostIndex, removePost } from '../case-study/storage/posts';
import { listFailures } from '../case-study/storage/failed';

const TYPES: CaseStudyType[] = ['cve', 'actor', 'malware', 'ransom'];

export function registerAdminRoutes(app: Hono<{ Bindings: Env }>): void {
  // Sub-app pattern: middleware applies only to /api/v1/admin/*, not globally.
  const admin = new Hono<{ Bindings: Env }>();
  admin.use('*', requireAdminToken);

  admin.get('/candidates', async (c) => {
    const all: Candidate[] = [];
    for (const t of TYPES) all.push(...(await listCandidates(c.env.CASE_STUDIES, t)));
    all.sort((a, b) => b.score - a.score);
    return c.json({ pending: all });
  });

  admin.post('/candidates/:id/approve', async (c) => {
    const id = c.req.param('id');
    let found: Candidate | null = null;
    let foundType: CaseStudyType | null = null;
    for (const t of TYPES) {
      const cand = await getCandidate(c.env.CASE_STUDIES, t, id);
      if (cand) {
        found = cand;
        foundType = t;
        break;
      }
    }
    if (!found || !foundType) return c.json({ error: 'not found' }, 404);
    await approve(c.env.CASE_STUDIES, found);
    await deleteCandidate(c.env.CASE_STUDIES, foundType, id);
    return c.json({ ok: true, approved: id });
  });

  admin.post('/candidates/:id/skip', async (c) => {
    const id = c.req.param('id');
    const type = (c.req.query('type') ?? '') as CaseStudyType;
    if (!TYPES.includes(type)) return c.json({ error: 'type required' }, 400);
    await deleteCandidate(c.env.CASE_STUDIES, type, id);
    return c.json({ ok: true });
  });

  admin.get('/approved', async (c) => {
    return c.json({ approved: await listApproved(c.env.CASE_STUDIES) });
  });

  admin.post('/approved/:id/unapprove', async (c) => {
    await unapprove(c.env.CASE_STUDIES, c.req.param('id'));
    return c.json({ ok: true });
  });

  admin.get('/schedule', async (c) => {
    return c.json({ schedule: await getSchedule(c.env.CASE_STUDIES) });
  });

  admin.get('/posts', async (c) => {
    return c.json({ posts: await listPostIndex(c.env.CASE_STUDIES) });
  });

  admin.post('/posts/:slug/unpublish', async (c) => {
    await removePost(c.env.CASE_STUDIES, c.req.param('slug'));
    return c.json({ ok: true });
  });

  admin.get('/failures', async (c) => {
    return c.json({ failures: await listFailures(c.env.CASE_STUDIES) });
  });

  admin.get('/health', async (c) => {
    const pending: Candidate[] = [];
    for (const t of TYPES) pending.push(...(await listCandidates(c.env.CASE_STUDIES, t)));
    return c.json({
      pendingCount: pending.length,
      approvedCount: (await listApproved(c.env.CASE_STUDIES)).length,
      scheduleCount: (await getSchedule(c.env.CASE_STUDIES)).length,
      failureCount: (await listFailures(c.env.CASE_STUDIES)).length,
      postsCount: (await listPostIndex(c.env.CASE_STUDIES)).length,
    });
  });

  // Mount sub-app under /api/v1/admin
  app.route('/api/v1/admin', admin);
}
