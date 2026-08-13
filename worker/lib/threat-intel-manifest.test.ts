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
  loadThreatClusterIndex,
  getTcCluster,
  getTcVuln,
  getTcExploit,
  getTcVictim,
  loadTcIocs,
  loadTcMispEvents,
  loadTcEntities,
  getTcEntity,
  filterTcClusters,
  filterTcVulns,
  filterTcExploits,
  filterTcVictims,
  filterTcIocs,
  filterTcEntities,
  type TcThreatClusterIndex,
  type TcClusterBody,
  type TcVulnBody,
  type TcExploitBody,
  type TcVictimBody,
  type TcIocsBody,
  type TcMispBody,
  type TcEntityIndex,
  type TcEntityBody,
  type TcEntityType,
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
        url: null,
        onion: null,
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
        url: null,
        onion: null,
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
        url: null,
        onion: null,
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

  // ─── ThreatCluster feeds (threatcluster.io) ────────────────────────
  const tcIdx: TcThreatClusterIndex = {
    source: 'threatcluster.io',
    url: 'https://threatcluster.io/feeds',
    description: 'test',
    syncedAt: '2026-08-13T04:00:00Z',
    lastBuildDates: { clusters: '2026-08-13T04:41:40Z', iocs: '2026-08-13T04:45:21Z' },
    counts: { clusters: 1, vulnerabilities: 1, exploits: 2, victims: 1, iocs: 2, mispEvents: 1 },
    feeds: [{ id: 'clusters', title: 'Threat Feed', url: 'https://threatcluster.io/feed.xml', window: '7 days' }],
    clusters: [
      {
        slug: 'lazarus-windows-afdsys-zero-abc123',
        title: 'Lazarus Group Exploits Windows Zero-Day',
        pubDate: '2026-08-12T07:38:58.000Z',
        sourceCount: 18,
        sizeBytes: 1245,
      },
    ],
    vulnerabilities: [
      {
        cveId: 'CVE-2026-0301',
        title: 'CVE-2026-0301',
        pubDate: '2026-08-13T03:16:46.000Z',
        sizeBytes: 161,
      },
    ],
    exploits: [
      {
        cveId: 'CVE-2026-63030',
        title: 'CVE-2026-63030 [KEV] [Exploit]',
        pubDate: '2026-07-17T20:17:28.000Z',
        severity: 'CRITICAL',
        inKev: true,
        sizeBytes: 414,
      },
      {
        cveId: 'CVE-2026-16723',
        title: 'CVE-2026-16723 [Exploit]',
        pubDate: '2026-07-16T10:00:00.000Z',
        severity: 'MEDIUM',
        inKev: false,
        sizeBytes: 300,
      },
    ],
    victims: [
      {
        id: 'portable-intelligence-1a2b',
        victim: 'Portable Intelligence Inc',
        group: 'blacknevas',
        sector: 'Technology',
        country: 'US',
        pubDate: '2026-08-13T00:22:25.000Z',
        sizeBytes: 400,
      },
    ],
  };
  data.set('/data/threat-intel/threatcluster/index.json', tcIdx);

  const tcCluster: TcClusterBody = {
    ...tcIdx.clusters[0]!,
    link: 'https://threatcluster.io/cluster/lazarus-windows-afdsys-zero-abc123',
    guid: 'https://threatcluster.io/cluster/lazarus-windows-afdsys-zero-abc123',
    categories: ['18 Sources'],
    description: 'The North Korean hacking group Lazarus exploited a zero-day vulnerability.',
  };
  data.set('/data/threat-intel/threatcluster/clusters/lazarus-windows-afdsys-zero-abc123.json', tcCluster);

  const tcVuln: TcVulnBody = {
    ...tcIdx.vulnerabilities[0]!,
    link: 'https://threatcluster.io/entities/cve/CVE-2026-0301',
    guid: 'https://threatcluster.io/entities/cve/CVE-2026-0301',
    description: 'An information disclosure vulnerability in the URL Filtering feature of PAN-OS.',
  };
  data.set('/data/threat-intel/threatcluster/vulnerabilities/CVE-2026-0301.json', tcVuln);

  const tcExploit: TcExploitBody = {
    ...tcIdx.exploits[0]!,
    link: 'https://threatcluster.io/entities/cve/CVE-2026-63030',
    guid: 'https://threatcluster.io/entities/cve/CVE-2026-63030',
    hasExploit: true,
    categories: ['Severity: CRITICAL', 'CISA KEV'],
    description: 'Severity: CRITICAL | CISA KEV Listed | Known Exploit Available | WordPress affected.',
  };
  data.set('/data/threat-intel/threatcluster/exploits/CVE-2026-63030.json', tcExploit);

  const tcVictim: TcVictimBody = {
    ...tcIdx.victims[0]!,
    title: 'Portable Intelligence Inc — claimed by blacknevas',
    link: 'https://threatcluster.io/dark-web/victim/Portable%20Intelligence%20Inc',
    guid: 'darkweb-victim:blacknevas:portable intelligence inc',
    categories: ['Group: blacknevas', 'Sector: Technology', 'Country: US'],
    description: 'US · Technology · A Canadian IT company based in Markham, Ontario.',
  };
  data.set('/data/threat-intel/threatcluster/victims/portable-intelligence-1a2b.json', tcVictim);

  const tcIocs: TcIocsBody = {
    source: 'threatcluster.io',
    url: 'https://threatcluster.io/api/iocs/public/feed.json',
    generatedAt: '2026-08-13T04:45:21Z',
    syncedAt: '2026-08-13T04:46:00Z',
    filters: { confidence: 'high', window_days: 30, types: ['ipv4', 'ipv6', 'domain'] },
    count: 2,
    iocs: [
      {
        type: 'domain',
        value: 'ccleanerwind.top',
        confidence: 'high',
        reason: 'Identified as attacker-controlled domain for malware distribution',
        first_seen: '2026-08-12T10:20:02+00:00',
        last_seen: '2026-08-12T11:31:38+00:00',
        source_count: 2,
        sources: [
          {
            source: 'Gbhackers',
            url: 'https://gbhackers.com/malicious-ccleaner-installer/',
            pub_date: '2026-08-12T11:31:38+00:00',
          },
        ],
      },
      {
        type: 'ipv4',
        value: '74.65.75.102',
        confidence: 'high',
        reason: 'Explicitly mentioned in response context.',
        first_seen: '2026-08-11T10:00:19+00:00',
        last_seen: '2026-08-11T10:00:19+00:00',
        source_count: 1,
        sources: [
          {
            source: 'Securelist',
            url: 'https://securelist.com/project-cav3rn-continues/120991/',
            pub_date: '2026-08-11T10:00:19+00:00',
          },
        ],
      },
    ],
  };
  data.set('/data/threat-intel/threatcluster/iocs.json', tcIocs);

  const tcMisp: TcMispBody = {
    source: 'threatcluster.io',
    url: 'https://threatcluster.io/misp/manifest.json',
    syncedAt: '2026-08-13T04:46:00Z',
    eventCount: 1,
    events: [
      {
        uuid: '31fc2385-a89e-5ffa-af2e-e4bcd29facde',
        info: 'Lazarus Group Exploits Windows Zero-Day to Target Defense Sector',
        date: '2026-08-12',
        analysis: '2',
        threat_level_id: '1',
        timestamp: '1786530293',
        tags: ['source:ThreatCluster', 'tlp:clear', 'type:apt', 'misp-galaxy:threat-actor="Lazarus"'],
        orgc: 'ThreatCluster',
      },
    ],
  };
  data.set('/data/threat-intel/threatcluster/misp.json', tcMisp);

  const tcEntityIndex: TcEntityIndex = {
    source: 'threatcluster.io',
    url: 'https://threatcluster.io/entities',
    description: 'test',
    builtAt: '2026-08-13T04:50:00Z',
    counts: { actor: 1, group: 1, malware: 1, cve: 1, sector: 1 },
    entities: {
      actor: [
        {
          type: 'actor',
          slug: 'lazarus-group',
          name: 'Lazarus Group',
          aliases: ['Lazarus'],
          mentionCount: 3,
          firstSeen: '2026-08-12T07:00:00Z',
          lastSeen: '2026-08-13T04:00:00Z',
        },
      ],
      cve: [
        {
          type: 'cve',
          slug: 'CVE-2026-0301',
          name: 'CVE-2026-0301',
          aliases: [],
          mentionCount: 1,
          firstSeen: '2026-08-13T03:16:00Z',
          lastSeen: '2026-08-13T03:16:00Z',
        },
      ],
      group: [
        {
          type: 'group',
          slug: 'clop',
          name: 'Clop',
          aliases: [],
          mentionCount: 1,
          firstSeen: '2026-08-12T00:00:00Z',
          lastSeen: '2026-08-12T00:00:00Z',
        },
      ],
      malware: [
        {
          type: 'malware',
          slug: 'powershell',
          name: 'Powershell',
          aliases: [],
          mentionCount: 1,
          firstSeen: '2026-08-12T07:00:00Z',
          lastSeen: '2026-08-12T07:00:00Z',
        },
      ],
      sector: [
        {
          type: 'sector',
          slug: 'technology',
          name: 'Technology',
          aliases: [],
          mentionCount: 2,
          firstSeen: '2026-08-12T00:00:00Z',
          lastSeen: '2026-08-13T00:22:00Z',
        },
      ],
    },
  };
  data.set('/data/threat-intel/threatcluster/entities/index.json', tcEntityIndex);

  const tcEntityActor: TcEntityBody = {
    type: 'actor',
    slug: 'lazarus-group',
    name: 'Lazarus Group',
    aliases: ['Lazarus'],
    sources: ['misp-galaxy'],
    mentionCount: 3,
    firstSeen: '2026-08-12T07:00:00Z',
    lastSeen: '2026-08-13T04:00:00Z',
    summary:
      'North Korean threat actor. Attributed via MISP galaxy: Lazarus (threat-actor) on 1 MISP event. Co-mentioned with CVE-2026-0301 in 1 record and powershell in 1 record.',
    frequency: [
      { date: '2026-08-12', count: 2 },
      { date: '2026-08-13', count: 1 },
    ],
    recentActivity: [
      {
        recordType: 'cluster',
        slug: 'lazarus-windows-afdsys-zero-abc123',
        title: 'Lazarus Group Exploits Windows Zero-Day',
        pubDate: '2026-08-12T07:38:58.000Z',
      },
      {
        recordType: 'mispEvent',
        slug: '31fc2385-a89e-5ffa-af2e-e4bcd29facde',
        title: 'Lazarus Group Exploits Windows Zero-Day to Target Defense Sector',
        pubDate: '2026-08-12T00:00:00.000Z',
      },
      {
        recordType: 'vulnerability',
        slug: 'CVE-2026-0301',
        title: 'CVE-2026-0301',
        pubDate: '2026-08-13T03:16:46.000Z',
      },
    ],
    relatedEntities: [
      { type: 'cve', slug: 'CVE-2026-0301', name: 'CVE-2026-0301', weight: 2 },
      { type: 'malware', slug: 'powershell', name: 'Powershell', weight: 1 },
      { type: 'sector', slug: 'technology', name: 'Technology', weight: 1 },
    ],
    mitreTechniques: [],
  };
  data.set('/data/threat-intel/threatcluster/entities/actor/lazarus-group.json', tcEntityActor);

  const tcEntityCve: TcEntityBody = {
    type: 'cve',
    slug: 'CVE-2026-0301',
    name: 'CVE-2026-0301',
    aliases: [],
    sources: ['feed'],
    mentionCount: 1,
    firstSeen: '2026-08-13T03:16:00Z',
    lastSeen: '2026-08-13T03:16:00Z',
    summary:
      'Feed-listed CVE-2026-0301. Also co-mentioned with lazarus-group in 2 records. 1 mention in feeds, 2 mentions in cluster text.',
    frequency: [{ date: '2026-08-13', count: 1 }],
    recentActivity: [
      {
        recordType: 'vulnerability',
        slug: 'CVE-2026-0301',
        title: 'CVE-2026-0301',
        pubDate: '2026-08-13T03:16:46.000Z',
      },
    ],
    relatedEntities: [
      { type: 'actor', slug: 'lazarus-group', name: 'Lazarus Group', weight: 2 },
      { type: 'malware', slug: 'powershell', name: 'Powershell', weight: 1 },
    ],
    mitreTechniques: [],
  };
  data.set('/data/threat-intel/threatcluster/entities/cve/cve-2026-0301.json', tcEntityCve);

  const tcEntityGroup: TcEntityBody = {
    type: 'group',
    slug: 'clop',
    name: 'Clop',
    aliases: [],
    sources: ['victims'],
    mentionCount: 1,
    firstSeen: '2026-08-12T00:00:00Z',
    lastSeen: '2026-08-12T00:00:00Z',
    summary: 'Ransomware group named 1 time. Observed on 1 leak-site victim.',
    frequency: [{ date: '2026-08-12', count: 1 }],
    recentActivity: [
      {
        recordType: 'victim',
        slug: 'portable-intelligence-1a2b',
        title: 'Portable Intelligence Inc',
        pubDate: '2026-08-13T00:22:25.000Z',
      },
    ],
    relatedEntities: [{ type: 'sector', slug: 'technology', name: 'Technology', weight: 1 }],
    mitreTechniques: [],
    victims: [
      {
        id: 'portable-intelligence-1a2b',
        victim: 'Portable Intelligence Inc',
        sector: 'Technology',
        country: 'US',
        pubDate: '2026-08-13T00:22:25.000Z',
      },
    ],
  };
  data.set('/data/threat-intel/threatcluster/entities/group/clop.json', tcEntityGroup);

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

// ─── ThreatCluster feeds (threatcluster.io) ────────────────────────────

describe('loadThreatClusterIndex', () => {
  beforeEach(() => _resetTiCacheForTests());

  it('loads the slim index with counts + per-feed arrays', async () => {
    const { assets } = makeAssetsFixture();
    const idx = await loadThreatClusterIndex(assets);
    expect(idx.source).toBe('threatcluster.io');
    expect(idx.counts.clusters).toBe(1);
    expect(idx.clusters[0]!.slug).toBe('lazarus-windows-afdsys-zero-abc123');
    expect(idx.victims[0]!.group).toBe('blacknevas');
  });

  it('caches across calls', async () => {
    const { assets } = makeAssetsFixture();
    const a = await loadThreatClusterIndex(assets);
    const b = await loadThreatClusterIndex(assets);
    expect(a).toBe(b);
  });

  it('throws when the manifest is missing', async () => {
    const data = new Map<string, unknown>();
    const assets = {
      fetch: vi.fn(async () => new Response('not found', { status: 404 })),
    } as unknown as Fetcher;
    void data;
    await expect(loadThreatClusterIndex(assets)).rejects.toThrow(/threatcluster\/index\.json/);
  });
});

describe('getTc* body loaders', () => {
  beforeEach(() => _resetTiCacheForTests());

  it('loads a cluster body by slug (case-insensitive)', async () => {
    const { assets } = makeAssetsFixture();
    const body = await getTcCluster(assets, 'LAZARUS-WINDOWS-AFDSYS-ZERO-ABC123');
    expect(body).not.toBeNull();
    expect(body!.sourceCount).toBe(18);
    expect(body!.description).toContain('Lazarus');
  });

  it('loads a vulnerability body by CVE id (uppercased)', async () => {
    const { assets } = makeAssetsFixture();
    const body = await getTcVuln(assets, 'cve-2026-0301');
    expect(body).not.toBeNull();
    expect(body!.cveId).toBe('CVE-2026-0301');
  });

  it('loads an exploit body by CVE id', async () => {
    const { assets } = makeAssetsFixture();
    const body = await getTcExploit(assets, 'CVE-2026-63030');
    expect(body).not.toBeNull();
    expect(body!.inKev).toBe(true);
    expect(body!.severity).toBe('CRITICAL');
  });

  it('loads a victim body by id', async () => {
    const { assets } = makeAssetsFixture();
    const body = await getTcVictim(assets, 'portable-intelligence-1a2b');
    expect(body).not.toBeNull();
    expect(body!.country).toBe('US');
    expect(body!.sector).toBe('Technology');
  });

  it('loads the IOC blocklist + MISP pass-through', async () => {
    const { assets } = makeAssetsFixture();
    const iocs = await loadTcIocs(assets);
    expect(iocs).not.toBeNull();
    expect(iocs!.count).toBe(2);
    expect(iocs!.iocs[0]!.value).toBe('ccleanerwind.top');
    const misp = await loadTcMispEvents(assets);
    expect(misp).not.toBeNull();
    expect(misp!.events[0]!.tags).toContain('tlp:clear');
  });

  it('returns null for missing bodies', async () => {
    const { assets } = makeAssetsFixture();
    await expect(getTcCluster(assets, 'nope')).resolves.toBeNull();
    await expect(getTcVuln(assets, 'CVE-2026-9999')).resolves.toBeNull();
    await expect(getTcExploit(assets, 'CVE-2026-9999')).resolves.toBeNull();
    await expect(getTcVictim(assets, 'nope')).resolves.toBeNull();
  });
});

describe('filterTc* helpers', () => {
  beforeEach(() => _resetTiCacheForTests());

  it('filters clusters by keyword (title or slug)', async () => {
    const { assets } = makeAssetsFixture();
    const idx = await loadThreatClusterIndex(assets);
    expect(filterTcClusters(idx, { keyword: 'lazarus' })).toHaveLength(1);
    expect(filterTcClusters(idx, { keyword: 'afdsys' })).toHaveLength(1);
    expect(filterTcClusters(idx, { keyword: 'nope' })).toHaveLength(0);
  });

  it('filters vulnerabilities by keyword', async () => {
    const { assets } = makeAssetsFixture();
    const idx = await loadThreatClusterIndex(assets);
    expect(filterTcVulns(idx, { keyword: 'cve-2026-0301' })).toHaveLength(1);
    expect(filterTcVulns(idx, { keyword: 'nope' })).toHaveLength(0);
  });

  it('filters exploits by severity and kevOnly', async () => {
    const { assets } = makeAssetsFixture();
    const idx = await loadThreatClusterIndex(assets);
    expect(filterTcExploits(idx, { severity: 'CRITICAL' })).toHaveLength(1);
    expect(filterTcExploits(idx, { kevOnly: true })).toHaveLength(1);
    expect(filterTcExploits(idx, { kevOnly: true })[0]!.cveId).toBe('CVE-2026-63030');
    expect(filterTcExploits(idx, { severity: 'HIGH' })).toHaveLength(0);
  });

  it('filters victims by group / sector / country / keyword', async () => {
    const { assets } = makeAssetsFixture();
    const idx = await loadThreatClusterIndex(assets);
    expect(filterTcVictims(idx, { group: 'blacknevas' })).toHaveLength(1);
    expect(filterTcVictims(idx, { sector: 'Technology' })).toHaveLength(1);
    expect(filterTcVictims(idx, { country: 'US' })).toHaveLength(1);
    expect(filterTcVictims(idx, { keyword: 'portable' })).toHaveLength(1);
    expect(filterTcVictims(idx, { group: 'nope' })).toHaveLength(0);
  });

  it('filters IOCs by type and keyword, and respects limits', async () => {
    const { assets } = makeAssetsFixture();
    const body = (await loadTcIocs(assets)) as TcIocsBody;
    expect(filterTcIocs(body.iocs, { type: 'domain' })).toHaveLength(1);
    expect(filterTcIocs(body.iocs, { keyword: 'ccleaner' })).toHaveLength(1);
    expect(filterTcIocs(body.iocs, { type: 'ipv6' })).toHaveLength(0);
    expect(filterTcIocs(body.iocs, { limit: 1 })).toHaveLength(1);
  });
});

describe('loadTcEntities + getTcEntity', () => {
  beforeEach(() => _resetTiCacheForTests());

  it('loads the entity index with per-type counts', async () => {
    const { assets } = makeAssetsFixture();
    const idx = await loadTcEntities(assets);
    expect(idx.counts).toEqual({ actor: 1, group: 1, malware: 1, cve: 1, sector: 1 });
    expect(idx.entities.actor).toHaveLength(1);
    expect(idx.entities.sector).toHaveLength(1);
  });

  it('throws when the entities index is missing', async () => {
    const assets = {
      fetch: vi.fn(async () => new Response('not found', { status: 404 })),
    } as never;
    await expect(loadTcEntities(assets as never)).rejects.toThrow(/entities.*index/i);
  });

  it('fetches a full entity body by type + slug (case-insensitive slug)', async () => {
    const { assets } = makeAssetsFixture();
    const body = await getTcEntity(assets, 'actor', 'LAZARUS-GROUP');
    expect(body?.name).toBe('Lazarus Group');
    expect(body?.aliases).toContain('Lazarus');
    expect(body?.recentActivity).toHaveLength(3);
    expect(body?.relatedEntities[0]).toMatchObject({ type: 'cve', slug: 'CVE-2026-0301', weight: 2 });
  });

  it('returns null for an unknown entity, unknown type, or missing body', async () => {
    const { assets } = makeAssetsFixture();
    expect(await getTcEntity(assets, 'actor', 'nope')).toBeNull();
    expect(await getTcEntity(assets, 'group', 'missing-body')).toBeNull();
  });
});

describe('filterTcEntities', () => {
  beforeEach(() => _resetTiCacheForTests());

  it('returns all five types when no type is given, ordered by mention count', async () => {
    const { assets } = makeAssetsFixture();
    const idx = await loadTcEntities(assets);
    const all = filterTcEntities(idx, { limit: 10 });
    expect(all[0]).toMatchObject({ type: 'actor', slug: 'lazarus-group' });
    expect(new Set(all.map((e) => e.type))).toEqual(
      new Set<TcEntityType>(['actor', 'group', 'malware', 'cve', 'sector'])
    );
  });

  it('filters by type, keyword (name + aliases), and minMentions, and respects limits', async () => {
    const { assets } = makeAssetsFixture();
    const idx = await loadTcEntities(assets);
    expect(filterTcEntities(idx, { type: 'group' })).toHaveLength(1);
    expect(filterTcEntities(idx, { keyword: 'lazarus' })).toHaveLength(1);
    expect(filterTcEntities(idx, { keyword: 'lazarus', type: 'group' })).toHaveLength(0);
    expect(filterTcEntities(idx, { minMentions: 2 })).toHaveLength(2);
    expect(filterTcEntities(idx, { minMentions: 2 })[0]!.name).toBe('Lazarus Group');
    expect(filterTcEntities(idx, { limit: 1 })).toHaveLength(1);
  });
});

describe('tiCacheStats (threatcluster entities)', () => {
  beforeEach(() => _resetTiCacheForTests());

  it('reports entity index + body cache stats', async () => {
    const { assets } = makeAssetsFixture();
    await loadTcEntities(assets);
    await getTcEntity(assets, 'actor', 'lazarus-group');
    await getTcEntity(assets, 'actor', 'lazarus-group');
    await getTcEntity(assets, 'cve', 'CVE-2026-0301');
    const s = tiCacheStats();
    expect(s.threatcluster.entities.indexLoaded).toBe(true);
    expect(s.threatcluster.entities.indexAgeMs).toBeGreaterThanOrEqual(0);
    expect(s.threatcluster.entities.bodies.size).toBe(2);
    expect(s.threatcluster.entities.bodies.hits).toBe(1);
    expect(s.threatcluster.entities.bodies.misses).toBe(2);
  });
});

describe('tiCacheStats (threatcluster)', () => {
  beforeEach(() => _resetTiCacheForTests());

  it('reports threatcluster index loaded + body cache hits/misses', async () => {
    const { assets } = makeAssetsFixture();
    await loadThreatClusterIndex(assets);
    await getTcCluster(assets, 'lazarus-windows-afdsys-zero-abc123');
    await getTcCluster(assets, 'lazarus-windows-afdsys-zero-abc123');
    await getTcVuln(assets, 'CVE-2026-0301');
    const s = tiCacheStats();
    expect(s.threatcluster.indexLoaded).toBe(true);
    expect(s.threatcluster.indexAgeMs).toBeGreaterThanOrEqual(0);
    expect(s.threatcluster.clusters.size).toBe(1);
    expect(s.threatcluster.clusters.hits).toBe(1);
    expect(s.threatcluster.clusters.misses).toBe(1);
    expect(s.threatcluster.vulnerabilities.size).toBe(1);
    expect(s.threatcluster.exploits.size).toBe(0);
    expect(s.threatcluster.victims.size).toBe(0);
  });
});
