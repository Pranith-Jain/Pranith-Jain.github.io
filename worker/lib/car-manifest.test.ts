import { describe, it, expect, beforeEach } from 'vitest';
import { loadCarIndex, listCar, getCar, carCacheStats, _resetCarCacheForTests, type CarIndex } from './car-manifest';

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

const FAKE_INDEX: CarIndex = {
  source: 'github.com/mitre-attack/car',
  license: 'Apache-2.0',
  replicatedAt: '2026-09-21',
  count: 2,
  techniqueCount: 3,
  entries: [
    {
      slug: 'car-2013-01-002',
      carId: 'CAR-2013-01-002',
      title: 'Autorun Differences',
      description: 'Running Autoruns periodically makes it possible to collect and monitor output for differences.',
      domain: 'Analytic, Host',
      platforms: ['Windows'],
      analyticTypes: ['Situational Awareness', 'TTP'],
      techniques: [{ technique: 'T1543', tactics: ['TA0003'], subtechniques: ['T1543.003'], coverage: 'Moderate' }],
      techniqueIds: ['T1543', 'T1543.003'],
      d3fend: [{ id: 'D3-SICA', label: 'System Init Config Analysis' }],
      implementations: ['pseudocode'],
      references: [],
      url: 'https://car.mitre.org/analytics/CAR-2013-01-002',
    },
    {
      slug: 'car-2019-04-002',
      carId: 'CAR-2019-04-002',
      title: 'Test Example',
      description: 'Network-based analytic example.',
      domain: 'Analytic, Network',
      platforms: ['Linux'],
      analyticTypes: ['TTP'],
      techniques: [{ technique: 'T1048', tactics: ['TA0010'], subtechniques: [], coverage: 'Partial' }],
      techniqueIds: ['T1048'],
      d3fend: [],
      implementations: ['Splunk'],
      references: [],
      url: 'https://car.mitre.org/analytics/CAR-2019-04-002',
    },
  ],
};

describe('car-manifest', () => {
  beforeEach(() => _resetCarCacheForTests());

  it('loads the index from ASSETS and caches it', async () => {
    const assets = mockAssets({ '/data/car/index.json': FAKE_INDEX });
    const idx = await loadCarIndex(assets);
    expect(idx.count).toBe(2);
    expect(carCacheStats().indexLoaded).toBe(true);
    const again = await loadCarIndex({
      fetch: () => {
        throw new Error('should not fetch');
      },
    } as unknown as Fetcher);
    expect(again).toBe(idx);
  });

  it('throws a helpful error when the build has not run', async () => {
    await expect(loadCarIndex(mockAssets({}))).rejects.toThrow('build-car-manifest');
  });

  it('filters by technique (case-insensitive) and platform', () => {
    expect(listCar(FAKE_INDEX, { technique: 't1543' }).map((e) => e.slug)).toEqual(['car-2013-01-002']);
    expect(listCar(FAKE_INDEX, { technique: 'T1543.003' }).map((e) => e.slug)).toEqual(['car-2013-01-002']);
    expect(listCar(FAKE_INDEX, { platform: 'linux' }).map((e) => e.slug)).toEqual(['car-2019-04-002']);
  });

  it('searches by keyword', () => {
    expect(listCar(FAKE_INDEX, { keyword: 'autoruns' }).map((e) => e.slug)).toEqual(['car-2013-01-002']);
    expect(listCar(FAKE_INDEX, { keyword: 'no-such-thing' })).toHaveLength(0);
  });

  it('gets a single analytic by slug', () => {
    expect(getCar(FAKE_INDEX, 'car-2013-01-002')?.title).toBe('Autorun Differences');
    expect(getCar(FAKE_INDEX, 'nope')).toBeUndefined();
  });
});
