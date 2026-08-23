/**
 * L1-shadowed reads of blog records from CASE_STUDIES KV.
 *
 * The `posts:<slug>` body and the `posts:index` listing are read on every
 * blog page render (OG/JSON-LD rewriting in worker/og-rewriter.ts) AND on
 * every public API read (api/src/routes/blog-public.ts). Without an L1 that
 * is 1+ KV read per request per visitor. The per-colo Cache-API shadow
 * collapses that to ~1 KV read per colo per TTL window.
 *
 * Posts are immutable once published; the 60s shadow TTL means a
 * delete/unpublish reflects within a minute — acceptable for metadata and
 * list payloads, which are best-effort and never block a render. This is
 * deliberately the same freshness contract the OG rewriter has always had
 * for these keys; this module just makes the shadows shared so the API
 * route and the HTML rewrite path hit the SAME cache entries.
 */

/** Minimal env shape — only CASE_STUDIES is needed. */
export interface BlogKvEnv {
  CASE_STUDIES?: KVNamespace;
}

export const BLOG_POST_SHADOW_TTL = 60; // 60s — short so deletes reflect fast

function blogPostShadowReq(slug: string): Request {
  return new Request(`https://og-blog-post-shadow.internal/v1/${encodeURIComponent(slug)}`);
}

/** Safe per-colo Cache accessor — returns null when unavailable (e.g. in tests). */
function ogCache(): Cache | null {
  try {
    return (caches as unknown as { default: Cache }).default;
  } catch {
    return null;
  }
}

async function readThroughShadow<T>(
  env: BlogKvEnv,
  shadowReq: Request,
  kvKey: string,
  opts: { type?: 'json' | 'text' } = {}
): Promise<T | null> {
  if (!env.CASE_STUDIES) return null;
  const cache = ogCache();
  const type = opts.type ?? 'json';
  if (cache) {
    try {
      const hit = await cache.match(shadowReq);
      if (hit) return type === 'json' ? ((await hit.json()) as T | null) : ((await hit.text()) as unknown as T | null);
    } catch {
      /* fall through to KV */
    }
  }
  let value: T | null = null;
  try {
    // Union-typed `type` doesn't match a single KVNamespace overload — same
    // cast pattern as kvGetSafe in api/src/lib/safe-catch.ts.
    value = (await env.CASE_STUDIES.get(kvKey, type as never)) as T | null;
  } catch {
    return null;
  }
  if (value && cache) {
    try {
      await cache.put(
        shadowReq,
        new Response(type === 'json' ? JSON.stringify(value) : String(value), {
          headers: {
            'content-type': type === 'json' ? 'application/json' : 'application/rss+xml; charset=utf-8',
            'cache-control': `public, max-age=${BLOG_POST_SHADOW_TTL}`,
          },
        })
      );
    } catch {
      /* best-effort shadow */
    }
  }
  return value;
}

/** L1-shadowed read of a single published post (`posts:<slug>`). */
export function readBlogPostShadowed<T>(env: BlogKvEnv, slug: string): Promise<T | null> {
  return readThroughShadow<T>(env, blogPostShadowReq(slug), `posts:${slug}`);
}

const BLOG_INDEX_SHADOW_REQ = new Request('https://og-blog-index-shadow.internal/v1');

/** L1-shadowed read of the posts index (`posts:index`) behind /blog listings. */
export function readBlogIndexShadowed<T>(env: BlogKvEnv): Promise<T | null> {
  return readThroughShadow<T>(env, BLOG_INDEX_SHADOW_REQ, 'posts:index');
}

const BLOG_RSS_SHADOW_REQ = new Request('https://og-blog-rss-shadow.internal/v1');

/**
 * L1-shadowed read of the prebuilt RSS document (`meta:rss`). RSS readers
 * poll /blog/rss.xml on fixed intervals — every poll was a KV read. The
 * document only changes on publish, so the shared 60s shadow TTL is ample.
 */
export function readBlogRssShadowed(env: BlogKvEnv): Promise<string | null> {
  return readThroughShadow<string>(env, BLOG_RSS_SHADOW_REQ, 'meta:rss', { type: 'text' });
}
