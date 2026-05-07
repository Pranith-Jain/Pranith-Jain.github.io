import { describe, it, expect, vi, beforeEach } from 'vitest';
import { urlscan } from '../../src/providers/urlscan';
import type { ProviderEnv } from '../../src/providers/types';

const env: ProviderEnv = {
  VT_API_KEY: '',
  ABUSEIPDB_API_KEY: '',
  SHODAN_API_KEY: '',
  GREYNOISE_API_KEY: '',
  OTX_API_KEY: '',
  URLSCAN_API_KEY: 'fake-key',
  HYBRID_ANALYSIS_API_KEY: '',
  PULSEDIVE_API_KEY: '',
};

beforeEach(() => vi.restoreAllMocks());

describe('urlscan adapter', () => {
  it('returns ok with score derived from highest _score in results', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          results: [
            {
              _score: 75,
              tags: ['phishing', 'malware'],
              task: { url: 'https://evil.com' },
              verdicts: { overall: { score: 75 } },
            },
            {
              _score: 50,
              tags: ['suspicious'],
              task: { url: 'https://evil.com/page' },
              verdicts: { overall: { score: 50 } },
            },
          ],
          total: 2,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );

    const r = await urlscan({ type: 'url', value: 'https://evil.com' }, env, AbortSignal.timeout(2000));

    expect(r.status).toBe('ok');
    expect(r.source).toBe('urlscan');
    expect(r.score).toBe(75);
    expect(r.verdict).toBe('malicious');
    expect(r.tags).toContain('phishing');
    expect(r.tags).toContain('malware');
    expect(r.raw_summary).toMatchObject({ result_count: 2, top_score: 75 });
    expect(r.cached).toBe(false);
  });

  it('returns score 0 when results array is empty', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ results: [], total: 0 }), { status: 200 })
    );
    const r = await urlscan({ type: 'domain', value: 'safe.com' }, env, AbortSignal.timeout(2000));
    expect(r.score).toBe(0);
    expect(r.verdict).toBe('clean');
  });

  it('returns error on 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('unauthorized', { status: 401, statusText: 'Unauthorized' })
    );
    const r = await urlscan({ type: 'url', value: 'https://example.com' }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('error');
    expect(r.error).toMatch(/401/);
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
