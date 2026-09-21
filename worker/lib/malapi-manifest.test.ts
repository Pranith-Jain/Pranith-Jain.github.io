import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadMalapiIndex,
  listMalapi,
  getMalapi,
  malapiCacheStats,
  _resetMalapiCacheForTests,
  type MalapiIndex,
} from './malapi-manifest';

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

const FAKE_INDEX: MalapiIndex = {
  source: 'malapi.io (mr.d0x)',
  license: 'upstream-collection',
  replicatedAt: '2026-09-21',
  count: 3,
  categories: ['Enumeration', 'Injection'],
  entries: [
    {
      slug: 'process32first',
      name: 'Process32First',
      library: 'Kernel32.dll',
      categories: ['Enumeration'],
      associatedAttacks: ['Enumeration'],
      description: 'Process32First is used as part of CreateToolhelp32Snapshot for enumeration purposes.',
      documentation: 'https://docs.microsoft.com/en-us/windows/win32/api/tlhelp32/nf-tlhelp32-process32first',
      url: 'https://malapi.io/winapi/Process32First',
    },
    {
      slug: 'createremotethread',
      name: 'CreateRemoteThread',
      library: 'Kernel32.dll',
      categories: ['Injection'],
      associatedAttacks: ['Injection'],
      description: 'CreateRemoteThread is used to create a thread in another process.',
      documentation: '',
      url: 'https://malapi.io/winapi/CreateRemoteThread',
    },
    {
      slug: 'virtualalloc',
      name: 'VirtualAlloc',
      library: 'Kernel32.dll',
      categories: ['Injection', 'Evasion'],
      associatedAttacks: ['Injection'],
      description: 'VirtualAlloc reserves memory in a process.',
      documentation: '',
      url: 'https://malapi.io/winapi/VirtualAlloc',
    },
  ],
};

describe('malapi-manifest', () => {
  beforeEach(() => _resetMalapiCacheForTests());

  it('loads the index from ASSETS and caches it', async () => {
    const assets = mockAssets({ '/data/malapi/index.json': FAKE_INDEX });
    const idx = await loadMalapiIndex(assets);
    expect(idx.count).toBe(3);
    expect(malapiCacheStats().indexLoaded).toBe(true);
    const again = await loadMalapiIndex({
      fetch: () => {
        throw new Error('should not fetch');
      },
    } as unknown as Fetcher);
    expect(again).toBe(idx);
  });

  it('throws a helpful error when the build has not run', async () => {
    await expect(loadMalapiIndex(mockAssets({}))).rejects.toThrow('build-malapi-manifest');
  });

  it('filters by category and library', () => {
    expect(
      listMalapi(FAKE_INDEX, { category: 'Injection' })
        .map((e) => e.slug)
        .sort()
    ).toEqual(['createremotethread', 'virtualalloc']);
    expect(listMalapi(FAKE_INDEX, { library: 'kernel32.dll' })).toHaveLength(3);
  });

  it('searches by keyword across name/description/attacks', () => {
    expect(listMalapi(FAKE_INDEX, { keyword: 'hollowing' })).toHaveLength(0);
    expect(listMalapi(FAKE_INDEX, { keyword: 'thread' }).map((e) => e.slug)).toEqual(['createremotethread']);
    expect(
      listMalapi(FAKE_INDEX, { keyword: 'injection' })
        .map((e) => e.slug)
        .sort()
    ).toEqual(['createremotethread', 'virtualalloc']);
  });

  it('gets a single API by slug', () => {
    expect(getMalapi(FAKE_INDEX, 'process32first')?.library).toBe('Kernel32.dll');
    expect(getMalapi(FAKE_INDEX, 'nope')).toBeUndefined();
  });
});
