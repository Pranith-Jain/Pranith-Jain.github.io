import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pulsedive } from '../../src/providers/pulsedive';
import type { ProviderEnv } from '../../src/providers/types';

const env: ProviderEnv = {
  VT_API_KEY: '',
  ABUSEIPDB_API_KEY: '',
  SHODAN_API_KEY: '',
  GREYNOISE_API_KEY: '',
  OTX_API_KEY: '',
  URLSCAN_API_KEY: '',
  HYBRID_ANALYSIS_API_KEY: '',
  PULSEDIVE_API_KEY: 'fake-key',
};

beforeEach(() => vi.restoreAllMocks());

describe('pulsedive adapter', () => {
  it('returns ok with score derived from risk (critical)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          risk: 'critical',
          attributes: {
            threats: [{ name: 'Emotet' }, { name: 'TrickBot' }],
            feeds: [{ name: 'Abuse.ch' }],
          },
          riskfactors: [{ description: 'Known C2 server' }, { description: 'Port 443 open' }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );

    const r = await pulsedive({ type: 'ipv4', value: '1.2.3.4' }, env, AbortSignal.timeout(2000));

    expect(r.status).toBe('ok');
    expect(r.source).toBe('pulsedive');
    expect(r.score).toBe(90);
    expect(r.verdict).toBe('malicious');
    expect(r.tags).toContain('Emotet');
    expect(r.tags).toContain('Known C2 server');
    expect(r.raw_summary).toMatchObject({ risk: 'critical', threats_count: 2, feeds_count: 1 });
    expect(r.cached).toBe(false);
  });

  it('returns clean verdict when risk is none', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          risk: 'none',
          attributes: { threats: [], feeds: [] },
          riskfactors: [],
        }),
        { status: 200 }
      )
    );
    const r = await pulsedive({ type: 'domain', value: 'safe.com' }, env, AbortSignal.timeout(2000));
    expect(r.score).toBe(0);
    expect(r.verdict).toBe('clean');
  });

  it('returns error on 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('unauthorized', { status: 401, statusText: 'Unauthorized' })
    );
    const r = await pulsedive({ type: 'ipv4', value: '1.2.3.4' }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('error');
    expect(r.error).toMatch(/401/);
  });

  it('returns unsupported for email indicator', async () => {
    const r = await pulsedive({ type: 'email', value: 'a@b.com' }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('unsupported');
  });

  it('handles fetch rejection (timeout/abort)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('aborted'));
    const r = await pulsedive({ type: 'ipv4', value: '1.2.3.4' }, env, AbortSignal.timeout(50));
    expect(r.status).toBe('error');
  });

  it('dedupes and limits tags to 10', async () => {
    const threats = Array.from({ length: 8 }, (_, i) => ({ name: `Threat${i + 1}` }));
    const riskfactors = Array.from({ length: 6 }, (_, i) => ({ description: `Factor${i + 1}` }));
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          risk: 'high',
          attributes: { threats, feeds: [] },
          riskfactors,
        }),
        { status: 200 }
      )
    );
    const r = await pulsedive({ type: 'url', value: 'https://evil.com' }, env, AbortSignal.timeout(2000));
    expect(r.tags.length).toBeLessThanOrEqual(10);
  });
});
