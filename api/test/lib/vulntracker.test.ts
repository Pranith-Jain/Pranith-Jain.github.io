import { describe, it, expect } from 'vitest';
import {
  parseVulnTrackerDigest,
  parseVulnTrackerArchive,
  parseVulnTrackerRss,
  mapVulnTrackerTopCve,
  parseVulnTrackerFullFeed,
  fetchVulnTrackerFullFeed,
  VULNTRACKER_TOP_CVE_CAP,
} from '../../src/lib/vulntracker';

function topCve(over: Record<string, unknown> = {}) {
  return {
    cve_id: 'CVE-2026-76504',
    vulnerability_name: 'Cisco Catalyst SD-WAN Manager System Account Authorization Bypass Vulnerability',
    severity: 'CRITICAL',
    base_score: 9.8,
    is_exploited: true,
    epss_score: 0,
    epss_percentile: 0,
    vendor_id: 'fdbc19e2-f67d-4afe-97e4-2fc38b95f55d',
    vendor_name: 'Cisco',
    product_id: 'a2116f7e-707a-4b94-accb-4b7d8b13e46e',
    product_name: 'Cisco Catalyst SD-WAN Manager',
    published_date: '2026-09-30T13:04:32Z',
    ...over,
  };
}

const RSS_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>VulnTracker Blog</title>
<item>
  <title>CVE-2026-76504: Cisco's SD-WAN Manager Zero-Day Was Found During a Routine Support Case</title>
  <link>https://vulntracker.io/blog/cisco-sdwan-manager-cve-2026-76504</link>
  <guid isPermaLink="true">https://vulntracker.io/blog/cisco-sdwan-manager-cve-2026-76504</guid>
  <pubDate>Thu, 01 Oct 2026 07:54:35 GMT</pubDate>
  <description>A CVSS 9.8 authentication bypass in Cisco Catalyst SD-WAN Manager, now under active exploitation.</description>
</item>
<item>
  <title>CVE-2026-88771 &amp; CVE-2026-88772: Citrix NetScaler Zero-Days</title>
  <link>https://vulntracker.io/blog/citrix-netscaler-cve-2026-88771-88772</link>
  <pubDate>Mon, 28 Sep 2026 10:00:49 GMT</pubDate>
  <description>Citrix confirmed active exploitation of two NetScaler zero-days.</description>
</item>
<item>
  <title>Building a Detection Pipeline for Lateral Movement</title>
  <link>https://vulntracker.io/blog/detection-pipeline</link>
  <pubDate>Fri, 25 Sep 2026 08:00:00 GMT</pubDate>
  <description>A non-CVE engineering post.</description>
</item>
</channel></rss>`;

describe('mapVulnTrackerTopCve', () => {
  it('maps a live-shaped entry including vendor/product', () => {
    const c = mapVulnTrackerTopCve(topCve());
    expect(c).not.toBeNull();
    expect(c!.cve_id).toBe('CVE-2026-76504');
    expect(c!.severity).toBe('CRITICAL');
    expect(c!.base_score).toBe(9.8);
    expect(c!.vendor_name).toBe('Cisco');
    expect(c!.product_name).toBe('Cisco Catalyst SD-WAN Manager');
    expect(c!.is_exploited).toBe(true);
  });

  // Upstream sends a literal 0 for rows it hasn't scored, which is
  // indistinguishable from a real 0 and reads as "certainly not exploited".
  it('normalizes a literal epss_score of 0 to null (unscored, not zero risk)', () => {
    const c = mapVulnTrackerTopCve(topCve());
    expect(c!.epss_score).toBeNull();
    expect(c!.epss_percentile).toBeNull();
  });

  it('preserves a genuine non-zero epss score', () => {
    const c = mapVulnTrackerTopCve(topCve({ epss_score: 0.87, epss_percentile: 0.99 }));
    expect(c!.epss_score).toBe(0.87);
    expect(c!.epss_percentile).toBe(0.99);
  });

  it('rejects entries without a valid CVE id', () => {
    expect(mapVulnTrackerTopCve(topCve({ cve_id: null }))).toBeNull();
    expect(mapVulnTrackerTopCve(topCve({ cve_id: 'PT-2026-1' }))).toBeNull();
  });

  it('tolerates an empty vulnerability_name (upstream sends one routinely)', () => {
    const c = mapVulnTrackerTopCve(topCve({ vulnerability_name: '' }));
    expect(c).not.toBeNull();
    expect(c!.vulnerability_name).toBe('');
  });
});

describe('parseVulnTrackerDigest', () => {
  it('parses a live-shaped day digest', () => {
    const d = parseVulnTrackerDigest({
      success: true,
      data: {
        date: '2026-09-30',
        is_gated: true,
        total_count: 322,
        critical_count: 26,
        exploited_count: 1,
        top_cves: [topCve()],
        top_vendors: [],
        top_products: [],
        message: 'Subscribe to unlock top vendors, products, and the full list of critical CVEs',
      },
    });
    expect(d).not.toBeNull();
    expect(d!.date).toBe('2026-09-30');
    expect(d!.total_count).toBe(322);
    expect(d!.critical_count).toBe(26);
    expect(d!.exploited_count).toBe(1);
    expect(d!.is_gated).toBe(true);
    expect(d!.top_cves).toHaveLength(1);
  });

  it('accepts a genuinely quiet day (total_count 0 is real, not unusable)', () => {
    const d = parseVulnTrackerDigest({ data: { date: '2026-09-20', total_count: 6, critical_count: 3 } });
    expect(d).not.toBeNull();
    expect(d!.total_count).toBe(6);
    expect(d!.exploited_count).toBeNull();
  });

  it('rejects a payload with no usable date or total_count', () => {
    expect(parseVulnTrackerDigest({ data: { total_count: 10 } })).toBeNull();
    expect(parseVulnTrackerDigest({ data: { date: '2026-09-30' } })).toBeNull();
    expect(parseVulnTrackerDigest({ success: false })).toBeNull();
    expect(parseVulnTrackerDigest(null)).toBeNull();
  });

  it('caps top_cves at the verified free-tier limit', () => {
    const many = Array.from({ length: 20 }, (_, i) => topCve({ cve_id: `CVE-2026-${10000 + i}` }));
    const d = parseVulnTrackerDigest({ data: { date: '2026-09-30', total_count: 322, top_cves: many } });
    expect(d!.top_cves).toHaveLength(VULNTRACKER_TOP_CVE_CAP);
    expect(VULNTRACKER_TOP_CVE_CAP).toBe(7);
  });

  it('dedupes repeated CVE ids within top_cves', () => {
    const d = parseVulnTrackerDigest({
      data: { date: '2026-09-30', total_count: 1, top_cves: [topCve(), topCve()] },
    });
    expect(d!.top_cves).toHaveLength(1);
  });
});

describe('parseVulnTrackerArchive', () => {
  it('parses the 30-day archive newest-first', () => {
    const a = parseVulnTrackerArchive({
      success: true,
      data: [
        { date: '2026-09-29', total_count: 477, critical_count: 57 },
        { date: '2026-09-30', total_count: 322, critical_count: 26 },
      ],
    });
    expect(a!.map((d) => d.date)).toEqual(['2026-09-30', '2026-09-29']);
  });

  it('drops malformed rows but keeps the rest', () => {
    const a = parseVulnTrackerArchive({
      data: [
        { date: 'bad', total_count: 1 },
        { date: '2026-09-30', total_count: '322' },
        { date: '2026-09-29', total_count: 5 },
      ],
    });
    expect(a).toHaveLength(1);
    expect(a![0]!.date).toBe('2026-09-29');
  });

  it('rejects a non-list payload', () => {
    expect(parseVulnTrackerArchive({ data: { nope: true } })).toBeNull();
    expect(parseVulnTrackerArchive(null)).toBeNull();
  });
});

describe('parseVulnTrackerRss', () => {
  it('parses CVE-bearing posts and extracts every CVE id from the title', () => {
    const posts = parseVulnTrackerRss(RSS_FIXTURE);
    expect(posts).toHaveLength(2);
    expect(posts[0]!.cve_ids).toEqual(['CVE-2026-76504']);
    expect(posts[0]!.link).toBe('https://vulntracker.io/blog/cisco-sdwan-manager-cve-2026-76504');
    expect(posts[0]!.published).toBe('2026-10-01T07:54:35.000Z');
    expect(posts[1]!.cve_ids).toEqual(['CVE-2026-88771', 'CVE-2026-88772']);
  });

  // This feed is a CVE source, not a general blog — a post with no CVE id in
  // the title would produce a finding with no CVE behind it.
  it('drops posts whose title has no CVE id', () => {
    const posts = parseVulnTrackerRss(RSS_FIXTURE);
    expect(posts.some((p) => p.title.includes('Detection Pipeline'))).toBe(false);
  });

  it('decodes HTML entities in titles and descriptions', () => {
    const posts = parseVulnTrackerRss(RSS_FIXTURE);
    expect(posts[1]!.title).toContain('&');
    expect(posts[1]!.title).not.toContain('&amp;');
  });

  it('dedupes by link', () => {
    const dupe = RSS_FIXTURE.replace('</channel>', RSS_FIXTURE.match(/<item>[\s\S]*?<\/item>/)?.[0] + '</channel>');
    expect(parseVulnTrackerRss(dupe)).toHaveLength(2);
  });

  it('returns an empty array for non-RSS input', () => {
    expect(parseVulnTrackerRss('<html><body>404</body></html>')).toEqual([]);
    expect(parseVulnTrackerRss('')).toEqual([]);
  });
});

describe('parseVulnTrackerFullFeed (keyed /all-cves surface)', () => {
  it('parses a digest-shaped envelope', () => {
    const p = parseVulnTrackerFullFeed({
      success: true,
      data: {
        total: 2,
        cves: [
          {
            cve_id: 'CVE-2026-76504',
            severity: 'CRITICAL',
            base_score: 9.8,
            vulnerability_name: 'Cisco SD-WAN auth bypass',
            vendor_name: 'Cisco',
            is_exploited: true,
          },
        ],
      },
    });
    expect(p).not.toBeNull();
    expect(p!.total).toBe(2);
    expect(p!.cves).toHaveLength(1);
    expect(p!.cves[0]!.is_exploited).toBe(true);
  });

  it('parses a flat array envelope', () => {
    const p = parseVulnTrackerFullFeed({
      data: [{ cve_id: 'CVE-2026-10001', severity: 'HIGH', base_score: 7.5, vulnerability_name: 'x' }],
    });
    expect(p!.cves).toHaveLength(1);
    expect(p!.total).toBeNull();
  });

  it('fails closed on anything it does not recognise', () => {
    expect(parseVulnTrackerFullFeed({ data: { nope: true } })).toBeNull();
    expect(parseVulnTrackerFullFeed({ data: 'nope' })).toBeNull();
    expect(parseVulnTrackerFullFeed(null)).toBeNull();
  });

  it('dedupes by CVE id', () => {
    const row = { cve_id: 'CVE-2026-10001', severity: 'HIGH', base_score: 7, vulnerability_name: 'x' };
    const p = parseVulnTrackerFullFeed({ data: { cves: [row, row] } });
    expect(p!.cves).toHaveLength(1);
  });

  // The whole point of the dormant client: without a key it must report
  // "not configured" rather than burn a 401 against the upstream.
  it('fetchVulnTrackerFullFeed is a no-op without an API key', async () => {
    const r = await fetchVulnTrackerFullFeed({});
    expect(r).toEqual({ cves: [], total: null, ok: false });
  });
});
