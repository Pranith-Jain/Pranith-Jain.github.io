import { describe, it, expect, vi, beforeEach } from 'vitest';
import { abuseipdb } from '../../src/providers/abuseipdb';
import type { ProviderEnv } from '../../src/providers/types';

const env: ProviderEnv = {
  VT_API_KEY: '',
  ABUSEIPDB_API_KEY: 'fake-key',
  SHODAN_API_KEY: '',
  GREYNOISE_API_KEY: '',
  OTX_API_KEY: '',
  URLSCAN_API_KEY: '',
  HYBRID_ANALYSIS_API_KEY: '',
  PULSEDIVE_API_KEY: '',
};

beforeEach(() => vi.restoreAllMocks());

describe('abuseipdb adapter', () => {
  it('returns ok with score derived from abuseConfidenceScore (IPv4)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            abuseConfidenceScore: 85,
            countryCode: 'CN',
            usageType: 'Data Center/Web Hosting/Transit',
            isp: 'ChinaNet',
            totalReports: 42,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );

    const r = await abuseipdb({ type: 'ipv4', value: '1.2.3.4' }, env, AbortSignal.timeout(2000));

    expect(r.status).toBe('ok');
    expect(r.source).toBe('abuseipdb');
    expect(r.score).toBe(85);
    expect(r.verdict).toBe('malicious');
    expect(r.tags).toContain('CN');
    expect(r.tags).toContain('Data Center/Web Hosting/Transit');
    expect(r.raw_summary).toMatchObject({ confidence: 85, totalReports: 42, country: 'CN', isp: 'ChinaNet' });
    expect(r.cached).toBe(false);
  });

  it('returns clean verdict when abuseConfidenceScore is 0', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            abuseConfidenceScore: 0,
            countryCode: 'US',
            usageType: 'Fixed Line ISP',
            isp: 'Cloudflare',
            totalReports: 0,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );

    const r = await abuseipdb({ type: 'ipv4', value: '1.1.1.1' }, env, AbortSignal.timeout(2000));
    expect(r.score).toBe(0);
    expect(r.verdict).toBe('clean');
  });

  it('returns error on 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('unauthorized', { status: 401, statusText: 'Unauthorized' })
    );
    const r = await abuseipdb({ type: 'ipv4', value: '1.2.3.4' }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('error');
    expect(r.error).toMatch(/401/);
  });

  it('returns unsupported for domain indicator', async () => {
    const r = await abuseipdb({ type: 'domain', value: 'example.com' }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('unsupported');
  });

  it('handles fetch rejection (timeout/abort)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('aborted'));
    const r = await abuseipdb({ type: 'ipv4', value: '1.2.3.4' }, env, AbortSignal.timeout(50));
    expect(r.status).toBe('error');
  });

  it('also supports ipv6 type', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            abuseConfidenceScore: 45,
            countryCode: 'DE',
            usageType: 'Fixed Line ISP',
            isp: 'Deutsche Telekom',
            totalReports: 5,
          },
        }),
        { status: 200 }
      )
    );
    const r = await abuseipdb({ type: 'ipv6', value: '2001:db8::1' }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('ok');
    expect(r.verdict).toBe('suspicious');
  });
});
