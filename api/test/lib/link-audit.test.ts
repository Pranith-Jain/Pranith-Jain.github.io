import { describe, it, expect } from 'vitest';
import { extractAuditUrls } from '../../src/lib/link-audit';
import type { Post } from '../../src/case-study/types';

function makePost(overrides: Partial<Post>): Post {
  return {
    slug: 'test-post',
    type: 'trend',
    title: 'Test',
    excerpt: '',
    publishedAt: '2026-08-01T00:00:00Z',
    candidateId: 'test',
    body: '',
    hero: '',
    iocs: [],
    tags: [],
    sources: [],
    ...overrides,
  };
}

describe('extractAuditUrls', () => {
  it('extracts source URLs first', () => {
    const post = makePost({
      sources: [
        { url: 'https://example.com/a', title: 'A' },
        { url: 'https://example.com/b', title: 'B' },
      ],
      body: '## References\n- [Example](https://example.com/a)\n',
    });
    const urls = extractAuditUrls(post);
    expect(urls.map((e: { url: string }) => e.url)).toEqual(['https://example.com/a', 'https://example.com/b']);
    // De-duped: the same URL from sources and references appears only once.
    expect(urls.filter((e: { url: string }) => e.url === 'https://example.com/a')).toHaveLength(1);
    expect(urls.filter((e: { url: string }) => e.url === 'https://example.com/b')).toHaveLength(1);
  });

  it('extracts markdown-link URLs from ## References section', () => {
    const post = makePost({
      body: [
        '## Body',
        'Some content.',
        '',
        '## References',
        '- [BleepingComputer](https://www.bleepingcomputer.com/news/security/something)',
        '- [Krebs](https://krebsonsecurity.com/2026/01/something)',
        '',
        '## Closing',
      ].join('\n'),
    });
    const urls = extractAuditUrls(post);
    expect(urls.map((e: { url: string }) => e.url)).toEqual([
      'https://www.bleepingcomputer.com/news/security/something',
      'https://krebsonsecurity.com/2026/01/something',
    ]);
    expect(urls.every((e: { surface: string }) => e.surface === 'reference')).toBe(true);
  });

  it('ignores non-http URLs and deduplicates across sources and references', () => {
    const post = makePost({
      sources: [{ url: 'ftp://example.com/file', title: 'FTP' }],
      body: '## References\n- [Example](https://example.com/a)\n- [Also Example](https://example.com/a)\n',
    });
    const urls = extractAuditUrls(post);
    expect(urls.map((e: { url: string }) => e.url)).toEqual(['https://example.com/a']);
  });

  it('returns empty when body has no References section', () => {
    const post = makePost({ body: '## Just content\nNo refs here.' });
    expect(extractAuditUrls(post)).toEqual([]);
  });

  it('returns empty when both sources and references are empty', () => {
    const post = makePost({ sources: [], body: '' });
    expect(extractAuditUrls(post)).toEqual([]);
  });
});
