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
    expect(result!.sources).toEqual([{ id: 'emerging-threats', ok: true, count: 3 }]);
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
  it('lists the 33 runner units in registry order', () => {
    expect(FEED_SOURCE_IDS).toHaveLength(33);
    expect(FEED_SOURCE_IDS[0]).toBe('tweetfeed');
    expect(FEED_SOURCE_IDS).toContain('emerging-threats');
    expect(FEED_SOURCE_IDS).toContain('mythreatintel');
    expect(FEED_SOURCE_IDS).toContain('crypto-scam');
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
