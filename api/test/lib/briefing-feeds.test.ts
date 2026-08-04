import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchMaliciousPackages, fetchDailyHuntIocFamilies } from '../../src/lib/briefing-builder/feeds';

beforeEach(() => vi.restoreAllMocks());

describe('fetchMaliciousPackages — windowed to newly-disclosed packages', () => {
  const since = new Date('2026-08-03T00:00:00Z');
  const until = new Date('2026-08-04T00:00:00Z');
  const commitsList = (shas: string[]) => JSON.stringify(shas.map((sha) => ({ sha, commit: { author: { date: '2026-08-03T12:00:00Z' } } })));
  const commitFiles = (files: Array<{ eco: string; pkg: string; status: string }>) => JSON.stringify({ files: files.map((f) => ({ filename: `osv/malicious/${f.eco}/${f.pkg}/MAL-0000-ghsa-malware.json`, status: f.status })) });

  it('returns [] when no window is supplied', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const out = await fetchMaliciousPackages(undefined);
    expect(out).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it('extracts newly-added packages from commit file lists in the window', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(commitsList(['abc123', 'def456']), { status: 200 }))
      .mockResolvedValueOnce(new Response(commitFiles([{ eco: 'npm', pkg: 'evil-pkg-a', status: 'added' }, { eco: 'npm', pkg: 'evil-pkg-b', status: 'added' }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(commitFiles([{ eco: 'pypi', pkg: 'bad-py-pkg', status: 'added' }, { eco: 'npm', pkg: 'evil-pkg-a', status: 'modified' }]), { status: 200 }));
    const out = await fetchMaliciousPackages(undefined, { since, until });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const listUrl = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(listUrl.pathname).toBe('/repos/ossf/malicious-packages/commits');
    expect(listUrl.searchParams.get('path')).toBe('osv/malicious');
    expect(out).toHaveLength(3);
    expect(out[0]!.publishedAt).toBe('2026-08-03T12:00:00Z');
  });

  it('returns [] when the commits list is empty', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('[]', { status: 200 }));
    expect(await fetchMaliciousPackages(undefined, { since, until })).toEqual([]);
  });

  it('returns [] when the commits-list call fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('rate limited', { status: 403 }));
    expect(await fetchMaliciousPackages(undefined, { since, until })).toEqual([]);
  });

  it('ignores paths outside osv/malicious/<eco>/<pkg>/', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(commitsList(['abc']), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ files: [{ filename: 'osv/malicious/.id-allocator', status: 'modified' }, { filename: 'README.md', status: 'modified' }, { filename: 'osv/malicious/npm/real-pkg/MAL-1.json', status: 'added' }, { filename: 'osv/malicious/unknown-eco/pkg/MAL-2.json', status: 'added' }] }), { status: 200 }));
    const out = await fetchMaliciousPackages(undefined, { since, until });
    expect(out).toHaveLength(1);
    expect(out[0]!.ecosystem).toBe('npm');
    expect(out[0]!.name).toBe('real-pkg');
  });

  it('survives a per-commit file-list failure', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(commitsList(['ok', 'bad']), { status: 200 }))
      .mockResolvedValueOnce(new Response(commitFiles([{ eco: 'npm', pkg: 'good', status: 'added' }]), { status: 200 }))
      .mockResolvedValueOnce(new Response('forbidden', { status: 403 }));
    const out = await fetchMaliciousPackages(undefined, { since, until });
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBe('good');
  });
});

describe('fetchDailyHuntIocFamilies — windowed by firstSeen', () => {
  const stubIndex = (iocIndex: unknown) => { vi.doMock('../../src/lib/threat-intel-manifest', () => ({ loadTiIndex: async () => iocIndex })); };
  beforeEach(() => { vi.resetModules(); vi.doUnmock('../../src/lib/briefing-builder/feeds'); });

  it('returns the full index when no window is supplied', async () => {
    stubIndex({ iocIndex: [{ slug: 'a', family: 'A', category: 'ransomware', firstSeen: null, mitreTechniques: [], indicatorCount: 1, description: '', aliases: [] }] });
    const { fetchDailyHuntIocFamilies } = await import('../../src/lib/briefing-builder/feeds');
    expect((await fetchDailyHuntIocFamilies({ ASSETS: {} } as never))).toHaveLength(1);
  });

  it('keeps only families whose firstSeen is inside the window', async () => {
    stubIndex({ iocIndex: [
      { slug: 'in-window', family: 'In', category: 'ransomware', firstSeen: '2026-08-03T12:00:00Z', mitreTechniques: [], indicatorCount: 5, description: '', aliases: [] },
      { slug: 'too-old', family: 'Old', category: 'malware', firstSeen: '2026-07-01T00:00:00Z', mitreTechniques: [], indicatorCount: 5, description: '', aliases: [] },
      { slug: 'null-seen', family: 'Null', category: 'apt', firstSeen: null, mitreTechniques: [], indicatorCount: 5, description: '', aliases: [] },
    ] });
    const { fetchDailyHuntIocFamilies } = await import('../../src/lib/briefing-builder/feeds');
    const out = await fetchDailyHuntIocFamilies({ ASSETS: {} } as never, { since: new Date('2026-08-03T00:00:00Z'), until: new Date('2026-08-04T00:00:00Z') });
    expect(out).toHaveLength(1);
    expect(out[0]!.slug).toBe('in-window');
  });

  it('returns [] when env.ASSETS is absent', async () => {
    expect(await fetchDailyHuntIocFamilies(undefined, { since: new Date('2026-08-03T00:00:00Z'), until: new Date('2026-08-04T00:00:00Z') })).toEqual([]);
  });
});
