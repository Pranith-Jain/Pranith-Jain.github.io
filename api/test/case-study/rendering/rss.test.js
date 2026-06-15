import { describe, it, expect } from 'vitest';
import { renderRss } from '../../../src/case-study/rendering/rss';
const post = {
    slug: 'cve-2026-1234',
    type: 'cve',
    title: 'CVE-2026-1234',
    excerpt: 'Auth bypass.',
    publishedAt: '2026-05-19T15:05:00Z',
    candidateId: 'cve-2026-1234',
    body: '## Summary\n\nx',
    hero: '<svg/>',
    iocs: [],
    tags: ['cve'],
    sources: [],
};
describe('renderRss', () => {
    it('emits valid RSS 2.0 with one item', () => {
        const xml = renderRss([post], { siteUrl: 'https://pranithjain.qzz.io' });
        expect(xml).toContain('<rss version="2.0"');
        expect(xml).toContain('<title>CVE-2026-1234</title>');
        expect(xml).toContain('https://pranithjain.qzz.io/blog/cve-2026-1234');
        expect(xml).toContain('<pubDate>');
    });
    it('escapes XML entities in title', () => {
        const html = renderRss([{ ...post, title: 'X & Y < Z' }], { siteUrl: 'https://x' });
        expect(html).toContain('X &amp; Y &lt; Z');
    });
});
