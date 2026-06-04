import type { KVNamespace } from '@cloudflare/workers-types';
import type { Post, PostIndexEntry } from '../types';
import { kv } from '../kv-keys';

export async function getPost(ns: KVNamespace, slug: string): Promise<Post | null> {
  return (await ns.get(kv.post(slug), 'json')) as Post | null;
}

export async function listPostIndex(ns: KVNamespace): Promise<PostIndexEntry[]> {
  const raw = (await ns.get(kv.postsIndex, 'json')) as PostIndexEntry[] | null;
  return raw ?? [];
}

function toIndexEntry(p: Post): PostIndexEntry {
  return {
    slug: p.slug,
    title: p.title,
    type: p.type,
    excerpt: p.excerpt,
    publishedAt: p.publishedAt,
    tags: p.tags,
  };
}

/**
 * Soft cap on the postsIndex blob — every blog page load reads the whole
 * index from KV, and an unbounded list eventually slows that fetch + the
 * client-side filter pass. 500 entries × ~250 bytes per index row is well
 * under KV's 25 MB value ceiling but keeps page load snappy. When the cap
 * is hit, the OLDEST entry by publishedAt is dropped (the per-slug post
 * record stays in KV; only the index pointer goes, so a deep link to an
 * older slug still works — it just stops appearing on the listing page).
 */
const POSTS_INDEX_CAP = 500;

/** Returns the updated post index so callers (RSS render) can reuse it
 *  instead of re-reading `posts:index` from KV right after this write. */
export async function putPost(ns: KVNamespace, p: Post): Promise<PostIndexEntry[]> {
  await ns.put(kv.post(p.slug), JSON.stringify(p));
  const index = await listPostIndex(ns);
  const filtered = index.filter((e) => e.slug !== p.slug);
  filtered.push(toIndexEntry(p));
  filtered.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const capped = filtered.slice(0, POSTS_INDEX_CAP);
  await ns.put(kv.postsIndex, JSON.stringify(capped));
  return capped;
}

export async function removePost(ns: KVNamespace, slug: string): Promise<void> {
  // Single source of truth for unpublish: the post record, the index entry,
  // and every key that was keyed off the slug (combined social object plus
  // per-platform Twitter / LinkedIn variants). Previously only the post
  // record + index were cleaned, leaving social:* orphans behind that
  // re-appeared if the slug was ever reused.
  await Promise.all([
    ns.delete(kv.post(slug)),
    ns.delete(kv.social(slug)),
    ns.delete(kv.socialTwitter(slug)),
    ns.delete(kv.socialLinkedin(slug)),
  ]);
  const index = await listPostIndex(ns);
  await ns.put(kv.postsIndex, JSON.stringify(index.filter((e) => e.slug !== slug)));
}
