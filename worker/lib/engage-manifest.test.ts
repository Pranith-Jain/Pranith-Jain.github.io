import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadEngageIndex,
  listEngage,
  getEngage,
  engageCacheStats,
  _resetEngageCacheForTests,
  type EngageIndex,
} from './engage-manifest';

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

const FAKE_INDEX: EngageIndex = {
  source: 'engage.mitre.org (MITRE Engage)',
  license: 'upstream-collection',
  replicatedAt: '2026-09-21',
  count: 3,
  phases: ['Engage', 'Prepare'],
  goals: [
    { name: 'Collect', phase: 'Engage', topGoal: 'Expose' },
    { name: 'Prepare', phase: 'Prepare', topGoal: 'Prepare' },
  ],
  approaches: [
    {
      slug: 'lures',
      name: 'Lures',
      goal: 'Detect',
      phase: 'Engage',
      topGoal: 'Expose',
      url: 'https://engage.mitre.org/matrix/',
    },
    {
      slug: 'personas',
      name: 'Personas',
      goal: 'Direct',
      phase: 'Engage',
      topGoal: 'Affect',
      url: 'https://engage.mitre.org/matrix/',
    },
    {
      slug: 'threat-model',
      name: 'Threat Model',
      goal: 'Prepare',
      phase: 'Prepare',
      topGoal: 'Prepare',
      url: 'https://engage.mitre.org/matrix/',
    },
  ],
};

describe('engage-manifest', () => {
  beforeEach(() => _resetEngageCacheForTests());

  it('loads the index from ASSETS and caches it', async () => {
    const assets = mockAssets({ '/data/engage/index.json': FAKE_INDEX });
    const idx = await loadEngageIndex(assets);
    expect(idx.count).toBe(3);
    expect(engageCacheStats().indexLoaded).toBe(true);
    const again = await loadEngageIndex({
      fetch: () => {
        throw new Error('should not fetch');
      },
    } as unknown as Fetcher);
    expect(again).toBe(idx);
  });

  it('throws a helpful error when the build has not run', async () => {
    await expect(loadEngageIndex(mockAssets({}))).rejects.toThrow('build-engage-manifest');
  });

  it('filters by goal (incl. top goal), phase, and keyword', () => {
    expect(listEngage(FAKE_INDEX, { goal: 'expose' }).map((a) => a.slug)).toEqual(['lures']);
    expect(listEngage(FAKE_INDEX, { goal: 'direct' }).map((a) => a.slug)).toEqual(['personas']);
    expect(listEngage(FAKE_INDEX, { phase: 'prepare' }).map((a) => a.slug)).toEqual(['threat-model']);
    expect(listEngage(FAKE_INDEX, { keyword: 'persona' }).map((a) => a.slug)).toEqual(['personas']);
    expect(listEngage(FAKE_INDEX, { keyword: 'no-such-thing' })).toHaveLength(0);
  });

  it('gets a single approach by slug', () => {
    expect(getEngage(FAKE_INDEX, 'lures')?.goal).toBe('Detect');
    expect(getEngage(FAKE_INDEX, 'nope')).toBeUndefined();
  });
});
