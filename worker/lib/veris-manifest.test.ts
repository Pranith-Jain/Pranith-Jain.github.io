import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadVerisIndex,
  listVeris,
  getVeris,
  verisCacheStats,
  _resetVerisCacheForTests,
  type VerisIndex,
} from './veris-manifest';

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

const FAKE_INDEX: VerisIndex = {
  source: 'github.com/vz-risk/VERIS',
  license: 'CC BY-SA 4.0',
  replicatedAt: '2026-09-21',
  count: 2,
  sections: [{ section: 'action', fieldCount: 1, valueCount: 2 }],
  entries: [
    {
      slug: 'action-hacking-variety',
      path: 'action.hacking.variety',
      section: 'action',
      category: 'hacking',
      field: 'variety',
      values: [
        { value: 'Backdoor', label: 'Hacking action that creates a backdoor for use.' },
        { value: 'Brute force', label: 'Brute force or password guessing attacks.' },
      ],
    },
    {
      slug: 'actor-external-motive',
      path: 'actor.external.motive',
      section: 'actor',
      category: 'external',
      field: 'motive',
      values: [{ value: 'Espionage', label: '' }],
    },
  ],
};

describe('veris-manifest', () => {
  beforeEach(() => _resetVerisCacheForTests());

  it('loads the index from ASSETS and caches it', async () => {
    const assets = mockAssets({ '/data/veris/index.json': FAKE_INDEX });
    const idx = await loadVerisIndex(assets);
    expect(idx.count).toBe(2);
    expect(verisCacheStats().indexLoaded).toBe(true);
    const again = await loadVerisIndex({
      fetch: () => {
        throw new Error('should not fetch');
      },
    } as unknown as Fetcher);
    expect(again).toBe(idx);
  });

  it('throws a helpful error when the build has not run', async () => {
    await expect(loadVerisIndex(mockAssets({}))).rejects.toThrow('build-veris-manifest');
  });

  it('filters by section and keyword', () => {
    expect(listVeris(FAKE_INDEX, { section: 'action' }).map((e) => e.slug)).toEqual(['action-hacking-variety']);
    expect(listVeris(FAKE_INDEX, { keyword: 'backdoor' }).map((e) => e.slug)).toEqual(['action-hacking-variety']);
    expect(listVeris(FAKE_INDEX, { keyword: 'espionage' }).map((e) => e.slug)).toEqual(['actor-external-motive']);
    expect(listVeris(FAKE_INDEX, { keyword: 'no-such-thing' })).toHaveLength(0);
  });

  it('gets a single field by slug', () => {
    expect(getVeris(FAKE_INDEX, 'action-hacking-variety')?.values).toHaveLength(2);
    expect(getVeris(FAKE_INDEX, 'nope')).toBeUndefined();
  });
});
