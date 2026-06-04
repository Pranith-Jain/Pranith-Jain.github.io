import { describe, it, expect } from 'vitest';
import { discoverAdvisories } from '../../../src/case-study/discovery/advisories';

const RSS = (title: string, when: string) => `<?xml version="1.0"?><rss><channel>
  <item><title>${title}</title><link>https://example.gov/a</link><pubDate>${when}</pubDate></item>
</channel></rss>`;

describe('discoverAdvisories', () => {
  it('emits intel candidates from advisory feeds within the window', async () => {
    const now = new Date('2026-06-04T06:00:00Z');
    const fetch = (async () =>
      new Response(RSS('ICS Advisory: ACME PLC RCE', '2026-06-03T00:00:00Z'), { status: 200 })) as any;
    const out = await discoverAdvisories({ fetch, now, getDedup: async () => null, feeds: ['https://x/feed'] });
    expect(out).toHaveLength(1);
    expect(out[0]!.type).toBe('intel');
    expect(out[0]!.title).toContain('ACME PLC RCE');
    expect(out[0]!.key.startsWith('intel-')).toBe(true);
  });

  it('skips items older than the 7-day window', async () => {
    const now = new Date('2026-06-04T06:00:00Z');
    const fetch = (async () => new Response(RSS('Old advisory', '2026-04-01T00:00:00Z'), { status: 200 })) as any;
    const out = await discoverAdvisories({ fetch, now, getDedup: async () => null, feeds: ['https://x/feed'] });
    expect(out).toHaveLength(0);
  });

  it('a failing feed does not throw', async () => {
    const now = new Date('2026-06-04T06:00:00Z');
    const fetch = (async () => {
      throw new Error('down');
    }) as any;
    const out = await discoverAdvisories({ fetch, now, getDedup: async () => null, feeds: ['https://x/feed'] });
    expect(out).toEqual([]);
  });
});
