import { Hono } from 'hono';
import type { Env } from '../env';
import type { Candidate, CaseStudyType, Post, PostIOC, PostSource, SocialContent } from '../case-study/types';
import { requireAdminToken } from '../case-study/auth';
import { listCandidates, getCandidate, deleteCandidate } from '../case-study/storage/candidates';
import { approve, unapprove, listApproved, getApproved } from '../case-study/storage/approved';
import { getSchedule, setSchedule, markSlotStatus, removeSlot } from '../case-study/storage/schedule';
import { putPost, listPostIndex, removePost } from '../case-study/storage/posts';
import { listFailures } from '../case-study/storage/failed';
import { runDiscoveryNow, runPlannerNow, runPublisherNow, type CaseStudyEnv } from '../case-study/run';
import { renderRss } from '../case-study/rendering/rss';
import { SITE_URL } from '../case-study/config';
import { kv as csKvKeys } from '../case-study/kv-keys';
import { generatePost } from '../case-study/generation';
import {
  generateSocialContent,
  generateTwitterContent,
  generateLinkedinContent,
} from '../case-study/generation/social';

const TYPES: CaseStudyType[] = [
  'cve',
  'actor',
  'malware',
  'ransom',
  'breach',
  'scam',
  'aisec',
  'intel',
  'osint',
  'methodology',
  'trend',
  'briefing',
];

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

  // Manual pipeline trigger — the cron-only stages (discover daily,
  // plan weekly, publish hourly) gate the queue by up to a day each.
  // This lets an admin drive any stage on demand.
  admin.post('/run/:stage', async (c) => {
    const stage = c.req.param('stage');
    const env = c.env as unknown as CaseStudyEnv;
    const now = new Date();
    try {
      if (stage === 'discover') {
        return c.json({ ok: true, stage, result: await runDiscoveryNow(env, now) });
      }
      if (stage === 'plan') {
        return c.json({ ok: true, stage, result: (await runPlannerNow(env, now)) ?? null });
      }
      if (stage === 'publish') {
        return c.json({ ok: true, stage, result: (await runPublisherNow(env, now)) ?? null });
      }
      return c.json({ error: 'unknown_stage', allowed: ['discover', 'plan', 'publish'] }, 400);
    } catch (err) {
      console.error('case-study run failed:', err);
      return c.json({ error: 'run_failed', stage }, 500);
    }
  });

  admin.get('/approved', async (c) => {
    return c.json({ approved: await listApproved(c.env.CASE_STUDIES) });
  });

  admin.post('/approved/:id/unapprove', async (c) => {
    await unapprove(c.env.CASE_STUDIES, c.req.param('id'));
    return c.json({ ok: true });
  });

  admin.get('/schedule', async (c) => {
    const schedule = await getSchedule(c.env.CASE_STUDIES);
    // Verify published slugs still exist and mark stale slots as pending
    const updated = await Promise.all(
      schedule.map(async (s) => {
        if (s.status === 'published' && s.publishedSlug) {
          const post = await c.env.CASE_STUDIES.get(csKvKeys.post(s.publishedSlug), 'json');
          if (!post) return { ...s, status: 'pending' as const, publishedSlug: undefined };
        }
        return s;
      })
    );
    const changed = updated.some((s, i) => s.status !== schedule[i].status);
    if (changed) await setSchedule(c.env.CASE_STUDIES, updated);
    return c.json({ schedule: updated });
  });

  // ─── Publish a scheduled slot immediately (before its due time) ───────
  admin.post('/schedule/:candidateId/publish-now', async (c) => {
    const candidateId = c.req.param('candidateId');
    const schedule = await getSchedule(c.env.CASE_STUDIES);
    const slot = schedule.find((s) => s.candidateId === candidateId);
    if (!slot) return c.json({ error: 'slot not found' }, 404);
    if (slot.status !== 'pending') return c.json({ error: `slot status is ${slot.status}, not pending` }, 400);

    const candidate = await getApproved(c.env.CASE_STUDIES, candidateId);
    if (!candidate) {
      // Already published via approved/publish-now; sync the slot
      const dedup = await c.env.CASE_STUDIES.get<{ lastSeenAt: string; publishedSlug?: string }>(
        csKvKeys.dedup(candidateId),
        'json'
      );
      if (dedup?.publishedSlug) {
        await markSlotStatus(c.env.CASE_STUDIES, candidateId, 'published', { publishedSlug: dedup.publishedSlug });
        return c.json({ ok: true, slug: dedup.publishedSlug, title: dedup.publishedSlug });
      }
      return c.json({ error: 'approved candidate not found' }, 404);
    }

    const now = new Date();
    try {
      const post = await generatePost({ candidate, ai: c.env.AI as never, now });
      await putPost(c.env.CASE_STUDIES, post);

      // RSS only needs index-level fields — render straight from the posts
      // index (1 KV read) instead of fan-out-reading every full post.
      const rss = renderRss(await listPostIndex(c.env.CASE_STUDIES), { siteUrl: SITE_URL });
      await c.env.CASE_STUDIES.put(csKvKeys.metaRss, rss);

      await markSlotStatus(c.env.CASE_STUDIES, candidateId, 'published', { publishedSlug: post.slug });
      await unapprove(c.env.CASE_STUDIES, candidate.key);
      await c.env.CASE_STUDIES.put(
        csKvKeys.dedup(candidate.key),
        JSON.stringify({ lastSeenAt: now.toISOString(), publishedSlug: post.slug })
      );

      return c.json({ ok: true, slug: post.slug, title: post.title });
    } catch (err) {
      console.error('schedule-publish-now failed:', err);
      return c.json({ error: 'publish_failed', message: String(err) }, 500);
    }
  });

  admin.post('/schedule/:candidateId/remove', async (c) => {
    await removeSlot(c.env.CASE_STUDIES, c.req.param('candidateId'));
    return c.json({ ok: true });
  });

  admin.get('/posts', async (c) => {
    return c.json({ posts: await listPostIndex(c.env.CASE_STUDIES) });
  });

  admin.post('/posts/:slug/unpublish', async (c) => {
    const slug = c.req.param('slug');
    await removePost(c.env.CASE_STUDIES, slug);
    // Clean up schedule slots referencing this slug
    const schedule = await getSchedule(c.env.CASE_STUDIES);
    const updated = schedule.map((s) =>
      s.publishedSlug === slug ? { ...s, status: 'pending' as const, publishedSlug: undefined } : s
    );
    if (updated.some((s, i) => s.status !== schedule[i].status)) {
      await setSchedule(c.env.CASE_STUDIES, updated);
    }
    return c.json({ ok: true });
  });

  admin.get('/failures', async (c) => {
    return c.json({ failures: await listFailures(c.env.CASE_STUDIES) });
  });

  // ─── Manual post creation ───────────────────────────────────────────────
  // Bypasses the entire discovery → approve → plan → publish pipeline.
  // Accepts user-written markdown and publishes it immediately.
  admin.post('/posts/manual', async (c) => {
    const { type, title, body, tags, sources, iocs } = await c.req.json<{
      type: CaseStudyType;
      title: string;
      body: string;
      tags?: string[];
      sources?: PostSource[];
      iocs?: PostIOC[];
    }>();

    if (!TYPES.includes(type)) return c.json({ error: 'invalid type' }, 400);
    if (!title || !body) return c.json({ error: 'title and body required' }, 400);

    const slug = title
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80);

    const now = new Date().toISOString();
    const post: Post = {
      slug,
      type,
      title,
      excerpt: body
        .replace(/^##.*$/gm, '')
        .replace(/[`*_>#-]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200),
      publishedAt: now,
      candidateId: `manual-${slug}`,
      body,
      hero: '',
      iocs: iocs ?? [],
      tags: tags ?? [type],
      sources: sources ?? [],
    };

    await putPost(c.env.CASE_STUDIES, post);

    // RSS only needs index-level fields — render straight from the posts
    // index (1 KV read) instead of fan-out-reading every full post.
    const rss = renderRss(await listPostIndex(c.env.CASE_STUDIES), { siteUrl: SITE_URL });
    await c.env.CASE_STUDIES.put(csKvKeys.metaRss, rss);

    return c.json({ ok: true, slug });
  });

  // ─── Publish an approved candidate immediately (skip the schedule) ──────
  admin.post('/approved/:id/publish-now', async (c) => {
    const id = c.req.param('id');
    const candidate = await getApproved(c.env.CASE_STUDIES, id);
    if (!candidate) return c.json({ error: 'approved candidate not found' }, 404);

    const env = c.env as unknown as CaseStudyEnv;
    const now = new Date();

    try {
      const post = await generatePost({ candidate, ai: c.env.AI as never, now });
      await putPost(c.env.CASE_STUDIES, post);

      // RSS only needs index-level fields — render straight from the posts
      // index (1 KV read) instead of fan-out-reading every full post.
      const rss = renderRss(await listPostIndex(c.env.CASE_STUDIES), { siteUrl: SITE_URL });
      await c.env.CASE_STUDIES.put(csKvKeys.metaRss, rss);

      await unapprove(c.env.CASE_STUDIES, candidate.key);
      await env.CASE_STUDIES.put(
        csKvKeys.dedup(candidate.key),
        JSON.stringify({ lastSeenAt: now.toISOString(), publishedSlug: post.slug })
      );

      return c.json({ ok: true, slug: post.slug, title: post.title });
    } catch (err) {
      console.error('publish-now failed:', err);
      return c.json({ error: 'publish_failed', message: String(err) }, 500);
    }
  });

  // ─── Social content generation (combined Twitter + LinkedIn) ──────────
  admin.post('/social/:slug', async (c) => {
    const slug = c.req.param('slug');
    const post = await c.env.CASE_STUDIES.get<Post>(csKvKeys.post(slug), 'json');
    if (!post) return c.json({ error: 'post not found' }, 404);

    try {
      const social = await generateSocialContent(post, c.env.AI as never, new Date());
      await c.env.CASE_STUDIES.put(csKvKeys.social(slug), JSON.stringify(social));
      return c.json({ ok: true, social });
    } catch (err) {
      console.error('social generation failed:', err);
      return c.json({ error: 'social_generation_failed', message: String(err) }, 500);
    }
  });

  admin.get('/social/:slug', async (c) => {
    const slug = c.req.param('slug');
    const [combined, twitter, linkedin] = await Promise.all([
      c.env.CASE_STUDIES.get<SocialContent>(csKvKeys.social(slug), 'json'),
      c.env.CASE_STUDIES.get<string>(csKvKeys.socialTwitter(slug)),
      c.env.CASE_STUDIES.get<string>(csKvKeys.socialLinkedin(slug)),
    ]);
    // Merge: prefer individual platform content over combined
    const social: SocialContent = {
      slug,
      twitter: twitter ?? combined?.twitter ?? '',
      linkedin: linkedin ?? combined?.linkedin ?? '',
      generatedAt: combined?.generatedAt ?? new Date().toISOString(),
    };
    if (!social.twitter && !social.linkedin) return c.json({ error: 'not found' }, 404);
    return c.json({ ok: true, social });
  });

  admin.delete('/social/:slug', async (c) => {
    await Promise.all([
      c.env.CASE_STUDIES.delete(csKvKeys.social(c.req.param('slug'))),
      c.env.CASE_STUDIES.delete(csKvKeys.socialTwitter(c.req.param('slug'))),
      c.env.CASE_STUDIES.delete(csKvKeys.socialLinkedin(c.req.param('slug'))),
    ]);
    return c.json({ ok: true });
  });

  // ─── Individual social platform generation ────────────────────────────
  admin.post('/social/:slug/twitter', async (c) => {
    const slug = c.req.param('slug');
    const post = await c.env.CASE_STUDIES.get<Post>(csKvKeys.post(slug), 'json');
    if (!post) return c.json({ error: 'post not found' }, 404);

    try {
      const { twitter, generatedAt } = await generateTwitterContent(post, c.env.AI as never, new Date());
      await c.env.CASE_STUDIES.put(csKvKeys.socialTwitter(slug), twitter);
      return c.json({ ok: true, platform: 'twitter', content: twitter, generatedAt });
    } catch (err) {
      console.error('twitter generation failed:', err);
      return c.json({ error: 'twitter_generation_failed', message: String(err) }, 500);
    }
  });

  admin.post('/social/:slug/linkedin', async (c) => {
    const slug = c.req.param('slug');
    const post = await c.env.CASE_STUDIES.get<Post>(csKvKeys.post(slug), 'json');
    if (!post) return c.json({ error: 'post not found' }, 404);

    try {
      const { linkedin, generatedAt } = await generateLinkedinContent(post, c.env.AI as never, new Date());
      await c.env.CASE_STUDIES.put(csKvKeys.socialLinkedin(slug), linkedin);
      return c.json({ ok: true, platform: 'linkedin', content: linkedin, generatedAt });
    } catch (err) {
      console.error('linkedin generation failed:', err);
      return c.json({ error: 'linkedin_generation_failed', message: String(err) }, 500);
    }
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
