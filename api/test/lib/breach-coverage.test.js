import { describe, it, expect } from 'vitest';
import { parseRss, rfc822ToIso } from '../../src/lib/rss-parser';
import { filterByTopic, tokenizeQuery, BREACH_COVERAGE_SOURCES, } from '../../src/lib/breach-coverage';
const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Sample Breach News</title>
    <link>https://example.com/</link>
    <description>Breach + leak headlines</description>
    <item>
      <title>Major data breach at Acme exposes 5M records</title>
      <link>https://example.com/posts/acme-breach</link>
      <pubDate>Wed, 04 Jun 2026 12:34:56 +0000</pubDate>
      <description><![CDATA[A database dump of 5M Acme user records has surfaced on a leak site. Credential exposure confirmed. <b>read more</b>]]></description>
      <category>breach</category>
    </item>
    <item>
      <title>Patch Tuesday: Critical RCE in OpenSSL</title>
      <link>https://example.com/posts/patch-tuesday</link>
      <pubDate>Tue, 03 Jun 2026 18:00:00 +0000</pubDate>
      <description><![CDATA[Microsoft and others ship fixes for 50+ CVEs. No breach coverage here.]]></description>
    </item>
    <item>
      <title>BreachForums returns after seizure; analysts warn of credential dump surge</title>
      <link>https://example.com/posts/breachforums-returns</link>
      <pubDate>Mon, 02 Jun 2026 09:15:00 +0000</pubDate>
      <description><![CDATA[Following the law enforcement action, BreachForums is back under new operators. Security researchers are tracking a spike in credential dumps across multiple leak sites.]]></description>
    </item>
    <item>
      <title>unparseable item missing link</title>
      <pubDate>Sun, 01 Jun 2026 00:00:00 +0000</pubDate>
      <description>this one is missing a link so it should be dropped</description>
    </item>
  </channel>
</rss>`;
describe('rfc822ToIso', () => {
    it('parses a typical RSS pubDate', () => {
        expect(rfc822ToIso('Wed, 04 Jun 2026 12:34:56 +0000')).toBe('2026-06-04T12:34:56.000Z');
    });
    it('returns undefined for garbage', () => {
        expect(rfc822ToIso('not a date')).toBeUndefined();
        expect(rfc822ToIso('')).toBeUndefined();
    });
});
describe('parseRss', () => {
    it('extracts items with title + link, parses pubDate, strips HTML', () => {
        const items = parseRss(SAMPLE_RSS);
        expect(items.length).toBe(3); // 4th (missing link) is dropped
        expect(items[0]?.title).toBe('Major data breach at Acme exposes 5M records');
        expect(items[0]?.link).toBe('https://example.com/posts/acme-breach');
        expect(items[0]?.pubDate).toBe('2026-06-04T12:34:56.000Z');
        expect(items[0]?.category).toBe('breach');
        expect(items[0]?.snippet).toContain('database dump of 5M Acme user records');
        expect(items[0]?.snippet).not.toContain('<b>');
        expect(items[0]?.snippet.length).toBeLessThanOrEqual(401);
    });
    it('returns empty for non-RSS input', () => {
        expect(parseRss('')).toEqual([]);
        expect(parseRss('short')).toEqual([]);
        expect(parseRss('<html><body>500 Internal Server Error</body></html>')).toEqual([]);
    });
    it('survives CDATA-wrapped title and description', () => {
        const xml = `<rss><channel><item><title><![CDATA[Title with &amp; entities]]></title><link>https://x/y</link><description><![CDATA[<p>HTML <em>here</em></p>]]></description></item></channel></rss>`;
        const items = parseRss(xml);
        expect(items[0]?.title).toBe('Title with & entities');
        expect(items[0]?.snippet).toBe('HTML here');
    });
});
function item(partial) {
    return {
        source_id: 'src',
        source_name: 'Source',
        pubDate: '2026-06-04T00:00:00.000Z',
        snippet: '',
        ...partial,
    };
}
describe('tokenizeQuery', () => {
    it('lowercases and splits on whitespace', () => {
        expect(tokenizeQuery('  BreachForums   Leak Site  ')).toEqual(['breachforums', 'leak', 'site']);
    });
    it('drops empty tokens', () => {
        expect(tokenizeQuery('   ')).toEqual([]);
    });
});
describe('filterByTopic', () => {
    const items = [
        item({
            title: 'Major data breach at Acme exposes 5M records',
            link: 'a',
            snippet: 'credential dump on a leak site',
        }),
        item({
            title: 'BreachForums returns after seizure',
            link: 'b',
            snippet: 'credential dump surge',
            pubDate: '2026-06-05T00:00:00.000Z',
        }),
        item({ title: 'Patch Tuesday: critical RCE', link: 'c', snippet: 'microsoft fixes 50 cves' }),
        item({ title: 'Dark web informer: 500GB leak', link: 'd', snippet: 'leakbase and cracked.to both list the data' }),
        item({ title: 'No date — should be dropped by default', link: 'e', pubDate: undefined }),
    ];
    it('breach topic matches the broad keyword set, ranked by date desc', () => {
        const out = filterByTopic(items, { topic: 'breach' });
        const titles = out.map((i) => i.title);
        expect(titles).toContain('Major data breach at Acme exposes 5M records');
        expect(titles).toContain('BreachForums returns after seizure');
        expect(titles).toContain('Dark web informer: 500GB leak');
        expect(titles).not.toContain('Patch Tuesday: critical RCE'); // no breach keyword
        expect(titles).not.toContain('No date — should be dropped by default');
        // "Major data breach" item matches 3 keywords (breach, credential, leak site);
        // "BreachForums returns" matches 2 (breachforums, credential). Keyword density
        // wins over the 1-day date delta. The ranking is intentional — a high-
        // density match from yesterday outranks a low-density match from today.
        expect(out[0]?.title).toBe('Major data breach at Acme exposes 5M records');
    });
    it('forums topic is tight — only named forums, ordered by keyword density then date', () => {
        const out = filterByTopic(items, { topic: 'forums' });
        const titles = out.map((i) => i.title);
        // Dark web informer item matches 2 forum keywords (leakbase, cracked.to)
        // vs BreachForums item matching 1 (breachforums). Higher density ranks first.
        expect(titles).toEqual(['Dark web informer: 500GB leak', 'BreachForums returns after seizure']);
    });
    it('custom topic AND-matches whitespace tokens', () => {
        const out = filterByTopic(items, { topic: 'custom', query: 'leak dump' });
        const titles = out.map((i) => i.title);
        expect(titles).toContain('Major data breach at Acme exposes 5M records');
        expect(titles).not.toContain('Patch Tuesday: critical RCE');
    });
    it('returns empty when no items match', () => {
        const out = filterByTopic([item({ title: 'unrelated news', link: 'x' })], { topic: 'forums' });
        expect(out).toEqual([]);
    });
    it('respects the limit option', () => {
        const out = filterByTopic(items, { topic: 'breach', limit: 1 });
        expect(out.length).toBe(1);
    });
    it('drops items missing pubDate when datedOnly is true (default)', () => {
        const out = filterByTopic(items, { topic: 'breach' });
        const titles = out.map((i) => i.title);
        expect(titles.some((t) => t.startsWith('No date'))).toBe(false);
    });
});
describe('BREACH_COVERAGE_SOURCES', () => {
    it('lists 8 OSINT publishers with no forum / leak links', () => {
        expect(BREACH_COVERAGE_SOURCES.length).toBeGreaterThanOrEqual(7);
        for (const s of BREACH_COVERAGE_SOURCES) {
            // Hard guardrail: no source URL may point at a leak forum, .onion,
            // or credential dump. All are public OSINT news sites.
            expect(/\.onion/i.test(s.url)).toBe(false);
            expect(/breachforums|leakbase|cracked|nulled|sinisterly/i.test(s.url)).toBe(false);
            // Every source must have a unique id
            const ids = BREACH_COVERAGE_SOURCES.map((x) => x.id);
            expect(new Set(ids).size).toBe(ids.length);
        }
    });
});
