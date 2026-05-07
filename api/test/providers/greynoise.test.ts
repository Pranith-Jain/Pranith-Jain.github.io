import { describe, it, expect, vi, beforeEach } from 'vitest';
import { greynoise } from '../../src/providers/greynoise';
import type { ProviderEnv } from '../../src/providers/types';

const env: ProviderEnv = {
  VT_API_KEY: '',
  ABUSEIPDB_API_KEY: '',
  SHODAN_API_KEY: '',
  GREYNOISE_API_KEY: 'fake-key',
  OTX_API_KEY: '',
  URLSCAN_API_KEY: '',
  HYBRID_ANALYSIS_API_KEY: '',
  PULSEDIVE_API_KEY: '',
};

beforeEach(() => vi.restoreAllMocks());

describe('greynoise adapter', () => {
  it('returns ok with score derived from classification (malicious)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          classification: 'malicious',
          name: 'Mirai',
          last_seen: '2024-01-01',
          noise: true,
          riot: false,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );

    const r = await greynoise({ type: 'ipv4', value: '1.2.3.4' }, env, AbortSignal.timeout(2000));

    expect(r.status).toBe('ok');
    expect(r.source).toBe('greynoise');
    expect(r.score).toBe(80);
    expect(r.verdict).toBe('malicious');
    expect(r.tags).toContain('Mirai');
    expect(r.tags).toContain('noise:true');
    expect(r.cached).toBe(false);
  });

  it('returns clean verdict when classification is benign', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          classification: 'benign',
          name: 'Cloudflare',
          last_seen: '2024-01-01',
          noise: false,
          riot: true,
        }),
        { status: 200 }
      )
    );
    const r = await greynoise({ type: 'ipv4', value: '1.1.1.1' }, env, AbortSignal.timeout(2000));
    expect(r.score).toBe(5);
    expect(r.verdict).toBe('clean');
    expect(r.tags).toContain('riot:true');
  });

  it('returns error on 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('unauthorized', { status: 401, statusText: 'Unauthorized' })
    );
    const r = await greynoise({ type: 'ipv4', value: '1.2.3.4' }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('error');
    expect(r.error).toMatch(/401/);
  });

  it('returns unsupported for domain indicator', async () => {
    const r = await greynoise({ type: 'domain', value: 'example.com' }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('unsupported');
  });

  it('handles fetch rejection (timeout/abort)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('aborted'));
    const r = await greynoise({ type: 'ipv4', value: '1.2.3.4' }, env, AbortSignal.timeout(50));
    expect(r.status).toBe('error');
  });

  it('maps unknown classification to score 30', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          classification: 'unknown',
          name: '',
          last_seen: '',
          noise: false,
          riot: false,
        }),
        { status: 200 }
      )
    );
    const r = await greynoise({ type: 'ipv6', value: '2001:db8::1' }, env, AbortSignal.timeout(2000));
    expect(r.score).toBe(30);
    expect(r.status).toBe('ok');
  });
});
