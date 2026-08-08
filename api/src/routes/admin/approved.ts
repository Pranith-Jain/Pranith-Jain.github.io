import { Hono } from 'hono';
import type { Env } from '../../env';
import { logError } from '../../lib/logger';
import { notFound, internalError } from '../../lib/api-error';
import { getAi } from '../../lib/ai-binding';
import { unapprove, listApproved, getApproved } from '../../case-study/storage/approved';
import { touchDedup } from '../../case-study/storage/dedup';
import { removeSlot, getSchedule, setSchedule, markSlotStatus } from '../../case-study/storage/schedule';
import { putPost } from '../../case-study/storage/posts';
import { renderRss } from '../../case-study/rendering/rss';
import { getSiteUrl } from '../../lib/site-config';
import { kv as csKvKeys } from '../../case-study/kv-keys';
import { generatePost } from '../../case-study/generation';
import { generateSocialForPost, type CaseStudyEnv } from '../../case-study/run';

export const approvedRouter = new Hono<{ Bindings: Env }>();

approvedRouter.get('/approved', async (c) => {
  return c.json({ approved: await listApproved(c.env.CASE_STUDIES) });
});

approvedRouter.post('/approved/:id/unapprove', async (c) => {
  const id = c.req.param('id');
  await unapprove(c.env.CASE_STUDIES, id);
  // If a schedule slot still references this candidate, drop it too —
  // otherwise the publisher cron will find a pending slot with no
  // approved row and treat it as a failure.
  await removeSlot(c.env.CASE_STUDIES, id);
  return c.json({ ok: true });
});

// ─── Schedule an approved candidate "due now" (publisher cron owns the publish) ─
// Unlike publish-now (which generates + publishes immediately), publish-soon just
// drops a pending slot into the schedule timestamped `now`, so the publisher's
// next hourly run picks it up. Re-running for a candidate already in the schedule
// bumps its slotAt to now and resets any failed/draft status.
approvedRouter.post('/approved/:id/publish-soon', async (c) => {
  const id = c.req.param('id');
  const candidate = await getApproved(c.env.CASE_STUDIES, id);
  if (!candidate) return notFound(c, `approved candidate not found: ${id}`);

  const ns = c.env.CASE_STUDIES;
  const now = new Date().toISOString();
  const schedule = await getSchedule(ns);
  if (schedule.some((s) => s.candidateId === id)) {
    await markSlotStatus(ns, id, 'pending', { slotAt: now, error: undefined });
  } else {
    await setSchedule(ns, [...schedule, { candidateId: id, status: 'pending', slotAt: now }]);
  }
  return c.json({ ok: true, candidateId: id, slotAt: now });
});

// ─── Publish an approved candidate immediately (skip the schedule) ──────
approvedRouter.post('/approved/:id/publish-now', async (c) => {
  const id = c.req.param('id');
  const candidate = await getApproved(c.env.CASE_STUDIES, id);
  if (!candidate) return notFound(c, `approved candidate not found: ${id}`);

  const env = c.env as unknown as CaseStudyEnv;
  const now = new Date();

  try {
    const post = await generatePost({
      candidate,
      ai: getAi(c.env),
      now,
      groqKey: c.env.GROQ_API_KEY,
      googleKey: c.env.GOOGLE_AI_STUDIO_API_KEY,
      nvidiaKey: c.env.NVIDIA_API_KEY as string | undefined,
      infronKey: c.env.INFRON_API_KEY,
    });
    const postIndex = await putPost(c.env.CASE_STUDIES, post);

    // RSS only needs index-level fields; reuse the index putPost just wrote
    // instead of re-reading posts:index from KV.
    const rss = renderRss(postIndex, { siteUrl: getSiteUrl(c.env) });
    await c.env.CASE_STUDIES.put(csKvKeys.metaRss, rss);

    await unapprove(c.env.CASE_STUDIES, candidate.key);
    await touchDedup(env.CASE_STUDIES, candidate.key, now, post.slug);

    generateSocialForPost(post.slug, c.env as unknown as CaseStudyEnv, now).catch((err) =>
      logError('auto-social failed', err)
    );

    return c.json({ ok: true, slug: post.slug, title: post.title });
  } catch (err) {
    logError('publish-now failed:', err);
    return internalError(c, 'publish_failed');
  }
});
