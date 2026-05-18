import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { registerBlogRoutes } from '../../src/routes/blog-public';
import type { Env } from '../../src/env';
import type { Post, PostIndexEntry } from '../../src/case-study/types';

function makeKV(records: Record<string, unknown>): any {
  return {
    async get(key: string, type?: 'json') {
      const v = records[key];
      if (v === undefined) return null;
      return type === 'json' ? v : JSON.stringify(v);
    },
  };
}

const post: Post = {
  slug: 'cve-2026-1234',
  type: 'cve',
  title: 'CVE-2026-1234',
  excerpt: 'X',
  publishedAt: '2026-05-19T15:05:00Z',
  candidateId: 'cve-2026-1234',
  body: '## Summary\n\nText.',
  hero: '<svg/>',
  iocs: [],
  tags: ['cve'],
  sources: [],
};

const index: PostIndexEntry[] = [
  { slug: post.slug, title: post.title, type: 'cve', excerpt: 'X', publishedAt: post.publishedAt, tags: ['cve'] },
];

function setup(records: Record<string, unknown>) {
  const app = new Hono<{ Bindings: Env }>();
  registerBlogRoutes(app);
  return { app, env: { CASE_STUDIES: makeKV(records) } };
}

describe('blog public routes', () => {
  it('GET /api/v1/blog/posts returns index JSON', async () => {
    const { app, env } = setup({ 'posts:index': index });
    const r = await app.request('/api/v1/blog/posts', {}, env as any);
    expect(r.status).toBe(200);
    const body = (await r.json()) as any;
    expect(body.posts).toHaveLength(1);
  });

  it('GET /api/v1/blog/posts/:slug returns the post', async () => {
    const { app, env } = setup({ [`posts:${post.slug}`]: post });
    const r = await app.request(`/api/v1/blog/posts/${post.slug}`, {}, env as any);
    expect(r.status).toBe(200);
    const body = (await r.json()) as any;
    expect(body.post.slug).toBe(post.slug);
  });

  it('GET /api/v1/blog/posts/:slug returns 404 for missing post', async () => {
    const { app, env } = setup({});
    const r = await app.request('/api/v1/blog/posts/missing', {}, env as any);
    expect(r.status).toBe(404);
  });

  it('GET /blog/rss.xml returns pre-rendered RSS', async () => {
    const { app, env } = setup({ 'meta:rss': '<?xml version="1.0"?><rss/>' });
    const r = await app.request('/blog/rss.xml', {}, env as any);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('xml');
    expect(await r.text()).toContain('<rss');
  });
});
