/**
 * Tests for the Threat Intel manifest loader.
 *
 * We stub env.ASSETS with an in-memory map of {path -> json} so the
 * tests don't need real Cloudflare bindings. Run via:
 *   npx vitest run worker/lib/threat-intel-manifest.test.ts
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadTiIndex,
  getTiCve,
  getTiIoc,
  getTiSector,
  getTiList,
  loadKevSnapshot,
  filterCves,
  filterIocs,
  filterLists,
  searchListEntries,
  computePriorityScore,
  tiCacheStats,
  _resetTiCacheForTests,
  severityFromScore,
  loadDarknetIndex,
  getDarknetSite,
  getDarknetCategory,
  filterDarknetSites,
  type TiIndex,
  type TiCveBody,
  type TiIocBody,
  type TiSectorBody,
  type TiKevEntry,
  type TiDetectionListBody,
  type TiDarknetIndex,
  type TiDarknetSiteBody,
  type TiDarknetCategoryBody,
} from './threat-intel-manifest';

function makeAssetsFixture() {
  const data = new Map<string, unknown>();
  const idx: TiIndex = {
    source: 'test',
    license: 'MIT',
    replicatedAt: '2026-06-29',
    counts: { cves: 2, iocs: 1, sectors: 1, kevTotal: 1, lists: 1 },
    lastSyncedAt: '2026-06-29T00:00:00Z',
    cveIndex: [
      {
        cveId: 'CVE-2026-1001',
        publishedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
        lastModifiedAt: new Date(Date.now() - 1 * 86_400_000).toISOString(),
        cvssV3Score: 9.8,
        cvssV3Severity: 'critical',
        vendor: 'Acme',
        product: 'Widget',
        inKev: true,
        inKevSince: '2026-06-22',
        priorityScore: 92,
        description: 'remote code execution in widget',
        sizeBytes: 32,
        argusHypeScore: null,
        argusRising: null,
      },
      {
        cveId: 'CVE-2026-1002',
        publishedAt: new Date(Date.now() - 30 * 86_400_000).toISOString(),
        lastModifiedAt: new Date(Date.now() - 30 * 86_400_000).toISOString(),
        cvssV3Score: 5.4,
        cvssV3Severity: 'medium',
        vendor: 'Globex',
        product: 'Portal',
        inKev: false,
        inKevSince: null,
        priorityScore: 35,
        description: 'cross-site scripting',
        sizeBytes: 22,
        argusHypeScore: null,
        argusRising: null,
      },
    ],
    iocIndex: [
      {
        slug: 'lockbit-4-0-ransomware',
        family: 'LockBit 4.0 Ransomware',
        category: 'ransomware',
        aliases: ['LockBit Black'],
        firstSeen: null,
        mitreTechniques: ['T1486'],
        indicatorCount: 12,
        description: 'Ransomware family tracked since 2024',
        sizeBytes: 64,
      },
    ],
    sectors: [
      {
        sector: 'financial',
        title: 'Financial sector brief',
        generatedAt: '2026-06-29',
        topCount: 1,
        preview: 'CVE-2026-1001 leads with priority 92.',
        sizeBytes: 80,
      },
    ],
    listsIndex: [
      {
        slug: 'suspicious-named-pipes',
        title: 'Suspicious Named Pipes',
        category: 'windows',
        sourceFile: 'suspicious_named_pipe_list.csv',
        valueColumn: 'pipe_name',
        entryCount: 2,
        sizeBytes: 200,
        description: 'Named pipes used by malware and offensive tools.',
      },
    ],
  };
  data.set('/data/threat-intel/index.json', idx);

  const cve: TiCveBody = {
    ...idx.cveIndex[0]!,
    cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
    cweIds: ['CWE-787'],
    references: [{ url: 'https://example.com/cve-2026-1001', source: 'N/A', tags: [] }],
    bsiDescription: null,
    llmSummary: null,
    llmRecommendedAction: null,
  };
  data.set('/data/threat-intel/cves/CVE-2026-1001.json', cve);

  const ioc: TiIocBody = {
    ...idx.iocIndex[0]!,
    indicators: [],
    context: 'Long-form context here',
    references: [],
    llmSummary: null,
  };
  data.set('/data/threat-intel/iocs/lockbit-4-0-ransomware.json', ioc);

  const sector: TiSectorBody = {
    ...idx.sectors[0]!,
    executiveSummary: 'Top KEV threats for the financial sector.',
    topThreats: [
      {
        cveId: 'CVE-2026-1001',
        title: 'Remote code execution in widget',
        relevance: 'broadly-critical',
        risk: 'CVSS 9.8; actively exploited.',
        recommendedAction: 'Patch immediately.',
      },
    ],
  };
  data.set('/data/threat-intel/sectors/financial.json', sector);

  const list: TiDetectionListBody = {
    ...idx.listsIndex[0]!,
    columns: ['pipe_name', 'metadata_description', 'metadata_tool', 'metadata_severity'],
    entries: [
      {
        value: '\\WCEServicePipe',
        description: 'Windows Credential Editor (WCE) default named pipe',
        tool: 'WCE',
        severity: 'critical',
        metadata: {},
      },
      {
        value: '\\hashdump',
        description: 'cobaltstrike pipe names',
        tool: 'CobaltStrike',
        severity: 'critical',
        metadata: {},
      },
    ],
  };
  data.set('/data/threat-intel/lists/suspicious-named-pipes.json', list);

  const kev: TiKevEntry[] = [
    {
      cveId: 'CVE-2026-1001',
      vendor: 'Acme',
      product: 'Widget',
      name: 'Acme Widget RCE',
      dateAdded: '2026-06-22',
      shortDescription: 'RCE in Acme Widget',
      requiredAction: 'Apply updates per vendor instructions.',
      dueDate: '2026-07-06',
    },
  ];
  data.set('/data/threat-intel/cves/kev.json', kev);

  // ─── Darknet directory fixture (darknetlist.is) ───────────────────
  const darknetIdx: TiDarknetIndex = {
    source: 'darknetlist.is',
    url: 'https://darknetlist.is/',
    description: 'A free directory of Tor-accessible sites.',
    rebuiltAt: '2026-08-04T11:25:06Z',
    syncedAt: '2026-08-04T12:00:00Z',
    counts: { categories: 2, sites: 3, up: 2, down: 1, recommended: 1, onion: 3 },
    categories: [
      {
        id: 'markets',
        title: 'MARKETS',
        description: 'active market venues and their mirrors',
        siteCount: 2,
        mirrorCount: 2,
        upCount: 1,
      },
      {
        id: 'forums',
        title: 'FORUMS',
        description: 'discussion and community hubs',
        siteCount: 1,
        mirrorCount: 1,
        upCount: 1,
      },
    ],
    sites: [
      {
        slug: 'dwd-3c9c-715',
        name: 'Allure',
        dwdId: 'DWD-3C9C-715',
        category: 'markets',
        status: 'up',
        upMirrors: 1,
        totalMirrors: 1,
        recommended: false,
        isOnion: true,
      },
      {
        slug: 'dwd-3e7a-775',
        name: 'Dark Matter',
        dwdId: 'DWD-3E7A-775',
        category: 'markets',
        status: 'down',
        upMirrors: 0,
        totalMirrors: 3,
        recommended: true,
        isOnion: true,
      },
      {
        slug: 'dwd-2e2e-079',
        name: 'Ark Forum',
        dwdId: 'DWD-2E2E-079',
        category: 'forums',
        status: 'up',
        upMirrors: 1,
        totalMirrors: 1,
        recommended: false,
        isOnion: true,
      },
    ],
  };
  data.set('/data/threat-intel/darknet/index.json', darknetIdx);

  const darknetSite: TiDarknetSiteBody = {
    ...darknetIdx.sites[0]!,
    url: 'http://c5lpbpiufttwjm4daqb6kiyaspwbyedgnshhayhomksf65ebp2ckaeqd.onion',
    onion: 'c5lpbpiufttwjm4daqb6kiyaspwbyedgnshhayhomksf65ebp2ckaeqd',
    latencyMs: 2158,
    httpCode: '200',
    pageSize: '77kb',
    fingerprint: '4BAFDC5B',
  };
  data.set('/data/threat-intel/darknet/sites/dwd-3c9c-715.json', darknetSite);

  const darknetCategory: TiDarknetCategoryBody = {
    ...darknetIdx.categories[0]!,
    sites: [darknetSite],
  };
  data.set('/data/threat-intel/darknet/categories/markets.json', darknetCategory);

  const assets = {
    fetch: vi.fn(async (req: Request) => {
      const path = new URL(req.url).pathname;
      const hit = data.get(path);
      if (!hit) return new Response('not found', { status: 404 });
      return new Response(JSON.stringify(hit), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  } as unknown as Fetcher;

  return { assets, data };
}

describe('loadTiIndex', () => {
  beforeEach(() => _resetTiCacheForTests());

  it('fetches and caches the index', async () => {
    const { assets } = makeAssetsFixture();
    const a = await loadTiIndex(assets);
    const b = await loadTiIndex(assets);
    expect(a).toBe(b);
    expect((assets.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(1);
  });

  it('throws when the index is missing', async () => {
    const emptyAssets = { fetch: vi.fn(async () => new Response('', { status: 404 })) } as unknown as Fetcher;
    await expect(loadTiIndex(emptyAssets)).rejects.toThrow(/Threat Intel manifest not found/);
  });
});

describe('getTiCve / getTiIoc / getTiSector', () => {
  beforeEach(() => _resetTiCacheForTests());

  it('returns a CVE body for a known ID (case-insensitive)', async () => {
    const { assets } = makeAssetsFixture();
    const c = await getTiCve(assets, 'cve-2026-1001');
    expect(c).not.toBeNull();
    expect(c!.cvssV3Score).toBe(9.8);
    expect(c!.cvssVector).toContain('AV:N');
  });

  it('returns null for an unknown CVE', async () => {
    const { assets } = makeAssetsFixture();
    expect(await getTiCve(assets, 'CVE-1999-9999')).toBeNull();
  });

  it('returns an IOC body for a known slug', async () => {
    const { assets } = makeAssetsFixture();
    const i = await getTiIoc(assets, 'lockbit-4-0-ransomware');
    expect(i).not.toBeNull();
    expect(i!.category).toBe('ransomware');
    expect(i!.mitreTechniques).toContain('T1486');
  });

  it('returns a sector body for a known sector', async () => {
    const { assets } = makeAssetsFixture();
    const s = await getTiSector(assets, 'financial');
    expect(s).not.toBeNull();
    expect(s!.topThreats[0]!.cveId).toBe('CVE-2026-1001');
  });

  it('caches bodies on subsequent calls', async () => {
    const { assets } = makeAssetsFixture();
    await getTiCve(assets, 'CVE-2026-1001');
    await getTiCve(assets, 'CVE-2026-1001');
    const stats = tiCacheStats();
    expect(stats.cves.size).toBe(1);
    expect(stats.cves.hits).toBe(1);
    expect(stats.cves.misses).toBe(1);
  });
});

describe('loadKevSnapshot', () => {
  beforeEach(() => _resetTiCacheForTests());

  it('returns the KEV list and caches it', async () => {
    const { assets } = makeAssetsFixture();
    const a = await loadKevSnapshot(assets);
    const b = await loadKevSnapshot(assets);
    expect(a).toBe(b);
    expect(a[0]!.cveId).toBe('CVE-2026-1001');
  });

  it('returns an empty list when the file is missing', async () => {
    const assets = { fetch: vi.fn(async () => new Response('', { status: 404 })) } as unknown as Fetcher;
    const list = await loadKevSnapshot(assets);
    expect(list).toEqual([]);
  });
});

describe('filterCves', () => {
  beforeEach(() => _resetTiCacheForTests());

  it('filters by severity', async () => {
    const { assets } = makeAssetsFixture();
    const idx = await loadTiIndex(assets);
    expect(filterCves(idx, { severity: 'critical' })[0]!.cveId).toBe('CVE-2026-1001');
    expect(filterCves(idx, { severity: 'medium' })[0]!.cveId).toBe('CVE-2026-1002');
  });

  it('filters by kevOnly', async () => {
    const { assets } = makeAssetsFixture();
    const idx = await loadTiIndex(assets);
    const kev = filterCves(idx, { kevOnly: true });
    expect(kev).toHaveLength(1);
    expect(kev[0]!.cveId).toBe('CVE-2026-1001');
  });

  it('filters by vendor (case-insensitive substring)', async () => {
    const { assets } = makeAssetsFixture();
    const idx = await loadTiIndex(assets);
    expect(filterCves(idx, { vendor: 'glo' })[0]!.cveId).toBe('CVE-2026-1002');
    expect(filterCves(idx, { vendor: 'GLOBEX' })[0]!.cveId).toBe('CVE-2026-1002');
  });

  it('filters by daysBack', async () => {
    const { assets } = makeAssetsFixture();
    const idx = await loadTiIndex(assets);
    expect(filterCves(idx, { daysBack: 5 })).toHaveLength(1);
    expect(filterCves(idx, { daysBack: 5 })[0]!.cveId).toBe('CVE-2026-1001');
  });

  it('filters by minPriority', async () => {
    const { assets } = makeAssetsFixture();
    const idx = await loadTiIndex(assets);
    expect(filterCves(idx, { minPriority: 50 })).toHaveLength(1);
  });

  it('filters by minArgusScore (excludes CVEs without Argus data)', async () => {
    const { assets } = makeAssetsFixture();
    const idx = await loadTiIndex(assets);
    // Both test CVEs have argusHypeScore: null, so minArgusScore should exclude both
    expect(filterCves(idx, { minArgusScore: 10 })).toHaveLength(0);
    expect(filterCves(idx, { minArgusScore: 0 })).toHaveLength(0);
  });

  it('includes Argus-scored CVEs when minArgusScore is not set', async () => {
    const { assets } = makeAssetsFixture();
    const idx = await loadTiIndex(assets);
    // No argus filter — both CVEs appear (argusHypeScore: null treated as "not set")
    expect(filterCves(idx, {})).toHaveLength(2);
  });

  it('filters by keyword', async () => {
    const { assets } = makeAssetsFixture();
    const idx = await loadTiIndex(assets);
    expect(filterCves(idx, { keyword: 'WIDGET' })[0]!.cveId).toBe('CVE-2026-1001');
  });

  it('respects limit', async () => {
    const { assets } = makeAssetsFixture();
    const idx = await loadTiIndex(assets);
    expect(filterCves(idx, { limit: 1 })).toHaveLength(1);
  });
});

describe('filterIocs', () => {
  beforeEach(() => _resetTiCacheForTests());

  it('filters by category', async () => {
    const { assets } = makeAssetsFixture();
    const idx = await loadTiIndex(assets);
    expect(filterIocs(idx, { category: 'ransomware' })).toHaveLength(1);
    expect(filterIocs(idx, { category: 'apt' })).toHaveLength(0);
  });

  it('filters by keyword across family/aliases/description', async () => {
    const { assets } = makeAssetsFixture();
    const idx = await loadTiIndex(assets);
    expect(filterIocs(idx, { keyword: 'lockbit black' })[0]!.slug).toBe('lockbit-4-0-ransomware');
    expect(filterIocs(idx, { keyword: 'RANSOMWARE' })).toHaveLength(1);
    expect(filterIocs(idx, { keyword: 'nope' })).toHaveLength(0);
  });
});

describe('computePriorityScore', () => {
  it('maxes out at 100 for high-CVSS + KEV + recent', () => {
    const now = Date.parse('2026-06-29T00:00:00Z');
    const score = computePriorityScore({
      cvssV3Score: 10,
      inKev: true,
      publishedAt: '2026-06-29T00:00:00Z',
      nowMs: now,
    });
    // 0.55 * 1.0 + 0.35 + 0.10 * 1.0 = 1.0 → 100 (capped by 100).
    expect(score).toBeLessThanOrEqual(100);
    expect(score).toBeGreaterThan(90);
  });

  it('drops for old CVEs with no KEV entry', () => {
    const now = Date.parse('2026-06-29T00:00:00Z');
    const old = '2025-06-29T00:00:00Z';
    const score = computePriorityScore({ cvssV3Score: 10, inKev: false, publishedAt: old, nowMs: now });
    // 0.55 + 0 + 0 = 55
    expect(score).toBe(55);
  });

  it('handles null CVSS', () => {
    const now = Date.parse('2026-06-29T00:00:00Z');
    const score = computePriorityScore({
      cvssV3Score: null,
      inKev: false,
      publishedAt: '2026-06-29T00:00:00Z',
      nowMs: now,
    });
    // 0 + 0 + 0.10 = 10
    expect(score).toBe(10);
  });

  it('incorporates argusHypeScore when provided', () => {
    const now = Date.parse('2026-06-29T00:00:00Z');
    // With argusHypeScore=100 (max), old CVE, no KEV:
    //   0.40*1.0 + 0 + 0.10*0 + 0.15*1.0 = 0.55 → 55
    const score = computePriorityScore({
      cvssV3Score: 10,
      inKev: false,
      publishedAt: '2025-06-29T00:00:00Z',
      nowMs: now,
      argusHypeScore: 100,
    });
    expect(score).toBe(55);
  });

  it('uses original formula when argusHypeScore is null', () => {
    const now = Date.parse('2026-06-29T00:00:00Z');
    const old = '2025-06-29T00:00:00Z';
    // argusHypeScore null — original formula: 0.55 + 0 + 0 = 55
    const score = computePriorityScore({
      cvssV3Score: 10,
      inKev: false,
      publishedAt: old,
      nowMs: now,
      argusHypeScore: null,
    });
    expect(score).toBe(55);
  });

  it('stays bounded at 100 with max argusHypeScore + KEV + recent', () => {
    const now = Date.parse('2026-06-29T00:00:00Z');
    // 0.40*1.0 + 0.35 + 0.10*1.0 + 0.15*1.0 = 1.0 → 100
    const score = computePriorityScore({
      cvssV3Score: 10,
      inKev: true,
      publishedAt: '2026-06-29T00:00:00Z',
      nowMs: now,
      argusHypeScore: 100,
    });
    expect(score).toBe(100);
  });
});

describe('severityFromScore', () => {
  it('maps CVSS bands correctly', () => {
    expect(severityFromScore(null)).toBe('unknown');
    expect(severityFromScore(0)).toBe('unknown');
    expect(severityFromScore(0.1)).toBe('low');
    expect(severityFromScore(3.9)).toBe('low');
    expect(severityFromScore(4.0)).toBe('medium');
    expect(severityFromScore(6.9)).toBe('medium');
    expect(severityFromScore(7.0)).toBe('high');
    expect(severityFromScore(8.9)).toBe('high');
    expect(severityFromScore(9.0)).toBe('critical');
    expect(severityFromScore(10)).toBe('critical');
  });
});

describe('getTiList / filterLists / searchListEntries', () => {
  beforeEach(() => _resetTiCacheForTests());

  it('returns a detection list body for a known slug', async () => {
    const { assets } = makeAssetsFixture();
    const body = await getTiList(assets, 'suspicious-named-pipes');
    expect(body).not.toBeNull();
    expect(body!.entries).toHaveLength(2);
    expect(body!.entries[0]!.value).toBe('\\WCEServicePipe');
    expect(body!.columns).toContain('pipe_name');
  });

  it('returns null for an unknown slug', async () => {
    const { assets } = makeAssetsFixture();
    expect(await getTiList(assets, 'nope')).toBeNull();
  });

  it('caches list bodies on subsequent calls', async () => {
    const { assets } = makeAssetsFixture();
    await getTiList(assets, 'suspicious-named-pipes');
    await getTiList(assets, 'suspicious-named-pipes');
    const stats = tiCacheStats();
    expect(stats.lists.size).toBe(1);
    expect(stats.lists.hits).toBe(1);
    expect(stats.lists.misses).toBe(1);
  });

  it('filterLists filters by category', async () => {
    const { assets } = makeAssetsFixture();
    const idx = await loadTiIndex(assets);
    expect(filterLists(idx, { category: 'windows' })).toHaveLength(1);
    expect(filterLists(idx, { category: 'network' })).toHaveLength(0);
  });

  it('filterLists filters by keyword', async () => {
    const { assets } = makeAssetsFixture();
    const idx = await loadTiIndex(assets);
    expect(filterLists(idx, { keyword: 'pipe' })[0]!.slug).toBe('suspicious-named-pipes');
    expect(filterLists(idx, { keyword: 'nope' })).toHaveLength(0);
  });

  it('searchListEntries filters by keyword across value/description/tool', async () => {
    const { assets } = makeAssetsFixture();
    const body = await getTiList(assets, 'suspicious-named-pipes');
    expect(searchListEntries(body!, { keyword: 'cobaltstrike' })).toHaveLength(1);
    expect(searchListEntries(body!, { keyword: 'WCE' })[0]!.value).toBe('\\WCEServicePipe');
    expect(searchListEntries(body!, { keyword: 'nonexistent' })).toHaveLength(0);
  });

  it('searchListEntries filters by severity', async () => {
    const { assets } = makeAssetsFixture();
    const body = await getTiList(assets, 'suspicious-named-pipes');
    expect(searchListEntries(body!, { severity: 'critical' })).toHaveLength(2);
    expect(searchListEntries(body!, { severity: 'low' })).toHaveLength(0);
  });

  it('searchListEntries respects limit', async () => {
    const { assets } = makeAssetsFixture();
    const body = await getTiList(assets, 'suspicious-named-pipes');
    expect(searchListEntries(body!, { limit: 1 })).toHaveLength(1);
  });
});

describe('tiCacheStats', () => {
  beforeEach(() => _resetTiCacheForTests());

  it('reports index loaded after loadTiIndex', async () => {
    const { assets } = makeAssetsFixture();
    await loadTiIndex(assets);
    const s = tiCacheStats();
    expect(s.indexLoaded).toBe(true);
    expect(s.kevLoaded).toBe(false);
  });

  it('reports KEV loaded after loadKevSnapshot', async () => {
    const { assets } = makeAssetsFixture();
    await loadKevSnapshot(assets);
    const s = tiCacheStats();
    expect(s.kevLoaded).toBe(true);
    expect(s.kevAgeMs).toBeGreaterThanOrEqual(0);
  });
});

describe('loadDarknetIndex', () => {
  beforeEach(() => _resetTiCacheForTests());

  it('fetches and caches the darknet index', async () => {
    const { assets } = makeAssetsFixture();
    const a = await loadDarknetIndex(assets);
    const b = await loadDarknetIndex(assets);
    expect(a).toBe(b);
    expect(a.source).toBe('darknetlist.is');
    expect(a.counts.sites).toBe(3);
    expect(a.counts.categories).toBe(2);
    expect((assets.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(1);
  });

  it('throws when the darknet index is missing', async () => {
    const assets = { fetch: vi.fn(async () => new Response('not found', { status: 404 })) } as unknown as Fetcher;
    await expect(loadDarknetIndex(assets)).rejects.toThrow(/Darknet directory manifest not found/);
  });
});

describe('getDarknetSite', () => {
  beforeEach(() => _resetTiCacheForTests());

  it('returns a site body for a known slug', async () => {
    const { assets } = makeAssetsFixture();
    const body = await getDarknetSite(assets, 'dwd-3c9c-715');
    expect(body).not.toBeNull();
    expect(body!.name).toBe('Allure');
    expect(body!.url).toContain('.onion');
    expect(body!.httpCode).toBe('200');
    expect(body!.fingerprint).toBe('4BAFDC5B');
  });

  it('returns null for an unknown slug', async () => {
    const { assets } = makeAssetsFixture();
    expect(await getDarknetSite(assets, 'nope')).toBeNull();
  });

  it('caches site bodies on subsequent calls', async () => {
    const { assets } = makeAssetsFixture();
    await getDarknetSite(assets, 'dwd-3c9c-715');
    await getDarknetSite(assets, 'dwd-3c9c-715');
    const stats = tiCacheStats();
    expect(stats.darknet.sites.size).toBe(1);
    expect(stats.darknet.sites.hits).toBe(1);
    expect(stats.darknet.sites.misses).toBe(1);
  });
});

describe('getDarknetCategory', () => {
  beforeEach(() => _resetTiCacheForTests());

  it('returns a category body with sites for a known category', async () => {
    const { assets } = makeAssetsFixture();
    const body = await getDarknetCategory(assets, 'markets');
    expect(body).not.toBeNull();
    expect(body!.title).toBe('MARKETS');
    expect(body!.sites).toHaveLength(1);
    expect(body!.sites[0]!.name).toBe('Allure');
  });

  it('returns null for an unknown category', async () => {
    const { assets } = makeAssetsFixture();
    expect(await getDarknetCategory(assets, 'nope')).toBeNull();
  });
});

describe('filterDarknetSites', () => {
  beforeEach(() => _resetTiCacheForTests());

  it('returns all sites with no filters', async () => {
    const { assets } = makeAssetsFixture();
    const idx = await loadDarknetIndex(assets);
    expect(filterDarknetSites(idx)).toHaveLength(3);
  });

  it('filters by category', async () => {
    const { assets } = makeAssetsFixture();
    const idx = await loadDarknetIndex(assets);
    expect(filterDarknetSites(idx, { category: 'markets' })).toHaveLength(2);
    expect(filterDarknetSites(idx, { category: 'forums' })).toHaveLength(1);
    expect(filterDarknetSites(idx, { category: 'news' })).toHaveLength(0);
  });

  it('filters by status', async () => {
    const { assets } = makeAssetsFixture();
    const idx = await loadDarknetIndex(assets);
    expect(filterDarknetSites(idx, { status: 'up' })).toHaveLength(2);
    expect(filterDarknetSites(idx, { status: 'down' })).toHaveLength(1);
  });

  it('filters by recommendedOnly', async () => {
    const { assets } = makeAssetsFixture();
    const idx = await loadDarknetIndex(assets);
    expect(filterDarknetSites(idx, { recommendedOnly: true })).toHaveLength(1);
    expect(filterDarknetSites(idx, { recommendedOnly: true })[0]!.name).toBe('Dark Matter');
  });

  it('filters by keyword across name/dwdId/category', async () => {
    const { assets } = makeAssetsFixture();
    const idx = await loadDarknetIndex(assets);
    expect(filterDarknetSites(idx, { keyword: 'allure' })).toHaveLength(1);
    expect(filterDarknetSites(idx, { keyword: 'dwd-3e7a' })).toHaveLength(1);
    expect(filterDarknetSites(idx, { keyword: 'forums' })).toHaveLength(1);
    expect(filterDarknetSites(idx, { keyword: 'nonexistent' })).toHaveLength(0);
  });

  it('respects limit', async () => {
    const { assets } = makeAssetsFixture();
    const idx = await loadDarknetIndex(assets);
    expect(filterDarknetSites(idx, { limit: 2 })).toHaveLength(2);
    expect(filterDarknetSites(idx, { limit: 1 })).toHaveLength(1);
  });
});

describe('tiCacheStats (darknet)', () => {
  beforeEach(() => _resetTiCacheForTests());

  it('reports darknet index loaded after loadDarknetIndex', async () => {
    const { assets } = makeAssetsFixture();
    await loadDarknetIndex(assets);
    const s = tiCacheStats();
    expect(s.darknet.indexLoaded).toBe(true);
    expect(s.darknet.indexAgeMs).toBeGreaterThanOrEqual(0);
  });

  it('reports darknet site cache hits/misses', async () => {
    const { assets } = makeAssetsFixture();
    await getDarknetSite(assets, 'dwd-3c9c-715');
    await getDarknetSite(assets, 'dwd-3c9c-715');
    const s = tiCacheStats();
    expect(s.darknet.sites.size).toBe(1);
    expect(s.darknet.sites.hits).toBe(1);
    expect(s.darknet.sites.misses).toBe(1);
  });
});
