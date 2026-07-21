import type { KVNamespace } from '@cloudflare/workers-types';
import type { Post, PostIndexEntry } from '../types';
import { kv } from '../kv-keys';
import { listPostIndex } from './posts';

/**
 * Draft storage — same shape as posts, different KV namespace.
 *
 * Why a separate namespace instead of a `status` field on `posts:index`:
 * the public blog API reads `posts:index` once per visitor and we want
 * it to stay a list of published-only entries with no per-entry filter
 * cost. Drafts live in their own index that only the admin UI reads.
 *
 * Promotion is atomic-ish (KV doesn't support multi-key transactions; we
 * write the post + update the published index + delete the draft entries
 * in sequence — a crash mid-flight leaves the draft visible to retry).
 */

const DRAFTS_INDEX_CAP = 100;

export async function getDraft(ns: KVNamespace, slug: string): Promise<Post | null> {
  return (await ns.get(kv.draft(slug), 'json')) as Post | null;
}

export async function listDraftIndex(ns: KVNamespace): Promise<PostIndexEntry[]> {
  const raw = (await ns.get(kv.draftsIndex, 'json')) as PostIndexEntry[] | null;
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
    candidateId: p.candidateId,
  };
}

/**
 * Save a generated post as a draft awaiting human approval. Identical to
 * `putPost` from a storage standpoint but writes to the draft namespace
 * and stamps `status: 'draft'` on the body so the consumer can tell.
 */
export async function putDraft(ns: KVNamespace, p: Post): Promise<void> {
  const draft: Post = { ...p, status: 'draft' };
  await ns.put(kv.draft(p.slug), JSON.stringify(draft));
  const index = await listDraftIndex(ns);
  const filtered = index.filter((e) => e.slug !== p.slug);
  filtered.push(toIndexEntry(draft));
  filtered.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  await ns.put(kv.draftsIndex, JSON.stringify(filtered.slice(0, DRAFTS_INDEX_CAP)));
}

/**
 * Promote a draft to published: copy `drafts:<slug>` → `posts:<slug>`,
 * append to `posts:index`, remove the draft entries. Returns the
 * promoted Post or null if no draft existed for the slug.
 */
export async function approveDraft(ns: KVNamespace, slug: string, now: Date): Promise<Post | null> {
  const draft = await getDraft(ns, slug);
  if (!draft) return null;
  const published: Post = {
    ...draft,
    status: 'published',
    approvedAt: now.toISOString(),
  };
  // Write to published namespace first; only then strip the draft so a
  // mid-promote crash leaves the draft to retry rather than losing the
  // post entirely.
  await ns.put(kv.post(slug), JSON.stringify(published));
  const postIndex = await listPostIndex(ns);
  const filteredPosts = postIndex.filter((e) => e.slug !== slug);
  filteredPosts.push(toIndexEntry(published));
  filteredPosts.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  await ns.put(kv.postsIndex, JSON.stringify(filteredPosts.slice(0, 500)));

  await rejectDraft(ns, slug);
  return published;
}

/**
 * Drop a draft without publishing it. Removes both the per-slug record
 * and the index entry. Idempotent — safe to call on a non-existent slug.
 */
export async function rejectDraft(ns: KVNamespace, slug: string): Promise<void> {
  await ns.delete(kv.draft(slug));
  const index = await listDraftIndex(ns);
  const filtered = index.filter((e) => e.slug !== slug);
  if (filtered.length !== index.length) {
    await ns.put(kv.draftsIndex, JSON.stringify(filtered));
  }
}
