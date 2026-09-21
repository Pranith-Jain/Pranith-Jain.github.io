import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadHijacklibsIndex,
  listHijacklibs,
  getHijacklib,
  hijacklibsCacheStats,
  _resetHijacklibsCacheForTests,
  type HijacklibIndex,
} from './hijacklibs-manifest';

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

const FAKE_INDEX: HijacklibIndex = {
  source: 'hijacklibs.net (Wietze Beukema)',
  license: 'upstream-collection',
  replicatedAt: '2026-09-21',
  count: 2,
  hijackTypes: ['Phantom', 'Sideloading'],
  typeCounts: { Phantom: 1, Sideloading: 1 },
  withCve: 1,
  entries: [
    {
      slug: 'test-dll',
      dll: 'test.dll',
      vendor: 'TestVendor',
      cve: 'CVE-2024-1234',
      hijackTypes: ['Sideloading'],
      executableCount: 1,
      executables: [{ path: '%PROGRAMFILES%\\Test\\app.exe', type: 'Sideloading' }],
      expectedLocations: ['%SYSTEM32%\\test.dll'],
      resourceCount: 1,
      description:
        'test.dll is a known DLL hijacking candidate (Sideloading) with 1 vulnerable executable (CVE-2024-1234).',
      url: 'https://hijacklibs.net/entries/test/test.html',
    },
    {
      slug: 'phantom-dll',
      dll: 'phantom.dll',
      vendor: 'OtherVendor',
      cve: null,
      hijackTypes: ['Phantom'],
      executableCount: 2,
      executables: [],
      expectedLocations: [],
      resourceCount: 0,
      description: 'phantom.dll is a known DLL hijacking candidate (Phantom) with 2 vulnerable executables.',
      url: 'https://hijacklibs.net/entries/other/phantom.html',
    },
  ],
};

describe('hijacklibs-manifest', () => {
  beforeEach(() => _resetHijacklibsCacheForTests());

  it('loads the index from ASSETS and caches it', async () => {
    const assets = mockAssets({ '/data/hijacklibs/index.json': FAKE_INDEX });
    const idx = await loadHijacklibsIndex(assets);
    expect(idx.count).toBe(2);
    expect(hijacklibsCacheStats().indexLoaded).toBe(true);
    const again = await loadHijacklibsIndex({
      fetch: () => {
        throw new Error('should not fetch');
      },
    } as unknown as Fetcher);
    expect(again).toBe(idx);
  });

  it('throws a helpful error when the build has not run', async () => {
    await expect(loadHijacklibsIndex(mockAssets({}))).rejects.toThrow('build-hijacklibs-manifest');
  });

  it('filters by type, vendor, and cveOnly', () => {
    expect(listHijacklibs(FAKE_INDEX, { type: 'sideloading' }).map((e) => e.slug)).toEqual(['test-dll']);
    expect(listHijacklibs(FAKE_INDEX, { vendor: 'othervendor' }).map((e) => e.slug)).toEqual(['phantom-dll']);
    expect(listHijacklibs(FAKE_INDEX, { cveOnly: true }).map((e) => e.slug)).toEqual(['test-dll']);
  });

  it('searches by keyword', () => {
    expect(listHijacklibs(FAKE_INDEX, { keyword: 'cve-2024' }).map((e) => e.slug)).toEqual(['test-dll']);
    expect(listHijacklibs(FAKE_INDEX, { keyword: 'no-such-thing' })).toHaveLength(0);
  });

  it('gets a single DLL by slug', () => {
    expect(getHijacklib(FAKE_INDEX, 'test-dll')?.vendor).toBe('TestVendor');
    expect(getHijacklib(FAKE_INDEX, 'nope')).toBeUndefined();
  });
});
