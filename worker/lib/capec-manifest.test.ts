import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadCapecIndex,
  listCapec,
  getCapec,
  capecCacheStats,
  _resetCapecCacheForTests,
  type CapecIndex,
} from './capec-manifest';

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

const FAKE_INDEX: CapecIndex = {
  source: 'github.com/mitre/cti (CAPEC STIX 2.0)',
  license: 'upstream-collection',
  replicatedAt: '2026-09-21',
  count: 2,
  byAbstraction: { Standard: 1, Detailed: 1 },
  byStatus: { Draft: 2 },
  entries: [
    {
      slug: 'capec-87',
      capecId: 'CAPEC-87',
      name: 'Forceful Browsing',
      abstraction: 'Standard',
      status: 'Draft',
      likelihood: 'High',
      severity: 'High',
      domains: ['Software'],
      description: 'An attacker employs forceful browsing to access unreachable portions of a website.',
      prerequisites: 'Pages must be discoverable and improperly protected.',
      cweIds: ['CWE-425'],
      attackIds: [],
      url: 'https://capec.mitre.org/data/definitions/87.html',
    },
    {
      slug: 'capec-125',
      capecId: 'CAPEC-125',
      name: 'Flooding',
      abstraction: 'Detailed',
      status: 'Draft',
      likelihood: 'High',
      severity: 'Medium',
      domains: ['Software', 'Hardware'],
      description: 'An attacker floods a target with traffic.',
      prerequisites: '',
      cweIds: ['CWE-400'],
      attackIds: ['T1498'],
      url: 'https://capec.mitre.org/data/definitions/125.html',
    },
  ],
};

describe('capec-manifest', () => {
  beforeEach(() => _resetCapecCacheForTests());

  it('loads the index from ASSETS and caches it', async () => {
    const assets = mockAssets({ '/data/capec/index.json': FAKE_INDEX });
    const idx = await loadCapecIndex(assets);
    expect(idx.count).toBe(2);
    expect(capecCacheStats().indexLoaded).toBe(true);
    const again = await loadCapecIndex({
      fetch: () => {
        throw new Error('should not fetch');
      },
    } as unknown as Fetcher);
    expect(again).toBe(idx);
  });

  it('throws a helpful error when the build has not run', async () => {
    await expect(loadCapecIndex(mockAssets({}))).rejects.toThrow('build-capec-manifest');
  });

  it('filters by abstraction, cwe, and technique', () => {
    expect(listCapec(FAKE_INDEX, { abstraction: 'standard' }).map((e) => e.slug)).toEqual(['capec-87']);
    expect(listCapec(FAKE_INDEX, { cwe: 'cwe-400' }).map((e) => e.slug)).toEqual(['capec-125']);
    expect(listCapec(FAKE_INDEX, { technique: 't1498' }).map((e) => e.slug)).toEqual(['capec-125']);
  });

  it('searches by keyword', () => {
    expect(listCapec(FAKE_INDEX, { keyword: 'flooding' }).map((e) => e.slug)).toEqual(['capec-125']);
    expect(listCapec(FAKE_INDEX, { keyword: 'no-such-thing' })).toHaveLength(0);
  });

  it('gets a single pattern by slug', () => {
    expect(getCapec(FAKE_INDEX, 'capec-87')?.name).toBe('Forceful Browsing');
    expect(getCapec(FAKE_INDEX, 'nope')).toBeUndefined();
  });
});
