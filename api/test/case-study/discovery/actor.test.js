import { describe, it, expect, vi } from 'vitest';
import { discoverActors } from '../../../src/case-study/discovery/actor';
const rssFixture = `<rss><channel>
  <item><title>FIN7 returns with new loader</title><link>https://example.com/fin7</link><pubDate>Wed, 14 May 2026 06:00:00 GMT</pubDate></item>
  <item><title>Generic security news</title><link>https://example.com/x</link><pubDate>Wed, 14 May 2026 06:00:00 GMT</pubDate></item>
</channel></rss>`;
describe('discoverActors', () => {
    it('extracts actor mentions from RSS', async () => {
        const fetchMock = vi.fn(async () => new Response(rssFixture, {
            headers: { 'content-type': 'application/rss+xml' },
        }));
        const cands = await discoverActors({
            fetch: fetchMock,
            now: new Date('2026-05-14T12:00:00Z'),
            getDedup: async () => null,
            feeds: ['https://feeds.example.com/mandiant.rss'],
        });
        expect(cands.length).toBeGreaterThan(0);
        expect(cands[0].key).toBe('actor-fin7');
        expect(cands[0].evidence.mentions).toBeGreaterThan(0);
    });
});
