import { Hono } from 'hono';
import type { Env } from '../../env';
import { getAi } from '../../lib/ai-binding';
import { safeJsonBody } from '../../lib/safe-body';
import { getDedup, touchDedup } from '../../case-study/storage/dedup';
import { unapprove, getApproved } from '../../case-study/storage/approved';
import { getSchedule, setSchedule, markSlotStatus, removeSlot } from '../../case-study/storage/schedule';
import { putPost } from '../../case-study/storage/posts';
import { renderRss } from '../../case-study/rendering/rss';
import { getSiteUrl } from '../../lib/site-config';
import { kv as csKvKeys } from '../../case-study/kv-keys';
import { generatePost } from '../../case-study/generation';
import { generateSocialForPost, type CaseStudyEnv } from '../../case-study/run';
import { notifyPublished, type WebhookEnv } from '../../case-study/notifications';

export const scheduleRouter = new Hono<{ Bindings: Env }>();

scheduleRouter.get('/schedule', async (c) => {
  const ns = c.env.CASE_STUDIES;
  const schedule = await getSchedule(ns);
  const hasPublished = schedule.some((s) => s.status === 'published' && s.publishedSlug);
  let updated = schedule;
  if (hasPublished) {
    const live = new Set<string>();
    let cursor: string | undefined;
    for (let page = 0; page < 5; page += 1) {
      const res = await ns.list({ prefix: 'posts:', cursor });
      for (const k of res.keys) live.add(k.name);
      if (res.list_complete) break;
      cursor = res.cursor;
    }
    updated = schedule.map((s) =>
      s.status === 'published' && s.publishedSlug && !live.has(csKvKeys.post(s.publishedSlug))
        ? { ...s, status: 'pending' as const, publishedSlug: undefined }
        : s
    );
    const changed = updated.some((s, i) => s.status !== schedule[i]?.status);
    if (changed) await setSchedule(ns, updated);
  }
  return c.json({ schedule: updated });
});

scheduleRouter.post('/schedule/:candidateId/publish-now', async (c) => {
  const candidateId = c.req.param('candidateId');
  const schedule = await getSchedule(c.env.CASE_STUDIES);
  const slot = schedule.find((s) => s.candidateId === candidateId);
  if (!slot) return c.json({ error: 'slot not found' }, 404);
  if (slot.status !== 'pending') return c.json({ error: `slot status is ${slot.status}, not pending` }, 400);

  const candidate = await getApproved(c.env.CASE_STUDIES, candidateId);
  if (!candidate) {
    const dedup = await getDedup(c.env.CASE_STUDIES, candidateId);
    if (dedup?.publishedSlug) {
      await markSlotStatus(c.env.CASE_STUDIES, candidateId, 'published', { publishedSlug: dedup.publishedSlug });
      return c.json({ ok: true, slug: dedup.publishedSlug, title: dedup.publishedSlug });
    }
    return c.json({ error: 'approved candidate not found' }, 404);
  }

  const now = new Date();
  try {
    const post = await generatePost({
      candidate,
      ai: getAi(c.env),
      now,
      groqKey: c.env.GROQ_API_KEY,
      googleKey: c.env.GOOGLE_AI_STUDIO_API_KEY,
      nvidiaKey: c.env.NVIDIA_API_KEY as string | undefined,
    });
    const postIndex = await putPost(c.env.CASE_STUDIES, post);

    const rss = renderRss(postIndex, { siteUrl: getSiteUrl(c.env) });
    await c.env.CASE_STUDIES.put(csKvKeys.metaRss, rss);

    await markSlotStatus(c.env.CASE_STUDIES, candidateId, 'published', { publishedSlug: post.slug });
    await unapprove(c.env.CASE_STUDIES, candidate.key);
    await touchDedup(c.env.CASE_STUDIES, candidate.key, now, post.slug);

    generateSocialForPost(post.slug, c.env as unknown as CaseStudyEnv, now).catch((err) =>
      console.error('auto-social failed:', err)
    );

    notifyPublished(c.env as unknown as WebhookEnv, post.slug, post.title, post.type).catch((err) =>
      console.error('notifyPublished failed:', err)
    );

    return c.json({ ok: true, slug: post.slug, title: post.title });
  } catch (err) {
    console.error('schedule-publish-now failed:', err);
    return c.json({ error: 'publish_failed' }, 500);
  }
});

scheduleRouter.post('/schedule/:candidateId/remove', async (c) => {
  await removeSlot(c.env.CASE_STUDIES, c.req.param('candidateId'));
  return c.json({ ok: true });
});

scheduleRouter.post('/schedule/:candidateId/reschedule', async (c) => {
  const candidateId = c.req.param('candidateId');
  const parsed = await safeJsonBody<{ slotAt?: string }>(c, { maxBytes: 1024 });
  if ('error' in parsed) return parsed.error;
  const slotAt = parsed.value?.slotAt;
  if (!slotAt || Number.isNaN(Date.parse(slotAt))) {
    return c.json({ error: 'valid slotAt (ISO 8601) required' }, 400);
  }
  const schedule = await getSchedule(c.env.CASE_STUDIES);
  const slot = schedule.find((s) => s.candidateId === candidateId);
  if (!slot) return c.json({ error: 'slot not found' }, 404);
  if (slot.status === 'published' || slot.status === 'draft' || slot.status === 'publishing') {
    return c.json({ error: `cannot reschedule a ${slot.status} slot` }, 400);
  }
  const iso = new Date(slotAt).toISOString();
  await markSlotStatus(c.env.CASE_STUDIES, candidateId, 'pending', { slotAt: iso, error: undefined });
  return c.json({ ok: true, candidateId, slotAt: iso });
});
