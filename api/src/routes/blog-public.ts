import type { Hono } from 'hono';
import type { Env } from '../env';
import type { Post, PostIndexEntry } from '../case-study/types';
import { kv } from '../case-study/kv-keys';

export function registerBlogRoutes(app: Hono<{ Bindings: Env }>): void {
  app.get('/api/v1/blog/posts', async (c) => {
    const index = ((await c.env.CASE_STUDIES.get(kv.postsIndex, 'json')) as PostIndexEntry[]) ?? [];
    const type = c.req.query('type');
    const tag = c.req.query('tag');
    let filtered = index;
    if (type) filtered = filtered.filter((p) => p.type === type);
    if (tag) filtered = filtered.filter((p) => p.tags.includes(tag));
    return c.json({ posts: filtered });
  });

  app.get('/api/v1/blog/posts/:slug', async (c) => {
    const slug = c.req.param('slug');
    const post = (await c.env.CASE_STUDIES.get(kv.post(slug), 'json')) as Post | null;
    if (!post) return c.json({ error: 'not found' }, 404);
    return c.json({ post });
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
