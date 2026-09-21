import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadLotsIndex,
  listLots,
  getLots,
  lotsCacheStats,
  _resetLotsCacheForTests,
  type LotsIndex,
} from './lots-manifest';

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

const FAKE_INDEX: LotsIndex = {
  source: 'lots-project.com (mr.d0x)',
  license: 'upstream-collection',
  replicatedAt: '2026-09-21',
  count: 3,
  tags: ['C&C', 'Download', 'Phishing'],
  tagCounts: { 'C&C': 2, Download: 2, Phishing: 2 },
  entries: [
    {
      slug: 'github-com',
      website: 'github.com',
      provider: 'Github',
      tags: ['Phishing', 'Download'],
      description: 'Attackers can host malware on Github.com.',
      url: 'https://lots-project.com/site/6769746875622e636f6d',
    },
    {
      slug: 'discord-com',
      website: 'discord.com',
      provider: 'Discord',
      tags: ['C&C'],
      description: 'Attackers can utilize discord.com for C&C purposes.',
      url: 'https://lots-project.com/site/646973636f72642e636f6d',
    },
    {
      slug: 'pastebin-com',
      website: 'pastebin.com',
      provider: 'Pastebin',
      tags: ['Download', 'C&C'],
      description: 'Malware can fetch additional tools from pastebin.com.',
      url: 'https://lots-project.com/site/706173746562696e2e636f6d',
    },
  ],
};

describe('lots-manifest', () => {
  beforeEach(() => _resetLotsCacheForTests());

  it('loads the index from ASSETS and caches it', async () => {
    const assets = mockAssets({ '/data/lots/index.json': FAKE_INDEX });
    const idx = await loadLotsIndex(assets);
    expect(idx.count).toBe(3);
    expect(lotsCacheStats().indexLoaded).toBe(true);
    const again = await loadLotsIndex({
      fetch: () => {
        throw new Error('should not fetch');
      },
    } as unknown as Fetcher);
    expect(again).toBe(idx);
  });

  it('throws a helpful error when the build has not run', async () => {
    await expect(loadLotsIndex(mockAssets({}))).rejects.toThrow('build-lots-manifest');
  });

  it('filters by tag and provider', () => {
    expect(
      listLots(FAKE_INDEX, { tag: 'C&C' })
        .map((e) => e.slug)
        .sort()
    ).toEqual(['discord-com', 'pastebin-com']);
    expect(listLots(FAKE_INDEX, { provider: 'discord' }).map((e) => e.slug)).toEqual(['discord-com']);
  });

  it('searches by keyword', () => {
    expect(
      listLots(FAKE_INDEX, { keyword: 'malware' })
        .map((e) => e.slug)
        .sort()
    ).toEqual(['github-com', 'pastebin-com']);
    expect(listLots(FAKE_INDEX, { keyword: 'no-such-thing' })).toHaveLength(0);
  });

  it('gets a single site by slug', () => {
    expect(getLots(FAKE_INDEX, 'github-com')?.provider).toBe('Github');
    expect(getLots(FAKE_INDEX, 'nope')).toBeUndefined();
  });
});
