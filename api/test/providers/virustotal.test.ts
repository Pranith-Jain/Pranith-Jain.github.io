import { describe, it, expect, vi, beforeEach } from 'vitest';
import { virustotal } from '../../src/providers/virustotal';
import type { ProviderEnv } from '../../src/providers/types';

const env: ProviderEnv = {
  VT_API_KEY: 'fake-key',
  ABUSEIPDB_API_KEY: '',
  SHODAN_API_KEY: '',
  GREYNOISE_API_KEY: '',
  OTX_API_KEY: '',
  URLSCAN_API_KEY: '',
  HYBRID_ANALYSIS_API_KEY: '',
  PULSEDIVE_API_KEY: '',
};

beforeEach(() => vi.restoreAllMocks());

describe('virustotal adapter', () => {
  it('returns ok with score derived from detection ratio (IPv4)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            attributes: {
              last_analysis_stats: { malicious: 5, suspicious: 2, harmless: 70, undetected: 0 },
              tags: ['suspicious'],
            },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );

    const r = await virustotal({ type: 'ipv4', value: '1.1.1.1' }, env, AbortSignal.timeout(2000));

    expect(r.status).toBe('ok');
    expect(r.source).toBe('virustotal');
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.tags).toContain('suspicious');
    expect(r.cached).toBe(false);
  });

  it('returns clean verdict when 0 detections (hash)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            attributes: {
              last_analysis_stats: { malicious: 0, suspicious: 0, harmless: 70, undetected: 5 },
              tags: [],
            },
          },
        }),
        { status: 200 }
      )
    );
    const r = await virustotal({ type: 'hash', value: 'a'.repeat(64) }, env, AbortSignal.timeout(2000));
    expect(r.score).toBe(0);
    expect(r.verdict).toBe('clean');
  });

  it('returns error on 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('unauthorized', { status: 401, statusText: 'Unauthorized' })
    );
    const r = await virustotal({ type: 'ipv4', value: '1.1.1.1' }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('error');
    expect(r.error).toMatch(/401/);
  });

  it('returns unsupported for email indicator', async () => {
    const r = await virustotal({ type: 'email', value: 'a@b.com' }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('unsupported');
  });

  it('handles fetch rejection (timeout/abort)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('aborted'));
    const r = await virustotal({ type: 'ipv4', value: '1.1.1.1' }, env, AbortSignal.timeout(50));
    expect(r.status).toBe('error');
  });

  it('builds url-type endpoint with base64url encoding', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            attributes: { last_analysis_stats: { malicious: 0, suspicious: 0, harmless: 1, undetected: 0 }, tags: [] },
          },
        }),
        { status: 200 }
      )
    );
    await virustotal({ type: 'url', value: 'https://example.com/path' }, env, AbortSignal.timeout(2000));
    const calledUrl = String(fetchSpy.mock.calls[0]?.[0] ?? '');
    expect(calledUrl).toContain('virustotal.com/api/v3/urls/');
    // VT base64url: no +, no /, no padding
    expect(calledUrl).not.toContain('+');
    expect(calledUrl).not.toContain('=');
  });
});
