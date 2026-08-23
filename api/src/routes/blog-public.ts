import type { Hono } from 'hono';
import type { Env } from '../env';
import { badRequest, notFound } from '../lib/api-error';
import type { Post, PostIndexEntry } from '../case-study/types';
import { renderMarkdown } from '../case-study/rendering/markdown';
import { readBlogPostShadowed, readBlogIndexShadowed, readBlogRssShadowed } from '../lib/blog-kv';

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
  // changes only when a post is published.
  //
  // KV policy (see also the og-rewriter, which shares these shadows):
  //   - L1 per-colo Cache-API shadow with a 60s TTL (readBlog*Shadowed).
  //     Collapses repeat/concurrent reads to ~1 KV read per colo per window,
  //     and — unlike the old read-through caches.default RESPONSE cache that
  //     was removed here — a delete/unpublish reflects within 60s because the
  //     shadow only caches values that still exist in KV (a deleted post is a
  //     KV miss → null → never shadowed → 404 immediately).
  //   - Short response Cache-Control for browser caching on top.
  app.get('/api/v1/blog/posts', async (c) => {
    const index = ((await readBlogIndexShadowed<PostIndexEntry[]>(c.env)) ?? []) as PostIndexEntry[];
    const type = c.req.query('type');
    const tag = c.req.query('tag');
    let filtered = index;
    if (type) filtered = filtered.filter((p) => p.type === type);
    if (tag) filtered = filtered.filter((p) => p.tags.includes(tag));
    return c.json({ posts: filtered }, 200, {
      'cache-control': 'public, max-age=60, s-maxage=120, stale-while-revalidate=120',
    });
  });

  app.get('/api/v1/blog/posts/:slug', async (c) => {
    const slug = c.req.param('slug');
    if (!validSlug(slug)) return badRequest(c, 'invalid slug');

    const post = await readBlogPostShadowed<Post>(c.env, slug);
    if (!post) {
      return notFound(c, 'not found');
    }
    // The post body is LLM output built from scraped, attacker-influenceable
    // sources. Sanitize server-side and hand the client safe HTML so it never
    // re-parses raw markup with an unsanitizing renderer.
    const bodyHtml = renderMarkdown(post.body);
    return c.json({ post, bodyHtml }, 200, {
      'cache-control': 'public, max-age=120, s-maxage=300, stale-while-revalidate=120',
    });
  });

  app.get('/blog/rss.xml', async (c) => {
    // RSS readers poll on fixed intervals — shadow through the per-colo
    // Cache API so polls cost ~1 KV read per colo per window, not one each.
    const rss =
      (await readBlogRssShadowed(c.env)) ??
      '<?xml version="1.0"?><rss version="2.0"><channel><title>Pranith Jain — Case Studies</title></channel></rss>';
    return new Response(rss, {
      headers: { 'content-type': 'application/rss+xml; charset=utf-8', 'cache-control': 'public, max-age=300' },
    });
  });
}
