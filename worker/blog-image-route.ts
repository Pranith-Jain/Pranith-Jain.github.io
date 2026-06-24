import type { Env } from './env';

const SLUG_RE = /^[a-z0-9-]+$/;
const NAME_RE = /^[a-z0-9-]+$/;

/**
 * Serve an AI-generated blog illustration: GET /api/v1/blog-image/:slug/:name.
 * Public (the blog is public) and handled before the /api/v1/* key-gate, like
 * the OG card route. Bytes live in CASE_STUDIES under `post-img:<slug>:<name>`.
 * Validates slug/name against a strict charset to refuse path traversal.
 */
export async function handleBlogImage(url: URL, env: Env): Promise<Response> {
  const m = url.pathname.match(/^\/api\/v1\/blog-image\/([^/]+)\/([^/.]+)(?:\.(?:jpe?g|png))?$/);
  if (!m) return new Response('not found', { status: 404 });
  const slug = m[1]!;
  const name = m[2]!;
  if (slug.length > 200 || !SLUG_RE.test(slug) || !NAME_RE.test(name)) {
    return new Response('bad request', { status: 400 });
  }
  if (!env.CASE_STUDIES) return new Response('not found', { status: 404 });
  const bytes = await env.CASE_STUDIES.get(`post-img:${slug}:${name}`, 'arrayBuffer');
  if (!bytes) return new Response('not found', { status: 404 });
  return new Response(bytes, {
    status: 200,
    headers: {
      'content-type': 'image/jpeg',
      // Images are content-addressed by slug+name and regenerated only on a
      // fresh publish, so a long immutable cache is safe.
      'cache-control': 'public, max-age=86400, immutable',
    },
  });
}
