import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shodan } from '../../src/providers/shodan';
import type { ProviderEnv } from '../../src/providers/types';

const env: ProviderEnv = {
  VT_API_KEY: '',
  ABUSEIPDB_API_KEY: '',
  SHODAN_API_KEY: 'fake-key',
  GREYNOISE_API_KEY: '',
  OTX_API_KEY: '',
  URLSCAN_API_KEY: '',
  HYBRID_ANALYSIS_API_KEY: '',
  PULSEDIVE_API_KEY: '',
};

beforeEach(() => vi.restoreAllMocks());

describe('shodan adapter', () => {
  it('returns ok with score derived from vulns and ports (IPv4)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ip_str: '1.2.3.4',
          country_name: 'Germany',
          org: 'Hetzner',
          ports: [22, 80, 443, 8080, 8443],
          tags: ['cloud', 'self-signed'],
          vulns: ['CVE-2021-1234', 'CVE-2021-5678', 'CVE-2022-0001'],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );

    const r = await shodan({ type: 'ipv4', value: '1.2.3.4' }, env, AbortSignal.timeout(2000));

    expect(r.status).toBe('ok');
    expect(r.source).toBe('shodan');
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.tags).toContain('Germany');
    expect(r.tags).toContain('Hetzner');
    expect(r.cached).toBe(false);
  });

  it('returns low score when no vulns and few ports', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ip_str: '1.1.1.1',
          country_name: 'US',
          org: 'Cloudflare',
          ports: [80, 443],
          tags: [],
          vulns: [],
        }),
        { status: 200 }
      )
    );
    const r = await shodan({ type: 'ipv4', value: '1.1.1.1' }, env, AbortSignal.timeout(2000));
    expect(r.score).toBe(0);
    expect(r.verdict).toBe('clean');
  });

  it('returns ok with score for domain type', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          domain: 'example.com',
          subdomains: ['www', 'mail', 'ftp'],
          tags: [],
          data: [],
        }),
        { status: 200 }
      )
    );
    const r = await shodan({ type: 'domain', value: 'example.com' }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('ok');
    expect(r.raw_summary).toHaveProperty('subdomains_count', 3);
  });

  it('returns error on 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('unauthorized', { status: 401, statusText: 'Unauthorized' })
    );
    const r = await shodan({ type: 'ipv4', value: '1.2.3.4' }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('error');
    expect(r.error).toMatch(/401/);
  });

  it('returns unsupported for hash indicator', async () => {
    const r = await shodan({ type: 'hash', value: 'a'.repeat(64) }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('unsupported');
  });

  it('handles fetch rejection (timeout/abort)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('aborted'));
    const r = await shodan({ type: 'ipv4', value: '1.2.3.4' }, env, AbortSignal.timeout(50));
    expect(r.status).toBe('error');
  });

  it('builds domain endpoint correctly', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ domain: 'example.com', subdomains: [], tags: [], data: [] }), { status: 200 })
      );
    await shodan({ type: 'domain', value: 'example.com' }, env, AbortSignal.timeout(2000));
    const calledUrl = String(fetchSpy.mock.calls[0]?.[0] ?? '');
    expect(calledUrl).toContain('/dns/domain/example.com');
    expect(calledUrl).toContain('key=fake-key');
  });
});
