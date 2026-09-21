import { describe, it, expect, vi, beforeEach } from 'vitest';
import { metadefender } from '../../src/providers/metadefender';
import type { ProviderEnv } from '../../src/providers/types';

const env = {
  VT_API_KEY: '',
  ABUSEIPDB_API_KEY: '',
  SHODAN_API_KEY: '',
  CENSYS_PAT: '',
  CENSYS_ORG_ID: '',
  NETLAS_API_KEY: '',
  OTX_API_KEY: '',
  URLSCAN_API_KEY: '',
  HYBRID_ANALYSIS_API_KEY: '',
  METADEFENDER_API_KEY: 'fake-key',
} as unknown as ProviderEnv;

const noKeyEnv = { ...env, METADEFENDER_API_KEY: undefined } as unknown as ProviderEnv;

beforeEach(() => vi.restoreAllMocks());

function mockOk(body: unknown) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  );
}

const HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

describe('metadefender adapter', () => {
  it('returns unsupported without an API key', async () => {
    const r = await metadefender({ type: 'hash', value: HASH }, noKeyEnv, AbortSignal.timeout(2000));
    expect(r.status).toBe('unsupported');
    expect(r.source).toBe('metadefender');
  });

  it('returns unsupported for non-hash types', async () => {
    const r = await metadefender({ type: 'ipv4', value: '1.1.1.1' }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('unsupported');
  });

  it('sends the apikey header to the v5 threat-intel endpoint', async () => {
    mockOk({ sha256: HASH, reputation: 'benign' });
    const fetchSpy = vi.mocked(globalThis.fetch);
    const r = await metadefender({ type: 'hash', value: HASH }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('ok');
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/v5/threat-intel/av-file-reputation/');
    expect((init.headers as Record<string, string>).apikey).toBe('fake-key');
  });

  it('maps malicious reputation to malicious', async () => {
    mockOk({ md5: 'abc', sha1: 'def', sha256: HASH, reputation: 'malicious' });
    const r = await metadefender({ type: 'hash', value: HASH }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('ok');
    expect(r.verdict).toBe('malicious');
    expect(r.score).toBe(90);
    expect(r.tags).toContain('reputation:malicious');
  });

  it('maps benign reputation to clean', async () => {
    mockOk({ sha256: HASH, reputation: 'benign' });
    const r = await metadefender({ type: 'hash', value: HASH }, env, AbortSignal.timeout(2000));
    expect(r.verdict).toBe('clean');
    expect(r.score).toBe(0);
  });

  it('falls back to v4 engine counts when reputation is unknown', async () => {
    mockOk({ sha256: HASH, reputation: 'unknown', scan_results: { total_detected_avs: 12, total_avs: 30 } });
    const r = await metadefender({ type: 'hash', value: HASH }, env, AbortSignal.timeout(2000));
    expect(r.verdict).toBe('malicious');
    expect(r.score).toBeGreaterThan(50);

    mockOk({ sha256: HASH, reputation: 'unknown', scan_results: { total_detected_avs: 0, total_avs: 30 } });
    const r2 = await metadefender({ type: 'hash', value: HASH }, env, AbortSignal.timeout(2000));
    expect(r2.verdict).toBe('clean');
  });

  it('surfaces upstream errors as error, not clean', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('denied', { status: 401 }));
    const r = await metadefender({ type: 'hash', value: HASH }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('error');
    expect(r.verdict).toBe('unknown');
  });
});
