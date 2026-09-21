import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadCtiBookmarksIndex,
  listBookmarks,
  getBookmark,
  ctiBookmarksCacheStats,
  _resetCtiBookmarksCacheForTests,
  type CtiBookmarksIndex,
} from './cti-bookmarks-manifest';

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

const FAKE_INDEX: CtiBookmarksIndex = {
  source: 'github.com/Chick3nHawk01/Open_Source-CTI-Tooling',
  license: 'upstream-collection',
  replicatedAt: '2026-09-21',
  count: 4,
  levels: ['Operational', 'Tactical'],
  categories: [
    { level: 'Operational', category: 'IoC Feeds & Sharing', count: 2 },
    { level: 'Tactical', category: 'TTP & Technique References', count: 2 },
  ],
  statusCounts: { live: 2, reference: 1, missing: 1 },
  entries: [
    {
      slug: 'threatfox',
      name: 'ThreatFox',
      url: 'https://threatfox.abuse.ch/',
      host: 'threatfox.abuse.ch',
      level: 'Operational',
      category: 'IoC Feeds & Sharing',
      description: 'Community IoC Exchange',
      status: 'live',
      platformRef: 'threatfox',
      tags: ['operational', 'ioc', 'feeds', 'sharing'],
    },
    {
      slug: 'firehol',
      name: 'FireHOL',
      url: 'http://iplists.firehol.org/',
      host: 'iplists.firehol.org',
      level: 'Operational',
      category: 'IoC Feeds & Sharing',
      description: 'Collection of IoC Lists',
      status: 'missing',
      platformRef: null,
      tags: ['operational', 'ioc'],
    },
    {
      slug: 'lolbas',
      name: 'LOLBAS',
      url: 'https://lolbas-project.github.io/',
      host: 'lolbas-project.github.io',
      level: 'Tactical',
      category: 'TTP & Technique References',
      description: 'Living Off The Land Windows Binaries',
      status: 'live',
      platformRef: 'lolbas',
      tags: ['tactical', 'ttp'],
    },
    {
      slug: 'malapi-io',
      name: 'MalAPI.io',
      url: 'https://malapi.io/',
      host: 'malapi.io',
      level: 'Tactical',
      category: 'TTP & Technique References',
      description: 'Windows APIs used by attackers',
      status: 'missing',
      platformRef: null,
      tags: ['tactical', 'ttp'],
    },
  ],
};

describe('cti-bookmarks-manifest', () => {
  beforeEach(() => _resetCtiBookmarksCacheForTests());

  it('loads the index from ASSETS and caches it', async () => {
    const assets = mockAssets({ '/data/cti-bookmarks/index.json': FAKE_INDEX });
    const idx = await loadCtiBookmarksIndex(assets);
    expect(idx.count).toBe(4);
    expect(idx.levels).toContain('Operational');
    expect(ctiBookmarksCacheStats().indexLoaded).toBe(true);
    // Second call serves cache without fetching.
    const again = await loadCtiBookmarksIndex({
      fetch: () => {
        throw new Error('should not fetch');
      },
    } as unknown as Fetcher);
    expect(again).toBe(idx);
  });

  it('throws a helpful error when the build has not run', async () => {
    const assets = mockAssets({});
    await expect(loadCtiBookmarksIndex(assets)).rejects.toThrow('build-cti-bookmarks');
  });

  it('filters by level, category, and status', () => {
    expect(listBookmarks(FAKE_INDEX, { level: 'Operational' })).toHaveLength(2);
    expect(listBookmarks(FAKE_INDEX, { category: 'TTP & Technique References' })).toHaveLength(2);
    expect(
      listBookmarks(FAKE_INDEX, { status: 'missing' })
        .map((e) => e.slug)
        .sort()
    ).toEqual(['firehol', 'malapi-io']);
  });

  it('searches by keyword across name/description/host/tags', () => {
    expect(listBookmarks(FAKE_INDEX, { keyword: 'lolbas' }).map((e) => e.slug)).toEqual(['lolbas']);
    expect(listBookmarks(FAKE_INDEX, { keyword: 'abuse.ch' }).map((e) => e.slug)).toEqual(['threatfox']);
    expect(listBookmarks(FAKE_INDEX, { keyword: 'no-such-thing' })).toHaveLength(0);
  });

  it('respects limit', () => {
    expect(listBookmarks(FAKE_INDEX, { limit: 1 })).toHaveLength(1);
  });

  it('gets a single bookmark by slug', () => {
    expect(getBookmark(FAKE_INDEX, 'threatfox')?.url).toBe('https://threatfox.abuse.ch/');
    expect(getBookmark(FAKE_INDEX, 'nope')).toBeUndefined();
  });
});
