import { Hono } from 'hono';
import type { Env } from '../../env';
import { safeJsonBody } from '../../lib/safe-body';
import { putPost, listPostIndex, removePost } from '../../case-study/storage/posts';
import { getSchedule, setSchedule } from '../../case-study/storage/schedule';
import { generateSocialForPost, type CaseStudyEnv } from '../../case-study/run';
import { kv as csKvKeys } from '../../case-study/kv-keys';
import { renderRss } from '../../case-study/rendering/rss';
import { getSiteUrl } from '../../lib/site-config';
import type { CaseStudyType, Post, PostIOC, PostSource } from '../../case-study/types';
import { validSlug, TYPES } from './shared';

export const postsRouter = new Hono<{ Bindings: Env }>();

postsRouter.get('/posts', async (c) => {
  return c.json({ posts: await listPostIndex(c.env.CASE_STUDIES) });
});

postsRouter.post('/posts/:slug/unpublish', async (c) => {
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

// ─── Manual post creation ───────────────────────────────────────────────
// Bypasses the entire discovery → approve → plan → publish pipeline.
// Accepts user-written markdown and publishes it immediately.
postsRouter.post('/posts/manual', async (c) => {
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
  if (sources) {
    for (let i = 0; i < sources.length; i++) {
      const s = sources[i];
      if (!s || typeof s.url !== 'string') return c.json({ error: `sources[${i}].url must be a string` }, 400);
      try {
        const u = new URL(s.url);
        if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error();
        if (!u.hostname.includes('.')) throw new Error();
      } catch (_catchErr) {
        console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
        return c.json({ error: `sources[${i}].url is not a valid HTTP URL: ${s.url}` }, 400);
      }
    }
  }

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

  generateSocialForPost(slug, c.env as unknown as CaseStudyEnv, new Date()).catch((err) =>
    console.error('auto-social failed:', err)
  );

  return c.json({ ok: true, slug });
});
