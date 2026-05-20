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

export async function putPost(ns: KVNamespace, p: Post): Promise<void> {
  await ns.put(kv.post(p.slug), JSON.stringify(p));
  const index = await listPostIndex(ns);
  const filtered = index.filter((e) => e.slug !== p.slug);
  filtered.push(toIndexEntry(p));
  filtered.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  await ns.put(kv.postsIndex, JSON.stringify(filtered));
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
