import { describe, it, expect, beforeEach } from 'vitest';
import { putPost, listPostIndex, removePost } from '../../src/case-study/storage/posts';
import { kv } from '../../src/case-study/kv-keys';
import type { Post } from '../../src/case-study/types';

/**
 * In-memory KV stub. The real cf-workers-types KV interface is huge; we
 * only exercise get/put/delete, so a tiny adapter is enough.
 */
function makeKv(): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(key: string, type?: 'json'): Promise<unknown> {
      const raw = store.get(key);
      if (raw === undefined) return null;
      return type === 'json' ? JSON.parse(raw) : raw;
    },
    async put(key: string, value: string): Promise<void> {
      store.set(key, value);
    },
    async delete(key: string): Promise<void> {
      store.delete(key);
    },
  } as unknown as KVNamespace;
}

function makePost(slug: string, publishedAt: string): Post {
  return {
    slug,
    type: 'cve' as Post['type'],
    title: slug,
    excerpt: '',
    publishedAt,
    candidateId: slug,
    body: '',
    hero: '',
    iocs: [],
    tags: [],
  } as unknown as Post;
}

describe('posts storage — postsIndex cap', () => {
  let ns: KVNamespace;
  beforeEach(() => {
    ns = makeKv();
  });

  it('caps the index at 500 entries; oldest by publishedAt is dropped', async () => {
    // Write 510 posts spread across distinct timestamps so sort is stable.
    for (let i = 0; i < 510; i += 1) {
      const d = new Date(Date.UTC(2026, 0, 1) + i * 86400_000).toISOString();
      await putPost(ns, makePost(`p${i.toString().padStart(4, '0')}`, d));
    }
    const idx = await listPostIndex(ns);
    expect(idx.length).toBe(500);
    // Newest (p0509) survives at the top; oldest (p0000 .. p0009) get dropped.
    expect(idx[0]!.slug).toBe('p0509');
    expect(idx.find((e) => e.slug === 'p0000')).toBeUndefined();
    expect(idx.find((e) => e.slug === 'p0009')).toBeUndefined();
    expect(idx.find((e) => e.slug === 'p0010')).toBeDefined();
  });

  it('removePost drops the index entry AND associated social keys', async () => {
    await putPost(ns, makePost('alpha', '2026-05-01T00:00:00Z'));
    // Seed social-derived keys to confirm they get cleared.
    await ns.put(kv.social('alpha'), JSON.stringify({ x: 1 }));
    await ns.put(kv.socialTwitter('alpha'), 'tweet');
    await ns.put(kv.socialLinkedin('alpha'), 'link');

    await removePost(ns, 'alpha');

    expect(await ns.get(kv.post('alpha'))).toBeNull();
    expect(await ns.get(kv.social('alpha'))).toBeNull();
    expect(await ns.get(kv.socialTwitter('alpha'))).toBeNull();
    expect(await ns.get(kv.socialLinkedin('alpha'))).toBeNull();
    expect((await listPostIndex(ns)).find((e) => e.slug === 'alpha')).toBeUndefined();
  });

  it('putPost is idempotent on the same slug (replaces, does not duplicate)', async () => {
    await putPost(ns, makePost('beta', '2026-05-01T00:00:00Z'));
    await putPost(ns, makePost('beta', '2026-05-10T00:00:00Z'));
    const idx = await listPostIndex(ns);
    const betas = idx.filter((e) => e.slug === 'beta');
    expect(betas.length).toBe(1);
    expect(betas[0]!.publishedAt).toBe('2026-05-10T00:00:00Z');
  });
});
