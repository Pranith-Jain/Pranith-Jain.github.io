import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchMtiSource, isMtiSource, MTI_SOURCES } from '../../src/lib/mythreatintel-api';
import type { Env } from '../../src/env';

const envWithToken = { MYTHREATINTEL_API_TOKEN: 'test-token' } as unknown as Env;
const envNoToken = {} as unknown as Env;

describe('isMtiSource', () => {
  it('accepts every documented source', () => {
    for (const s of MTI_SOURCES) expect(isMtiSource(s)).toBe(true);
  });
  it('rejects unknown sources', () => {
    expect(isMtiSource('bogus')).toBe(false);
    expect(isMtiSource('ioc')).toBe(false); // singular is not the canonical key
  });
});

describe('fetchMtiSource', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns ok:false without calling upstream when the token is unset', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const r = await fetchMtiSource(envNoToken, 'iocs');
    expect(r.ok).toBe(false);
    expect(r.items).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it('normalizes the {status,metadata,data} envelope', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'success',
          metadata: { total: 24596, count: 2, limit: 2, offset: 0 },
          data: [
            { sha256: 'a'.repeat(64), file_name: 'x.exe', type: 'exe', _source: 'malware' },
            { sha256: 'b'.repeat(64), file_name: 'y.ps1', type: 'ps1', _source: 'malware' },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    const r = await fetchMtiSource(envWithToken, 'iocs', { q: `q-${Date.now()}` });
    expect(r.ok).toBe(true);
    expect(r.total).toBe(24596);
    expect(r.count).toBe(2);
    expect(r.items).toHaveLength(2);
    expect((r.items[0] as { sha256?: string }).sha256).toBe('a'.repeat(64));
  });

  it('returns ok:false on a non-2xx upstream (caller falls back)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 401 }));
    const r = await fetchMtiSource(envWithToken, 'cve', { q: `q-${Date.now()}` });
    expect(r.ok).toBe(false);
    expect(r.items).toEqual([]);
  });

  it('clamps limit into 1–500 and sends a Bearer token', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ status: 'success', metadata: {}, data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    await fetchMtiSource(envWithToken, 'leaks', { limit: 9999, q: `q-${Date.now()}` });
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('limit=500');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-token');
  });
});
