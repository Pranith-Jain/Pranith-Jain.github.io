import { Hono } from 'hono';
import type { Env } from '../env';
import type { Candidate, CaseStudyType, Post, PostIOC, PostSource, SocialContent } from '../case-study/types';
import { requireAdminMiddleware } from '../lib/admin-auth';
import { safeJsonBody } from '../lib/safe-body';
import { listAllCandidates, getCandidate, deleteCandidate } from '../case-study/storage/candidates';
import { countByPrefix } from '../case-study/storage/kv-util';
import { getDedup, touchDedup, suppressDedupMany } from '../case-study/storage/dedup';
import {
  getSocialSchedule,
  upsertSocialSchedule,
  markSocialPosted,
  isSocialPlatform,
} from '../case-study/storage/social-schedule';
import { approve, unapprove, listApproved, getApproved } from '../case-study/storage/approved';
import { getSchedule, setSchedule, markSlotStatus, removeSlot } from '../case-study/storage/schedule';
import { putPost, listPostIndex, removePost } from '../case-study/storage/posts';
import { listDraftIndex, getDraft, approveDraft, rejectDraft } from '../case-study/storage/drafts';
import { renderMarkdown } from '../case-study/rendering/markdown';
import { listFailures, deleteFailure, clearFailures } from '../case-study/storage/failed';
import { runDiscoveryNow, runPlannerNow, runPublisherNow, type CaseStudyEnv } from '../case-study/run';
import { runTelegramArchive } from './telegram-archive';
import { renderRss } from '../case-study/rendering/rss';
import { getSiteUrl } from '../lib/site-config';
import { kv as csKvKeys } from '../case-study/kv-keys';
import { generatePost } from '../case-study/generation';
import {
  generateSocialContent,
  generateTwitterContent,
  generateLinkedinContent,
} from '../case-study/generation/social';

/**
 * Slug validator shared with blog-public.ts — same regex, same reasoning.
 * Admin routes also use it to refuse path-segments like `../foo` or `index`
 * before constructing a KV key like `social:${slug}`. The admin gate runs
 * first so a non-admin can't probe it, but defence-in-depth catches the
 * leaked-token + path-traversal case.
 */
const SLUG_RE = /^[a-z0-9-]+$/;
function validSlug(slug: string | undefined): slug is string {
  return !!slug && slug.length <= 200 && slug !== 'index' && SLUG_RE.test(slug);
}

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
  admin.use('*', requireAdminMiddleware);

  admin.get('/candidates', async (c) => {
    // One KV.list across all types instead of 12 per-type list ops.
    const all = await listAllCandidates(c.env.CASE_STUDIES);
    all.sort((a, b) => b.score - a.score);
    return c.json({ pending: all });
  });

  admin.post('/candidates/:id/approve', async (c) => {
    const id = c.req.param('id');
    // `type` is optional but recommended — without it we first-match across
    // every type bucket, which can pick the wrong row when candidate IDs
    // collide (rare but real for CVE-prefixed keys reused across buckets).
    const typeHint = (c.req.query('type') ?? '') as CaseStudyType | '';
    let found: Candidate | null = null;
    let foundType: CaseStudyType | null = null;
    if (typeHint && TYPES.includes(typeHint as CaseStudyType)) {
      const cand = await getCandidate(c.env.CASE_STUDIES, typeHint as CaseStudyType, id);
      if (cand) {
        found = cand;
        foundType = typeHint as CaseStudyType;
      }
    } else {
      for (const t of TYPES) {
        const cand = await getCandidate(c.env.CASE_STUDIES, t, id);
        if (cand) {
          found = cand;
          foundType = t;
          break;
        }
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
    // Suppress for 30 days so the next discovery run does not re-surface
    // the exact item the admin just rejected.
    const until = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    await suppressDedupMany(c.env.CASE_STUDIES, [id], until);
    return c.json({ ok: true });
  });

  // Bulk dismiss: clear the whole pending queue (or one type) in one action,
  // suppressing each for 30 days so they don't immediately re-appear. One
  // KV.list + N deletes + ONE batched dedup write (subrequest-budget aware).
  admin.post('/candidates/skip-all', async (c) => {
    const typeHint = (c.req.query('type') ?? '') as CaseStudyType | '';
    const filterType = typeHint && TYPES.includes(typeHint as CaseStudyType) ? (typeHint as CaseStudyType) : null;
    const ns = c.env.CASE_STUDIES;
    // List KEY NAMES only (no per-candidate body reads) and parse the stable
    // key from the `candidates:<type>:<stableKey>` name — stable keys are
    // slugified (no colons), so split(':') is safe. Keeps this to 1 list +
    // N deletes + 1 batched suppress (≈ the existing GET /candidates cost),
    // respecting the Free-plan 50-subrequests/invocation budget.
    const prefix = filterType ? csKvKeys.candidatesPrefix(filterType) : csKvKeys.candidatesAllPrefix;
    const stableKeys: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 5; page += 1) {
      const res = await ns.list({ prefix, cursor });
      for (const k of res.keys) {
        await ns.delete(k.name);
        const parts = k.name.split(':'); // candidates:<type>:<stableKey>
        if (parts.length >= 3) stableKeys.push(parts.slice(2).join(':'));
      }
      if (res.list_complete) break;
      cursor = res.cursor;
    }
    const until = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    await suppressDedupMany(ns, stableKeys, until);
    return c.json({ ok: true, cleared: stableKeys.length });
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
      if (stage === 'telegram-archive') {
        return c.json({ ok: true, stage, result: await runTelegramArchive(c.env) });
      }
      return c.json({ error: 'unknown_stage', allowed: ['discover', 'plan', 'publish', 'telegram-archive'] }, 400);
    } catch (err) {
      console.error('case-study run failed:', err);
      return c.json({ error: 'run_failed', stage }, 500);
    }
  });

  admin.get('/approved', async (c) => {
    return c.json({ approved: await listApproved(c.env.CASE_STUDIES) });
  });

  admin.post('/approved/:id/unapprove', async (c) => {
    const id = c.req.param('id');
    await unapprove(c.env.CASE_STUDIES, id);
    // If a schedule slot still references this candidate, drop it too —
    // otherwise the publisher cron will find a pending slot with no
    // approved row and treat it as a failure.
    await removeSlot(c.env.CASE_STUDIES, id);
    return c.json({ ok: true });
  });

  // Fast lane: schedule an approved candidate for the NEXT hourly publisher
  // run (live <1h) instead of waiting for the daily planner. Unlike
  // publish-now it does NOT generate synchronously — it drops a due slot and
  // lets the existing hourly publisher cron do the work.
  admin.post('/approved/:id/publish-soon', async (c) => {
    const id = c.req.param('id');
    const candidate = await getApproved(c.env.CASE_STUDIES, id);
    if (!candidate) return c.json({ error: 'approved candidate not found' }, 404);
    const schedule = await getSchedule(c.env.CASE_STUDIES);
    const slotAt = new Date().toISOString();
    const exists = schedule.some((s) => s.candidateId === id);
    const next = exists
      ? schedule.map((s) => (s.candidateId === id ? { ...s, slotAt, status: 'pending' as const, error: undefined } : s))
      : [...schedule, { candidateId: id, slotAt, status: 'pending' as const }];
    await setSchedule(c.env.CASE_STUDIES, next);
    return c.json({ ok: true, candidateId: id, slotAt });
  });

  admin.get('/schedule', async (c) => {
    const ns = c.env.CASE_STUDIES;
    const schedule = await getSchedule(ns);
    // Verify published slots still have a live post (self-heal a slot whose
    // post was unpublished → mark it pending so it can republish). Use ONE
    // KV.list of post key-NAMES instead of one get-of-the-full-body per
    // published slot, and skip it entirely when nothing is published.
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
      const dedup = await getDedup(c.env.CASE_STUDIES, candidateId);
      if (dedup?.publishedSlug) {
        await markSlotStatus(c.env.CASE_STUDIES, candidateId, 'published', { publishedSlug: dedup.publishedSlug });
        return c.json({ ok: true, slug: dedup.publishedSlug, title: dedup.publishedSlug });
      }
      return c.json({ error: 'approved candidate not found' }, 404);
    }

    const now = new Date();
    try {
      const post = await generatePost({ candidate, ai: c.env.AI as never, now, groqKey: c.env.GROQ_API_KEY });
      const postIndex = await putPost(c.env.CASE_STUDIES, post);

      // RSS only needs index-level fields; reuse the index putPost just wrote
      // instead of re-reading posts:index from KV.
      const rss = renderRss(postIndex, { siteUrl: getSiteUrl(c.env) });
      await c.env.CASE_STUDIES.put(csKvKeys.metaRss, rss);

      await markSlotStatus(c.env.CASE_STUDIES, candidateId, 'published', { publishedSlug: post.slug });
      await unapprove(c.env.CASE_STUDIES, candidate.key);
      await touchDedup(c.env.CASE_STUDIES, candidate.key, now, post.slug);

      // Auto-generate social content in the background — don't block the
      // publish response. Failures are logged and don't affect publish.
      const ctx = c.executionCtx;
      ctx.waitUntil(
        generateSocialContent(post, c.env.AI as never, new Date(), c.env.GROQ_API_KEY)
          .then((social) => c.env.CASE_STUDIES.put(csKvKeys.social(post.slug), JSON.stringify(social)))
          .catch((err: unknown) => console.error('auto-social-generation failed:', err))
      );

      return c.json({ ok: true, slug: post.slug, title: post.title });
    } catch (err) {
      console.error('schedule-publish-now failed:', err);
      return c.json({ error: 'publish_failed' }, 500);
    }
  });

  admin.post('/schedule/:candidateId/remove', async (c) => {
    await removeSlot(c.env.CASE_STUDIES, c.req.param('candidateId'));
    return c.json({ ok: true });
  });

  // Reschedule a pending/failed slot to a new time (resets it to pending so
  // the publisher picks it up at the new slotAt). Published slots are immutable.
  admin.post('/schedule/:candidateId/reschedule', async (c) => {
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
    if (slot.status === 'published') return c.json({ error: 'cannot reschedule a published slot' }, 400);
    const iso = new Date(slotAt).toISOString();
    await markSlotStatus(c.env.CASE_STUDIES, candidateId, 'pending', { slotAt: iso, error: undefined });
    return c.json({ ok: true, candidateId, slotAt: iso });
  });

  // ─── Social posting queue (manual-posting status + planned time) ───────
  // Social copy is posted by hand (no API), so this just tracks per-platform
  // status (pending/posted) and an optional planned time, surfaced in the
  // Published tab so nothing slips.
  admin.get('/social-schedule/:slug', async (c) => {
    const slug = c.req.param('slug');
    if (!validSlug(slug)) return c.json({ error: 'invalid slug' }, 400);
    const schedule = await getSocialSchedule(c.env.CASE_STUDIES, slug);
    return c.json({ schedule });
  });

  admin.post('/social-schedule/:slug/:platform/mark-posted', async (c) => {
    const slug = c.req.param('slug');
    const platform = c.req.param('platform');
    if (!validSlug(slug)) return c.json({ error: 'invalid slug' }, 400);
    if (!isSocialPlatform(platform)) return c.json({ error: 'platform must be twitter or linkedin' }, 400);
    const schedule = await markSocialPosted(c.env.CASE_STUDIES, slug, platform);
    return c.json({ ok: true, schedule });
  });

  admin.post('/social-schedule/:slug/:platform', async (c) => {
    const slug = c.req.param('slug');
    const platform = c.req.param('platform');
    if (!validSlug(slug)) return c.json({ error: 'invalid slug' }, 400);
    if (!isSocialPlatform(platform)) return c.json({ error: 'platform must be twitter or linkedin' }, 400);
    const parsed = await safeJsonBody<{ scheduledAt?: string; status?: 'pending' | 'posted' }>(c, { maxBytes: 1024 });
    if ('error' in parsed) return parsed.error;
    const patch: { scheduledAt?: string; status?: 'pending' | 'posted' } = {};
    if (parsed.value && 'scheduledAt' in parsed.value) {
      const at = parsed.value.scheduledAt ?? '';
      if (at !== '' && Number.isNaN(Date.parse(at))) return c.json({ error: 'invalid scheduledAt' }, 400);
      patch.scheduledAt = at === '' ? undefined : new Date(at).toISOString();
    }
    if (parsed.value?.status === 'pending' || parsed.value?.status === 'posted') patch.status = parsed.value.status;
    const schedule = await upsertSocialSchedule(c.env.CASE_STUDIES, slug, platform, patch);
    return c.json({ ok: true, schedule });
  });

  admin.get('/posts', async (c) => {
    return c.json({ posts: await listPostIndex(c.env.CASE_STUDIES) });
  });

  // ─── Draft pipeline (human approval gate) ──────────────────────────────
  // Enabled when `BLOG_APPROVAL_REQUIRED=true` is set on the worker. The
  // publisher writes new posts to `drafts:<slug>` and stops there; these
  // endpoints surface the queue, render a preview, and either promote a
  // draft to published or drop it. Public blog API is untouched — drafts
  // never appear in `posts:index`.

  admin.get('/drafts', async (c) => {
    return c.json({
      drafts: await listDraftIndex(c.env.CASE_STUDIES),
      approvalRequired: c.env.BLOG_APPROVAL_REQUIRED === 'true',
    });
  });

  admin.get('/drafts/:slug', async (c) => {
    const slug = c.req.param('slug');
    if (!validSlug(slug)) return c.json({ error: 'invalid slug' }, 400);
    const draft = await getDraft(c.env.CASE_STUDIES, slug);
    if (!draft) return c.json({ error: 'not found' }, 404);
    // Render markdown server-side so the admin preview matches exactly
    // what visitors will see post-approval (same sanitiser + linkify pass).
    const bodyHtml = renderMarkdown(draft.body);
    return c.json({ post: draft, bodyHtml });
  });

  admin.post('/drafts/:slug/approve', async (c) => {
    const slug = c.req.param('slug');
    if (!validSlug(slug)) return c.json({ error: 'invalid slug' }, 400);
    const now = new Date();
    const promoted = await approveDraft(c.env.CASE_STUDIES, slug, now);
    if (!promoted) return c.json({ error: 'not found' }, 404);
    // Refresh RSS so the new post shows up in the feed immediately, same
    // as the auto-publish flow does.
    const rss = renderRss(await listPostIndex(c.env.CASE_STUDIES), { siteUrl: getSiteUrl(c.env) });
    await c.env.CASE_STUDIES.put(csKvKeys.metaRss, rss);
    return c.json({ ok: true, slug: promoted.slug, approvedAt: promoted.approvedAt });
  });

  admin.post('/drafts/:slug/reject', async (c) => {
    const slug = c.req.param('slug');
    if (!validSlug(slug)) return c.json({ error: 'invalid slug' }, 400);
    await rejectDraft(c.env.CASE_STUDIES, slug);
    return c.json({ ok: true });
  });

  admin.post('/posts/:slug/unpublish', async (c) => {
    const slug = c.req.param('slug');
    if (!validSlug(slug)) return c.json({ error: 'invalid slug' }, 400);
    await removePost(c.env.CASE_STUDIES, slug);
    // Clean up schedule slots referencing this slug
    const schedule = await getSchedule(c.env.CASE_STUDIES);
    const updated = schedule.map((s) =>
      s.publishedSlug === slug ? { ...s, status: 'pending' as const, publishedSlug: undefined } : s
    );
    if (updated.some((s, i) => s.status !== schedule[i]?.status)) {
      await setSchedule(c.env.CASE_STUDIES, updated);
    }
    return c.json({ ok: true });
  });

  admin.get('/failures', async (c) => {
    return c.json({ failures: await listFailures(c.env.CASE_STUDIES) });
  });

  admin.post('/failures/:slotId/clear', async (c) => {
    await deleteFailure(c.env.CASE_STUDIES, c.req.param('slotId'));
    return c.json({ ok: true });
  });

  admin.post('/failures/clear-all', async (c) => {
    const cleared = await clearFailures(c.env.CASE_STUDIES);
    return c.json({ ok: true, cleared });
  });

  // ─── Manual post creation ───────────────────────────────────────────────
  // Bypasses the entire discovery → approve → plan → publish pipeline.
  // Accepts user-written markdown and publishes it immediately.
  admin.post('/posts/manual', async (c) => {
    // Body bounded to 256 KB — generous for a long-form markdown post with
    // sources + IOCs, but well under the worker memory ceiling. Depth 6
    // covers `iocs[i].…` (3) plus headroom.
    const parsed = await safeJsonBody<{
      type: CaseStudyType;
      title: string;
      body: string;
      tags?: string[];
      sources?: PostSource[];
      iocs?: PostIOC[];
    }>(c, { maxBytes: 256 * 1024, maxDepth: 6 });
    if ('error' in parsed) return parsed.error;
    const { type, title, body, tags, sources, iocs } = parsed.value;

    if (!TYPES.includes(type)) return c.json({ error: 'invalid type' }, 400);
    if (!title || !body) return c.json({ error: 'title and body required' }, 400);

    const baseSlug = title
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80);
    // Manual titles previously silently overwrote any existing post with the
    // same slug. Append `-2`, `-3`, … until we find a free slug instead.
    let slug = baseSlug;
    let suffix = 2;
    while ((await c.env.CASE_STUDIES.get(csKvKeys.post(slug))) !== null) {
      slug = `${baseSlug}-${suffix}`.slice(0, 80);
      suffix += 1;
      if (suffix > 50) return c.json({ error: 'too many slug collisions' }, 409);
    }

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

    const postIndex = await putPost(c.env.CASE_STUDIES, post);

    // RSS only needs index-level fields; reuse the index putPost just wrote
    // instead of re-reading posts:index from KV.
    const rss = renderRss(postIndex, { siteUrl: getSiteUrl(c.env) });
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
      const post = await generatePost({ candidate, ai: c.env.AI as never, now, groqKey: c.env.GROQ_API_KEY });
      const postIndex = await putPost(c.env.CASE_STUDIES, post);

      // RSS only needs index-level fields; reuse the index putPost just wrote
      // instead of re-reading posts:index from KV.
      const rss = renderRss(postIndex, { siteUrl: getSiteUrl(c.env) });
      await c.env.CASE_STUDIES.put(csKvKeys.metaRss, rss);

      await unapprove(c.env.CASE_STUDIES, candidate.key);
      await touchDedup(env.CASE_STUDIES, candidate.key, now, post.slug);

      return c.json({ ok: true, slug: post.slug, title: post.title });
    } catch (err) {
      console.error('publish-now failed:', err);
      return c.json({ error: 'publish_failed' }, 500);
    }
  });

  // ─── Social content generation (combined Twitter + LinkedIn) ──────────
  admin.post('/social/:slug', async (c) => {
    const slug = c.req.param('slug');
    if (!validSlug(slug)) return c.json({ error: 'invalid slug' }, 400);
    const post = await c.env.CASE_STUDIES.get<Post>(csKvKeys.post(slug), 'json');
    if (!post) return c.json({ error: 'post not found' }, 404);

    try {
      const social = await generateSocialContent(post, c.env.AI as never, new Date(), c.env.GROQ_API_KEY);
      await c.env.CASE_STUDIES.put(csKvKeys.social(slug), JSON.stringify(social));
      return c.json({ ok: true, social });
    } catch (err) {
      console.error('social generation failed:', err);
      return c.json({ error: 'social_generation_failed' }, 500);
    }
  });

  // Which posts already have social copy (and for which platform), from ONE
  // KV.list of social:* key-NAMES — so the Published tab sets button state
  // without a per-post /social fetch (was 3 KV reads × N posts on every load).
  admin.get('/social-index', async (c) => {
    const ns = c.env.CASE_STUDIES;
    const index: Record<string, { twitter: boolean; linkedin: boolean }> = {};
    const mark = (slug: string, patch: Partial<{ twitter: boolean; linkedin: boolean }>) => {
      index[slug] = { twitter: false, linkedin: false, ...index[slug], ...patch };
    };
    let cursor: string | undefined;
    for (let page = 0; page < 10; page += 1) {
      const res = await ns.list({ prefix: 'social:', cursor });
      for (const k of res.keys) {
        const rest = k.name.slice('social:'.length); // <slug> | <slug>:twitter | <slug>:linkedin
        if (rest.endsWith(':twitter')) mark(rest.slice(0, -':twitter'.length), { twitter: true });
        else if (rest.endsWith(':linkedin')) mark(rest.slice(0, -':linkedin'.length), { linkedin: true });
        else if (rest && !rest.includes(':')) mark(rest, { twitter: true, linkedin: true });
      }
      if (res.list_complete) break;
      cursor = res.cursor;
    }
    return c.json({ index });
  });

  admin.get('/social/:slug', async (c) => {
    const slug = c.req.param('slug');
    if (!validSlug(slug)) return c.json({ error: 'invalid slug' }, 400);
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
    const slug = c.req.param('slug');
    if (!validSlug(slug)) return c.json({ error: 'invalid slug' }, 400);
    await Promise.all([
      c.env.CASE_STUDIES.delete(csKvKeys.social(slug)),
      c.env.CASE_STUDIES.delete(csKvKeys.socialTwitter(slug)),
      c.env.CASE_STUDIES.delete(csKvKeys.socialLinkedin(slug)),
    ]);
    return c.json({ ok: true });
  });

  // ─── Individual social platform generation ────────────────────────────
  admin.post('/social/:slug/twitter', async (c) => {
    const slug = c.req.param('slug');
    if (!validSlug(slug)) return c.json({ error: 'invalid slug' }, 400);
    const post = await c.env.CASE_STUDIES.get<Post>(csKvKeys.post(slug), 'json');
    if (!post) return c.json({ error: 'post not found' }, 404);

    try {
      const { twitter, generatedAt } = await generateTwitterContent(
        post,
        c.env.AI as never,
        new Date(),
        c.env.GROQ_API_KEY
      );
      await c.env.CASE_STUDIES.put(csKvKeys.socialTwitter(slug), twitter);
      return c.json({ ok: true, platform: 'twitter', content: twitter, generatedAt });
    } catch (err) {
      console.error('twitter generation failed:', err);
      return c.json({ error: 'twitter_generation_failed' }, 500);
    }
  });

  admin.post('/social/:slug/linkedin', async (c) => {
    const slug = c.req.param('slug');
    if (!validSlug(slug)) return c.json({ error: 'invalid slug' }, 400);
    const post = await c.env.CASE_STUDIES.get<Post>(csKvKeys.post(slug), 'json');
    if (!post) return c.json({ error: 'post not found' }, 404);

    try {
      const { linkedin, generatedAt } = await generateLinkedinContent(
        post,
        c.env.AI as never,
        new Date(),
        c.env.GROQ_API_KEY
      );
      await c.env.CASE_STUDIES.put(csKvKeys.socialLinkedin(slug), linkedin);
      return c.json({ ok: true, platform: 'linkedin', content: linkedin, generatedAt });
    } catch (err) {
      console.error('linkedin generation failed:', err);
      return c.json({ error: 'linkedin_generation_failed' }, 500);
    }
  });

  admin.get('/health', async (c) => {
    // Counts only — list keys, never fetch bodies. Previously this read
    // every candidate/approved/failure body (12 list ops + dozens of gets)
    // just to call .length. Now: 3 prefix list-counts + 2 single gets.
    const ns = c.env.CASE_STUDIES;
    const [pendingCount, approvedCount, failureCount, schedule, postsIndex] = await Promise.all([
      countByPrefix(ns, csKvKeys.candidatesAllPrefix),
      countByPrefix(ns, csKvKeys.approvedPrefix),
      countByPrefix(ns, 'failed:'),
      getSchedule(ns),
      listPostIndex(ns),
    ]);
    return c.json({
      pendingCount,
      approvedCount,
      scheduleCount: schedule.length,
      failureCount,
      postsCount: postsIndex.length,
    });
  });

  // Mount sub-app under /api/v1/admin
  app.route('/api/v1/admin', admin);
}
