import { describe, it, expect, vi, beforeEach } from 'vitest';
import { urlscan } from '../../src/providers/urlscan';
import type { ProviderEnv } from '../../src/providers/types';

const env: ProviderEnv = {
  VT_API_KEY: '',
  ABUSEIPDB_API_KEY: '',
  SHODAN_API_KEY: '',
  CENSYS_PAT: '',
  CENSYS_ORG_ID: '',
  NETLAS_API_KEY: '',
  OTX_API_KEY: '',
  URLSCAN_API_KEY: 'fake-key',
  HYBRID_ANALYSIS_API_KEY: '',
};

beforeEach(() => vi.restoreAllMocks());

describe('urlscan adapter', () => {
  it('flags suspicious from malicious result tags (Search API _score is always null)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          results: [
            { tags: ['phishing', 'malware'], task: { url: 'https://evil.com' } },
            { tags: ['certstream'], task: { url: 'https://evil.com/page' } },
          ],
          total: 2,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );

    const r = await urlscan({ type: 'url', value: 'https://evil.com' }, env, AbortSignal.timeout(2000));

    expect(r.status).toBe('ok');
    expect(r.source).toBe('urlscan');
    expect(r.score).toBe(60);
    expect(r.verdict).toBe('suspicious');
    expect(r.tags).toContain('phishing');
    expect(r.raw_summary).toMatchObject({ result_count: 2 });
    expect(r.cached).toBe(false);
  });

  it('abstains (unknown, NOT a false clean) when results are empty', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ results: [], total: 0 }), { status: 200 })
    );
    const r = await urlscan({ type: 'domain', value: 'safe.com' }, env, AbortSignal.timeout(2000));
    expect(r.score).toBe(0);
    expect(r.verdict).toBe('unknown');
  });

  it('returns error on 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('unauthorized', { status: 401, statusText: 'Unauthorized' })
    );
    const r = await urlscan({ type: 'url', value: 'https://example.com' }, env, AbortSignal.timeout(2000));
    // 401/403 are now treated as graceful no-access (membership / key tier issues),
    // so the IOC verdict isn't dragged down by a permission problem.
    expect(r.status).toBe('ok');
    expect(r.tags).toContain('urlscan-no-access');
  });

  it('returns unsupported for ipv4 indicator', async () => {
    const r = await urlscan({ type: 'ipv4', value: '1.2.3.4' }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('unsupported');
  });

  it('handles fetch rejection (timeout/abort)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('aborted'));
    const r = await urlscan({ type: 'url', value: 'https://example.com' }, env, AbortSignal.timeout(50));
    expect(r.status).toBe('error');
  });

  it('encodes query value in endpoint correctly', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [], total: 0 }), { status: 200 }));
    await urlscan({ type: 'domain', value: 'test.example.com' }, env, AbortSignal.timeout(2000));
    const calledUrl = String(fetchSpy.mock.calls[0]?.[0] ?? '');
    expect(calledUrl).toContain('urlscan.io/api/v1/search/');
    expect(calledUrl).toContain('test.example.com');
  });
});
