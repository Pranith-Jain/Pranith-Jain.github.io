import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  loadPcmIndex,
  getPcmDigest,
  getPcmLatest,
  filterPcmDigests,
  searchPcmItems,
  pcmCacheStats,
  _resetPcmCacheForTests,
  type PcmIndex,
  type PcmDigest,
} from './pcmedicalist-manifest';

const MOCK_INDEX: PcmIndex = {
  source: 'github.com/PCMedicalist/pcmedicalist-intellegence-feed',
  sourceUrl: 'https://app.pcmedicalist.com/intel',
  license: 'CC-BY-4.0',
  generatedAt: '2026-08-03',
  counts: { digests: 2 },
  digests: [
    {
      date: '2026-08-03',
      pushedAt: '2026-08-03T11:16:44Z',
      feedsTotal: 38,
      itemsRaw: 3635,
      itemsDeduped: 3570,
      layerCounts: [
        { layer: 8, name: 'Vulnerability Intel', count: 50 },
        { layer: 10, name: 'AI Security', count: 1939 },
      ],
      sizeBytes: 54321,
    },
    {
      date: '2026-08-02',
      pushedAt: '2026-08-02T11:01:33Z',
      feedsTotal: 38,
      itemsRaw: 2900,
      itemsDeduped: 2850,
      layerCounts: [{ layer: 8, name: 'Vulnerability Intel', count: 40 }],
      sizeBytes: 51234,
    },
  ],
};

const MOCK_DIGEST: PcmDigest = {
  date: '2026-08-03',
  feedsTotal: 38,
  itemsRaw: 3635,
  itemsDeduped: 3570,
  perFeed: { 'CISA KEV Vulns': 50, 'OpenAI Research': 1105 },
  postA: '🔐 Daily Security & Standards Brief (Aug 03)',
  postB: '🧠 Engineering & Research Digest',
  layers: [
    {
      layer: 8,
      name: 'Vulnerability Intel',
      trust: 100,
      count: 50,
      top: [
        {
          id: 'e5f68f4d75954334',
          title: 'CVE-2026-20316 — Cisco Secure Firewall Management Center Use of Hard-coded Password Vulnerability',
          summary: 'Patch and verify.',
          url: 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog',
          source: 'CISA KEV Vulns',
          category: 'Vulnerabilities',
          subcategory: 'CVE',
          published: '2026-07-29T05:00:00+00:00',
          severity: 'Low',
          trust_score: 100,
          cves: ['CVE-2026-20316'],
          technologies: ['Cisco Firewall'],
          source_type: 'feed',
        },
        {
          id: 'abc123',
          title: 'OpenAI disruptive crypto AI',
          summary: 'Unrelated item without CVE.',
          url: 'https://openai.com/index/x',
          source: 'OpenAI Research',
          category: 'AI Security',
          subcategory: null,
          published: '2026-08-01T00:00:00+00:00',
          severity: null,
          trust_score: 97,
          cves: [],
          technologies: [],
          source_type: 'feed',
        },
      ],
    },
  ],
  sourceUrl: 'https://app.pcmedicalist.com/intel/2026-08-03',
  upstreamDigestUrl: 'https://github.com/PCMedicalist/pcmedicalist-intellegence-feed/tree/main/digests/2026-08-03/',
  rawMarkdownUrl:
    'https://raw.githubusercontent.com/PCMedicalist/pcmedicalist-intellegence-feed/main/digests/2026-08-03/feed.json',
};

function makeAssets(files: Record<string, string>): Fetcher {
  return {
    fetch: async (req: Request | string) => {
      const url = typeof req === 'string' ? new URL(req) : new URL(req.url);
      const path = url.pathname;
      const body = files[path];
      if (body === undefined) return new Response('not found', { status: 404 });
      return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
    },
  } as unknown as Fetcher;
}

const ASSETS = makeAssets({
  '/data/pcmedicalist/index.json': JSON.stringify(MOCK_INDEX),
  '/data/pcmedicalist/digests/2026-08-03.json': JSON.stringify(MOCK_DIGEST),
});

beforeEach(() => _resetPcmCacheForTests());
afterEach(() => _resetPcmCacheForTests());

describe('pcmedicalist-manifest', () => {
  it('loads the index and caches it', async () => {
    const idx = await loadPcmIndex(ASSETS);
    expect(idx.counts.digests).toBe(2);
    expect(idx.digests[0]?.date).toBe('2026-08-03');
    const again = await loadPcmIndex(ASSETS);
    expect(again).toBe(idx);
    expect(pcmCacheStats().indexLoaded).toBe(true);
  });

  it('throws a helpful error when the manifest is missing', async () => {
    const empty = makeAssets({});
    await expect(loadPcmIndex(empty)).rejects.toThrow(/build-pcmedicalist/);
  });

  it('gets a digest body and LRU-caches it', async () => {
    const d = await getPcmDigest(ASSETS, '2026-08-03');
    expect(d?.date).toBe('2026-08-03');
    expect(d?.layers[0]?.top.length).toBe(2);
    expect(d?.postA).toContain('Daily Security');
    const stats = pcmCacheStats();
    expect(stats.bodyCache.size).toBe(1);
    expect(stats.bodyCache.hits).toBe(0);
    await getPcmDigest(ASSETS, '2026-08-03');
    expect(pcmCacheStats().bodyCache.hits).toBe(1);
  });

  it('returns null for a missing digest date', async () => {
    const d = await getPcmDigest(ASSETS, '2026-08-01');
    expect(d).toBeNull();
  });

  it('resolves the latest digest from the index', async () => {
    const d = await getPcmLatest(ASSETS);
    expect(d?.date).toBe('2026-08-03');
  });

  it('filters digests by date range and keyword', () => {
    const from = filterPcmDigests(MOCK_INDEX, { dateFrom: '2026-08-03' });
    expect(from.map((d) => d.date)).toEqual(['2026-08-03']);
    const kw = filterPcmDigests(MOCK_INDEX, { keyword: 'ai security' });
    expect(kw.map((d) => d.date)).toEqual(['2026-08-03']);
    const limited = filterPcmDigests(MOCK_INDEX, { limit: 1 });
    expect(limited.length).toBe(1);
  });

  it('searches items by keyword, layer, and CVE', () => {
    const all = searchPcmItems(MOCK_DIGEST);
    expect(all.length).toBe(2);
    const kw = searchPcmItems(MOCK_DIGEST, { keyword: 'cisco' });
    expect(kw.length).toBe(1);
    expect(kw[0]?.cves).toEqual(['CVE-2026-20316']);
    const layer = searchPcmItems(MOCK_DIGEST, { layer: 10 });
    expect(layer.length).toBe(0);
    const cve = searchPcmItems(MOCK_DIGEST, { cve: 'cve-2026-20316' });
    expect(cve.length).toBe(1);
    const limited = searchPcmItems(MOCK_DIGEST, { limit: 1 });
    expect(limited.length).toBe(1);
  });
});
