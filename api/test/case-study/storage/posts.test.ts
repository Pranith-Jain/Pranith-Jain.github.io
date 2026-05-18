import { describe, it, expect } from 'vitest';
import { putPost, getPost, listPostIndex, removePost } from '../../../src/case-study/storage/posts';
import type { Post } from '../../../src/case-study/types';

function mockKV() {
  const store = new Map<string, string>();
  return {
    store,
    async get(key: string, type?: 'json') {
      const v = store.get(key);
      if (v === undefined) return null;
      return type === 'json' ? JSON.parse(v) : v;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
  };
}

const samplePost: Post = {
  slug: 'cve-2026-1234-fortinet',
  type: 'cve',
  title: 'CVE-2026-1234 — Fortinet',
  excerpt: 'A summary.',
  publishedAt: '2026-05-19T15:05:00Z',
  candidateId: 'cve-2026-1234',
  body: '## Summary\n\nBody text.',
  hero: '<svg/>',
  iocs: [],
  tags: ['cve', 'fortinet'],
  sources: [],
};

describe('posts storage', () => {
  it('putPost writes post + updates index', async () => {
    const ns = mockKV() as any;
    await putPost(ns, samplePost);
    expect(await getPost(ns, samplePost.slug)).toEqual(samplePost);
    const index = await listPostIndex(ns);
    expect(index).toHaveLength(1);
    expect(index[0]!.slug).toBe(samplePost.slug);
    expect(index[0]!.excerpt).toBe('A summary.');
  });

  it('index is sorted by publishedAt desc', async () => {
    const ns = mockKV() as any;
    await putPost(ns, samplePost);
    await putPost(ns, { ...samplePost, slug: 'newer', publishedAt: '2026-05-20T00:00:00Z' });
    const index = await listPostIndex(ns);
    expect(index[0]!.slug).toBe('newer');
    expect(index[1]!.slug).toBe(samplePost.slug);
  });

  it('removePost removes from store + index', async () => {
    const ns = mockKV() as any;
    await putPost(ns, samplePost);
    await removePost(ns, samplePost.slug);
    expect(await getPost(ns, samplePost.slug)).toBeNull();
    expect(await listPostIndex(ns)).toHaveLength(0);
  });
});
