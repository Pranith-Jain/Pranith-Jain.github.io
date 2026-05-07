import { describe, it, expect, vi, beforeEach } from 'vitest';
import { otx } from '../../src/providers/otx';
import type { ProviderEnv } from '../../src/providers/types';

const env: ProviderEnv = {
  VT_API_KEY: '',
  ABUSEIPDB_API_KEY: '',
  SHODAN_API_KEY: '',
  GREYNOISE_API_KEY: '',
  OTX_API_KEY: 'fake-key',
  URLSCAN_API_KEY: '',
  HYBRID_ANALYSIS_API_KEY: '',
  PULSEDIVE_API_KEY: '',
};

beforeEach(() => vi.restoreAllMocks());

describe('otx adapter', () => {
  it('returns ok with score derived from pulse count (IPv4)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          pulse_info: {
            count: 20,
            pulses: Array.from({ length: 20 }, (_, i) => ({ name: `Pulse ${i + 1}` })),
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );

    const r = await otx({ type: 'ipv4', value: '1.2.3.4' }, env, AbortSignal.timeout(2000));

    expect(r.status).toBe('ok');
    expect(r.source).toBe('otx');
    expect(r.score).toBe(80);
    expect(r.verdict).toBe('malicious');
    expect(r.tags.length).toBeGreaterThan(0);
    expect(r.tags.length).toBeLessThanOrEqual(5);
    expect(r.raw_summary).toMatchObject({ pulse_count: 20 });
    expect(r.cached).toBe(false);
  });

  it('returns clean verdict when pulse count is 0', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          pulse_info: { count: 0, pulses: [] },
        }),
        { status: 200 }
      )
    );
    const r = await otx({ type: 'hash', value: 'a'.repeat(64) }, env, AbortSignal.timeout(2000));
    expect(r.score).toBe(0);
    expect(r.verdict).toBe('clean');
  });

  it('returns error on 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('unauthorized', { status: 401, statusText: 'Unauthorized' })
    );
    const r = await otx({ type: 'ipv4', value: '1.2.3.4' }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('error');
    expect(r.error).toMatch(/401/);
  });

  it('returns unsupported for email indicator', async () => {
    const r = await otx({ type: 'email', value: 'a@b.com' }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('unsupported');
  });

  it('handles fetch rejection (timeout/abort)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('aborted'));
    const r = await otx({ type: 'domain', value: 'evil.com' }, env, AbortSignal.timeout(50));
    expect(r.status).toBe('error');
  });

  it('builds correct endpoint for each type', async () => {
    const cases: Array<{ type: string; value: string; expectedPath: string }> = [
      { type: 'ipv4', value: '1.2.3.4', expectedPath: '/indicators/IPv4/1.2.3.4/general' },
      { type: 'ipv6', value: '::1', expectedPath: '/indicators/IPv6/%3A%3A1/general' },
      { type: 'domain', value: 'example.com', expectedPath: '/indicators/domain/example.com/general' },
      { type: 'url', value: 'https://example.com', expectedPath: '/indicators/url/' },
      { type: 'hash', value: 'abc123', expectedPath: '/indicators/file/abc123/general' },
    ];

    for (const { type, value, expectedPath } of cases) {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(new Response(JSON.stringify({ pulse_info: { count: 0, pulses: [] } }), { status: 200 }));
      await otx({ type, value }, env, AbortSignal.timeout(2000));
      const calledUrl = String(fetchSpy.mock.calls[0]?.[0] ?? '');
      expect(calledUrl).toContain(expectedPath);
    }
  });
});
