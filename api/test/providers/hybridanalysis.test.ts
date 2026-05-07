import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hybridanalysis } from '../../src/providers/hybridanalysis';
import type { ProviderEnv } from '../../src/providers/types';

const env: ProviderEnv = {
  VT_API_KEY: '',
  ABUSEIPDB_API_KEY: '',
  SHODAN_API_KEY: '',
  GREYNOISE_API_KEY: '',
  OTX_API_KEY: '',
  URLSCAN_API_KEY: '',
  HYBRID_ANALYSIS_API_KEY: 'fake-key',
  PULSEDIVE_API_KEY: '',
};

beforeEach(() => vi.restoreAllMocks());

describe('hybridanalysis adapter', () => {
  it('returns ok with score derived from threat_score (hash)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            verdict: 'malicious',
            threat_score: 90,
            vx_family: 'Mirai',
            submit_name: 'malware.exe',
          },
        ]),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );

    const r = await hybridanalysis({ type: 'hash', value: 'a'.repeat(64) }, env, AbortSignal.timeout(2000));

    expect(r.status).toBe('ok');
    expect(r.source).toBe('hybridanalysis');
    expect(r.score).toBe(90);
    expect(r.verdict).toBe('malicious');
    expect(r.tags).toContain('Mirai');
    expect(r.raw_summary).toMatchObject({ verdict: 'malicious', threat_score: 90, vx_family: 'Mirai' });
    expect(r.cached).toBe(false);
  });

  it('returns low score when verdict is no specific threat', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            verdict: 'no specific threat',
            threat_score: null,
            vx_family: null,
            submit_name: 'file.txt',
          },
        ]),
        { status: 200 }
      )
    );
    const r = await hybridanalysis({ type: 'hash', value: 'abc123' }, env, AbortSignal.timeout(2000));
    expect(r.score).toBe(5);
    expect(r.verdict).toBe('clean');
  });

  it('returns error on 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('unauthorized', { status: 401, statusText: 'Unauthorized' })
    );
    const r = await hybridanalysis({ type: 'hash', value: 'abc123' }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('error');
    expect(r.error).toMatch(/401/);
  });

  it('returns unsupported for ipv4 indicator', async () => {
    const r = await hybridanalysis({ type: 'ipv4', value: '1.2.3.4' }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('unsupported');
  });

  it('handles fetch rejection (timeout/abort)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('aborted'));
    const r = await hybridanalysis({ type: 'hash', value: 'abc123' }, env, AbortSignal.timeout(50));
    expect(r.status).toBe('error');
  });

  it('returns score 0 when results array is empty', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    const r = await hybridanalysis({ type: 'hash', value: 'abc123' }, env, AbortSignal.timeout(2000));
    expect(r.score).toBe(0);
    expect(r.verdict).toBe('clean');
  });
});
