import type { Hono } from 'hono';
import type { Env } from '../env';
import type { Post, PostIndexEntry } from '../case-study/types';
import { kv } from '../case-study/kv-keys';
import { renderMarkdown } from '../case-study/rendering/markdown';

// Post slugs are `${candidate.key}-${slugified-title}` — strictly
// [a-z0-9-]. Validate before it reaches a KV key. `index` is rejected
// explicitly: `posts:index` is the postsIndex key, so an unvalidated
// slug of "index" would alias an internal record.
const SLUG_RE = /^[a-z0-9-]+$/;
function validSlug(slug: string | undefined): slug is string {
  return !!slug && slug.length <= 200 && slug !== 'index' && SLUG_RE.test(slug);
}

export function registerBlogRoutes(app: Hono<{ Bindings: Env }>): void {
  // Public read endpoints are hit once per visitor and the underlying data
  // changes only when a post is published. Edge-cache the responses so
  // repeat/concurrent reads collapse to one KV read per TTL window instead
  // of one per request. Cache key = full request URL, so ?type=/?tag=
  // variants and per-slug pages cache independently.
  app.get('/api/v1/blog/posts', async (c) => {
    const cache = caches.default;
    const hit = await cache.match(c.req.raw);
    if (hit) return hit;

    const index = ((await c.env.CASE_STUDIES.get(kv.postsIndex, 'json')) as PostIndexEntry[]) ?? [];
    const type = c.req.query('type');
    const tag = c.req.query('tag');
    let filtered = index;
    if (type) filtered = filtered.filter((p) => p.type === type);
    if (tag) filtered = filtered.filter((p) => p.tags.includes(tag));
    const res = c.json({ posts: filtered }, 200, {
      'cache-control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600',
    });
    c.executionCtx.waitUntil(cache.put(c.req.raw, res.clone()));
    return res;
  });

  app.get('/api/v1/blog/posts/:slug', async (c) => {
    const slug = c.req.param('slug');
    if (!validSlug(slug)) return c.json({ error: 'invalid slug' }, 400);

    const cache = caches.default;
    const hit = await cache.match(c.req.raw);
    if (hit) return hit;

    const post = (await c.env.CASE_STUDIES.get(kv.post(slug), 'json')) as Post | null;
    if (!post) return c.json({ error: 'not found' }, 404);
    // The post body is LLM output built from scraped, attacker-influenceable
    // sources. Sanitize server-side and hand the client safe HTML so it never
    // re-parses raw markup with an unsanitizing renderer.
    const bodyHtml = renderMarkdown(post.body);
    const res = c.json({ post, bodyHtml }, 200, {
      'cache-control': 'public, max-age=600, s-maxage=1800, stale-while-revalidate=86400',
    });
    c.executionCtx.waitUntil(cache.put(c.req.raw, res.clone()));
    return res;
  });

  app.get('/blog/rss.xml', async (c) => {
    const rss =
      (await c.env.CASE_STUDIES.get(kv.metaRss)) ??
      '<?xml version="1.0"?><rss version="2.0"><channel><title>Pranith Jain — Case Studies</title></channel></rss>';
    return new Response(rss, {
      headers: { 'content-type': 'application/rss+xml; charset=utf-8', 'cache-control': 'public, max-age=300' },
    });
  });
}
