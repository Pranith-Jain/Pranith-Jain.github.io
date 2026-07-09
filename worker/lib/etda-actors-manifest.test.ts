import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadActorIndex,
  getActor,
  loadAptmap,
  filterActors,
  actorsCacheStats,
  _resetEtdaCacheForTests,
  type ActorIndex,
  type ActorBody,
  type AptmapGraph,
} from './etda-actors-manifest';

function mockAssets(files: Record<string, unknown>): Fetcher {
  return {
    fetch: async (_req: Request) => {
      const url = new URL(_req.url);
      const path = url.pathname;
      const data = files[path];
      if (data === undefined) {
        return new Response(null, { status: 404 });
      }
      return new Response(JSON.stringify(data), {
        headers: { 'content-type': 'application/json' },
      });
    },
  } as unknown as Fetcher;
}

const FAKE_INDEX: ActorIndex = {
  source: 'ETDA Threat Group Cards (CC BY-NC-SA 4.0)',
  license: 'CC BY-NC-SA 4.0',
  replicatedAt: '2026-07-09',
  counts: { actors: 5, apt: 3, other: 1, unknown: 1, withCards: 3, withMitre: 2, withTools: 3, totalSectors: 12 },
  lastSyncedAt: '2026-07-09T12:00:00.000Z',
  lastCardUpdate: '2026-07-09T12:00:00.000Z',
  actorIndex: [
    {
      slug: 'apt-41', name: 'APT 41', aliases: ['Double Dragon', 'Bronze Atlas'], category: 'apt',
      country: 'China', sponsor: 'State-sponsored', motivation: 'Financial crime, Information theft and espionage',
      firstSeen: '2012', lastSeen: '2025', hasDetails: true, sectorCount: 18, toolCount: 80,
      operationCount: 30, observedCountries: ['US', 'JP', 'KR'], description: 'Prolific Chinese cyber threat group.',
      sizeBytes: 200, mitreId: 'G0096', subgroupCount: 2,
    },
    {
      slug: 'lazarus-group', name: 'Lazarus Group', aliases: ['Hidden Cobra'],
      category: 'apt', country: 'North Korea', sponsor: 'State-sponsored', motivation: 'Financial crime, Destruction',
      firstSeen: '2007', lastSeen: '2025', hasDetails: true, sectorCount: 12, toolCount: 60,
      operationCount: 25, observedCountries: ['US', 'KR'], description: 'North Korean state-sponsored APT.',
      sizeBytes: 180, mitreId: 'G0032', subgroupCount: 4,
    },
    {
      slug: 'alphv', name: 'ALPHV', aliases: ['BlackCat'],
      category: 'apt', country: null, sponsor: null, motivation: 'Ransomware',
      firstSeen: '2021', lastSeen: '2024', hasDetails: false, sectorCount: 0, toolCount: 10,
      operationCount: 0, observedCountries: [], description: 'Ransomware group.',
      sizeBytes: 90, mitreId: null, subgroupCount: 1,
    },
    {
      slug: 'other-group', name: 'Hacktivist Collective', aliases: [],
      category: 'other', country: 'Various', sponsor: null, motivation: 'Hacktivism',
      firstSeen: '2020', lastSeen: '2024', hasDetails: false, sectorCount: 0, toolCount: 0,
      operationCount: 0, observedCountries: [], description: '',
      sizeBytes: 50, mitreId: null, subgroupCount: 0,
    },
    {
      slug: 'unknown-group', name: 'Mystery Panda', aliases: [],
      category: 'unknown', country: null, sponsor: null, motivation: null,
      firstSeen: null, lastSeen: null, hasDetails: false, sectorCount: 0, toolCount: 0,
      operationCount: 0, observedCountries: [], description: '',
      sizeBytes: 30, mitreId: null, subgroupCount: 0,
    },
  ],
  aptmap: { nodes: 100, links: 250, aptNodes: 30, countries: 20, tools: 40, ttps: 10 },
};

const FAKE_APT41_BODY: ActorBody = {
  slug: 'apt-41', name: 'APT 41', aliases: ['Double Dragon', 'Bronze Atlas'],
  category: 'apt', country: 'China', sponsor: 'State-sponsored',
  motivation: 'Financial crime, Information theft and espionage',
  firstSeen: '2012', lastSeen: '2025', hasDetails: true, sectorCount: 18, toolCount: 80,
  operationCount: 30, observedCountries: ['US', 'JP', 'KR'],
  description: 'Prolific Chinese cyber threat group.', sizeBytes: 1200, mitreId: 'G0096', subgroupCount: 2,
  names: ['APT 41', 'Double Dragon', 'Bronze Atlas'],
  fullDescription: 'Prolific Chinese cyber threat group.',
  sectors: ['financial', 'government', 'defense', 'telecommunications', 'gaming'],
  toolsUsed: ['Cobalt Strike', 'China Chopper', 'Mimikatz', 'PlugX'],
  operations: [
    { title: 'ShadowHammer supply-chain attack', url: 'https://example.com/supply-chain' },
    { title: 'Breach of TeamViewer', url: null },
  ],
  counterOperations: [{ title: 'US DOJ indictment of APT41 members', url: 'https://example.com/indictment' }],
  informationLinks: ['https://attack.mitre.org/groups/G0096/'],
  mitreLink: 'https://attack.mitre.org/groups/G0096/',
  subgroups: [],
};

const FAKE_APTMAP: AptmapGraph = {
  nodes: [
    { id: 'apt41-uuid', name: 'APT 41', group: 'APT', color: '#ffd700' },
    { id: 'China', name: 'China', group: 'Country', color: '#ff338d' },
    { id: 'Cobalt Strike', name: 'Cobalt Strike', group: 'Tool', color: '#b0e0e0' },
  ],
  links: [
    { source: 'apt41-uuid', target: 'China' },
    { source: 'apt41-uuid', target: 'Cobalt Strike' },
  ],
};

const ASSETS_WITH_INDEX = mockAssets({
  '/data/apt-actors/index.json': FAKE_INDEX,
});

const ASSETS_WITH_ACTOR = mockAssets({
  '/data/apt-actors/index.json': FAKE_INDEX,
  '/data/apt-actors/actors/apt-41.json': FAKE_APT41_BODY,
});

const ASSETS_WITH_APTMAP = mockAssets({
  '/data/apt-actors/aptmap.json': FAKE_APTMAP,
});

const ASSETS_WITH_EVERYTHING = mockAssets({
  '/data/apt-actors/index.json': FAKE_INDEX,
  '/data/apt-actors/actors/apt-41.json': FAKE_APT41_BODY,
  '/data/apt-actors/aptmap.json': FAKE_APTMAP,
});

const EMPTY_ASSETS = mockAssets({});

beforeEach(() => {
  _resetEtdaCacheForTests();
});

describe('loadActorIndex', () => {
  it('loads index from ASSETS', async () => {
    const idx = await loadActorIndex(ASSETS_WITH_INDEX);
    expect(idx.counts.actors).toBe(5);
    expect(idx.counts.apt).toBe(3);
    expect(idx.aptmap).not.toBeNull();
    expect(idx.aptmap!.nodes).toBe(100);
  });

  it('caches index across calls', async () => {
    const idx1 = await loadActorIndex(ASSETS_WITH_INDEX);
    const idx2 = await loadActorIndex(ASSETS_WITH_INDEX);
    expect(idx1).toBe(idx2);
  });

  it('throws when index is missing', async () => {
    await expect(loadActorIndex(EMPTY_ASSETS)).rejects.toThrow('manifest not found');
  });

  it('re-fetches on forceRefresh', async () => {
    let callCount = 0;
    const assets = {
      fetch: async () => {
        callCount++;
        return new Response(JSON.stringify(FAKE_INDEX), {
          headers: { 'content-type': 'application/json' },
        });
      },
    } as unknown as Fetcher;
    await loadActorIndex(assets);
    await loadActorIndex(assets, { forceRefresh: true });
    expect(callCount).toBe(2);
  });
});

describe('getActor', () => {
  it('fetches actor body from ASSETS', async () => {
    const body = await getActor(ASSETS_WITH_ACTOR, 'apt-41');
    expect(body).not.toBeNull();
    expect(body?.name).toBe('APT 41');
    expect(body?.sectors).toContain('financial');
    expect(body?.toolsUsed).toContain('Cobalt Strike');
  });

  it('returns null for unknown slug', async () => {
    const body = await getActor(ASSETS_WITH_INDEX, 'nonexistent');
    expect(body).toBeNull();
  });

  it('caches bodies in LRU', async () => {
    const body1 = await getActor(ASSETS_WITH_ACTOR, 'apt-41');
    const body2 = await getActor(ASSETS_WITH_ACTOR, 'apt-41');
    expect(body1).toBe(body2);
    const stats = actorsCacheStats();
    expect(stats.actors.hits).toBe(1);
    expect(stats.actors.misses).toBe(1);
  });
});

describe('loadAptmap', () => {
  it('loads APTmap graph from ASSETS', async () => {
    const graph = await loadAptmap(ASSETS_WITH_APTMAP);
    expect(graph).not.toBeNull();
    expect(graph?.nodes).toHaveLength(3);
    expect(graph?.links).toHaveLength(2);
  });

  it('returns null when aptmap.json missing', async () => {
    const graph = await loadAptmap(EMPTY_ASSETS);
    expect(graph).toBeNull();
  });
});

describe('filterActors', () => {
  it('returns all actors with default options', async () => {
    const idx = await loadActorIndex(ASSETS_WITH_INDEX);
    const results = filterActors(idx);
    expect(results).toHaveLength(5);
  });

  it('filters by category', async () => {
    const idx = await loadActorIndex(ASSETS_WITH_INDEX);
    const results = filterActors(idx, { category: 'other' });
    expect(results).toHaveLength(1);
    expect(results[0]?.slug).toBe('other-group');
  });

  it('filters by country', async () => {
    const idx = await loadActorIndex(ASSETS_WITH_INDEX);
    const results = filterActors(idx, { country: 'china' });
    expect(results).toHaveLength(1);
    expect(results[0]?.slug).toBe('apt-41');
  });

  it('filters by hasMitre', async () => {
    const idx = await loadActorIndex(ASSETS_WITH_INDEX);
    const results = filterActors(idx, { hasMitre: true });
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.mitreId)).toBe(true);
  });

  it('filters by hasTools', async () => {
    const idx = await loadActorIndex(ASSETS_WITH_INDEX);
    const results = filterActors(idx, { hasTools: true });
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.toolCount > 0)).toBe(true);
  });

  it('filters by keyword', async () => {
    const idx = await loadActorIndex(ASSETS_WITH_INDEX);
    const results = filterActors(idx, { keyword: 'lazarus' });
    expect(results).toHaveLength(1);
    expect(results[0]?.slug).toBe('lazarus-group');
  });

  it('respects limit', async () => {
    const idx = await loadActorIndex(ASSETS_WITH_INDEX);
    const results = filterActors(idx, { limit: 2 });
    expect(results).toHaveLength(2);
  });

  it('returns empty for no match', async () => {
    const idx = await loadActorIndex(ASSETS_WITH_INDEX);
    const results = filterActors(idx, { keyword: 'zzz_nonexistent_zzz' });
    expect(results).toHaveLength(0);
  });
});

describe('actorsCacheStats', () => {
  it('returns initial zero state', () => {
    const stats = actorsCacheStats();
    expect(stats.indexLoaded).toBe(false);
    expect(stats.aptmapLoaded).toBe(false);
    expect(stats.actors.size).toBe(0);
    expect(stats.actors.hits).toBe(0);
    expect(stats.actors.misses).toBe(0);
  });

  it('reflects state after loads', async () => {
    await loadActorIndex(ASSETS_WITH_EVERYTHING);
    await loadAptmap(ASSETS_WITH_EVERYTHING);
    await getActor(ASSETS_WITH_EVERYTHING, 'apt-41');
    const stats = actorsCacheStats();
    expect(stats.indexLoaded).toBe(true);
    expect(stats.aptmapLoaded).toBe(true);
    expect(stats.actors.size).toBe(1);
  });
});

describe('_resetEtdaCacheForTests', () => {
  it('clears all caches', async () => {
    await loadActorIndex(ASSETS_WITH_EVERYTHING);
    await getActor(ASSETS_WITH_EVERYTHING, 'apt-41');
    _resetEtdaCacheForTests();
    const stats = actorsCacheStats();
    expect(stats.indexLoaded).toBe(false);
    expect(stats.actors.size).toBe(0);
  });
});