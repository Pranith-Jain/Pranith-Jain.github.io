import { afterEach, describe, expect, it, vi } from 'vitest';

function okJson(payload: unknown): Response {
  return { ok: true, status: 200, json: () => Promise.resolve(payload) } as unknown as Response;
}

async function freshModule() {
  vi.resetModules();
  return import('./ransomware-recent');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchRansomwareRecent', () => {
  it('coalesces concurrent callers into a single network request', async () => {
    const { fetchRansomwareRecent } = await freshModule();
    const payload = { victims: [{ discovered: '2026-09-30T00:00:00Z' }] };
    let resolveFetch!: (r: Response) => void;
    const fetchSpy = vi.fn(
      () =>
        new Promise<Response>((res) => {
          resolveFetch = res;
        })
    );
    vi.stubGlobal('fetch', fetchSpy);

    const a = fetchRansomwareRecent();
    const b = fetchRansomwareRecent();
    resolveFetch(okJson(payload));

    const [ra, rb] = await Promise.all([a, b]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(ra).toEqual(payload);
    expect(rb).toEqual(payload);
  });

  it('reuses a successful payload inside the TTL without refetching', async () => {
    const { fetchRansomwareRecent } = await freshModule();
    const fetchSpy = vi.fn(() => Promise.resolve(okJson({ victims: [] })));
    vi.stubGlobal('fetch', fetchSpy);

    await fetchRansomwareRecent();
    const again = await fetchRansomwareRecent();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(again).toEqual({ victims: [] });
  });

  it('force bypasses the TTL with a cache-busting query string', async () => {
    const { fetchRansomwareRecent } = await freshModule();
    const fetchSpy = vi.fn(() => Promise.resolve(okJson({ victims: [] })));
    vi.stubGlobal('fetch', fetchSpy);

    await fetchRansomwareRecent();
    await fetchRansomwareRecent({ force: true });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(String(fetchSpy.mock.calls[1]?.[0])).toMatch(/\?cb=\d+$/);
  });

  it('resolves null on non-2xx and on network failure — never rejects', async () => {
    const { fetchRansomwareRecent } = await freshModule();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status: 503 } as Response))
    );
    await expect(fetchRansomwareRecent()).resolves.toBeNull();

    vi.resetModules();
    const { fetchRansomwareRecent: retry } = await freshModule();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline')))
    );
    await expect(retry()).resolves.toBeNull();
  });

  it('a failed call leaves no cached payload, so the next call refetches', async () => {
    const { fetchRansomwareRecent } = await freshModule();
    const fetchSpy = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(okJson({ victims: [{ discovered: '2026-09-30' }] }));
    vi.stubGlobal('fetch', fetchSpy);

    await expect(fetchRansomwareRecent()).resolves.toBeNull();
    const second = await fetchRansomwareRecent();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(second).toEqual({ victims: [{ discovered: '2026-09-30' }] });
  });
});
