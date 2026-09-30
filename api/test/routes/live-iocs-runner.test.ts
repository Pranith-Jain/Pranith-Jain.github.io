import { describe, it, expect, vi, afterEach } from 'vitest';
import { runFeedSourceById, FEED_SOURCE_IDS, type FeedDeps } from '../../src/routes/live-iocs';

const deps: FeedDeps = {};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runFeedSourceById', () => {
  it('returns null for an unknown source id', async () => {
    expect(await runFeedSourceById('does-not-exist', deps)).toBeNull();
  });

  it('runs a single text-feed source and returns its raw contribution', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('1.1.1.1\n8.8.8.8\n9.9.9.9\n', { status: 200 }));

    const result = await runFeedSourceById('emerging-threats', deps);
    expect(result).not.toBeNull();
    // `capped: false` — 3 entries is well under the 300 per-feed cap, so the
    // count is the feed's real size, not a truncation.
    expect(result!.sources).toEqual([{ id: 'emerging-threats', ok: true, count: 3, capped: false }]);
    expect(result!.items).toHaveLength(3);
    for (const it of result!.items) {
      expect(it.kind).toBe('ip');
      expect(it.source).toBe('emerging-threats');
      expect(it.reporter).toBe('Proofpoint ETOpen');
      expect(it.context).toBe('recent compromise / blocklist');
    }
    expect(result!.items.map((i) => i.value)).toEqual(['1.1.1.1', '8.8.8.8', '9.9.9.9']);
  });

  it('reports a fetch failure as ok:false with no items', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 502 }));
    const result = await runFeedSourceById('emerging-threats', deps);
    expect(result!.sources).toEqual([{ id: 'emerging-threats', ok: false, count: 0 }]);
    expect(result!.items).toHaveLength(0);
  });
});

describe('FEED_SOURCE_IDS', () => {
  it('lists the 29 runner units in registry order', () => {
    // Count pinned to the registry. Was 30; threatbase removed 2026-09-30 after
    // its upstream repo (kalidada18/threatbase) began 404ing — the entry cost a
    // subrequest per invocation for a feed that could never return. When adding
    // or removing a feed, bump this number AND update the assertions below.
    expect(FEED_SOURCE_IDS).toHaveLength(29);
    expect(FEED_SOURCE_IDS[0]).toBe('tweetfeed');
    expect(FEED_SOURCE_IDS[28]).toBe('swiftioc');
    expect(FEED_SOURCE_IDS).toContain('emerging-threats');
    expect(FEED_SOURCE_IDS).toContain('crypto-scam');
    // Removed dead sources
    expect(FEED_SOURCE_IDS).not.toContain('sslbl-c2');
    expect(FEED_SOURCE_IDS).not.toContain('andreafortuna-defacements');
    expect(FEED_SOURCE_IDS).not.toContain('mythreatintel');
    // Removed 2026-09-30: upstream repo deleted, 404 on every fetch.
    expect(FEED_SOURCE_IDS).not.toContain('threatbase');
  });

  it('flags capped=true when a feed fills the per-feed cap, so 300 is not read as small', async () => {
    // The roster previously showed a bare "300" for every large feed, which is
    // indistinguishable from a feed with exactly 300 indicators and reads as
    // "not active". `capped` is the fix; this pins the boundary.
    const many = Array.from({ length: 400 }, (_, i) => `1.1.1.${i % 250}`).join('\n');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(many, { status: 200 }));

    const result = await runFeedSourceById('emerging-threats', deps);
    const src = result!.sources[0];
    expect(src).toBeDefined();
    expect(src).toMatchObject({ id: 'emerging-threats', ok: true, capped: true });
    expect(src!.count).toBeGreaterThanOrEqual(300);
  });

  it("uses the 'phishing' runner label, not its response ids", () => {
    expect(FEED_SOURCE_IDS).toContain('phishing');
    expect(FEED_SOURCE_IDS).not.toContain('phishtank');
    expect(FEED_SOURCE_IDS).not.toContain('openphish');
  });

  it('excludes feed-scheduler (a compose-time D1 read, not a queue source)', () => {
    expect(FEED_SOURCE_IDS).not.toContain('feed-scheduler');
  });
});
