import { describe, it, expect, vi, beforeEach } from 'vitest';
import { trege } from '../../src/providers/tre-ge';
import type { ProviderEnv } from '../../src/providers/types';

const env: ProviderEnv = {
  VT_API_KEY: '',
  ABUSEIPDB_API_KEY: '',
  SHODAN_API_KEY: '',
  CENSYS_PAT: '',
  CENSYS_ORG_ID: '',
  NETLAS_API_KEY: '',
  OTX_API_KEY: '',
  URLSCAN_API_KEY: '',
  HYBRID_ANALYSIS_API_KEY: '',
};

beforeEach(() => vi.restoreAllMocks());

describe('tre.ge adapter', () => {
  it('flags malicious when reputation=malicious and exposes provenance', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          indicator: '1.2.3.4',
          type: 'ip',
          reputation: 'malicious',
          score: 88,
          asn: 'AS12345 Test Net',
          country: 'US',
          sources: [
            { name: 'abuse.ch', verdict: 'malicious', reference: 'https://example.test' },
            { name: 'alienvault', verdict: 'malicious' },
          ],
          tags: ['c2', 'botnet'],
          first_seen: '2024-01-15T00:00:00Z',
          last_seen: '2025-06-01T00:00:00Z',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );

    const r = await trege({ type: 'ipv4', value: '1.2.3.4' }, env, AbortSignal.timeout(2000));

    expect(r.status).toBe('ok');
    expect(r.source).toBe('tre-ge');
    expect(r.verdict).toBe('malicious');
    expect(r.score).toBe(88);
    expect(r.tags).toEqual(expect.arrayContaining(['c2', 'botnet', 'trege:malicious']));
    expect(r.raw_summary).toMatchObject({
      reputation: 'malicious',
      asn: 'AS12345 Test Net',
      country: 'US',
    });
  });

  it('maps suspicious reputation to suspicious verdict', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ reputation: 'suspicious', score: 55 }), { status: 200 })
    );
    const r = await trege({ type: 'domain', value: 'example.com' }, env, AbortSignal.timeout(2000));
    expect(r.verdict).toBe('suspicious');
    expect(r.score).toBe(55);
  });

  it('treats 404 as no-record (ok, unknown)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('not found', { status: 404 }));
    const r = await trege({ type: 'domain', value: 'unknown.example' }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('ok');
    expect(r.verdict).toBe('unknown');
    expect(r.tags).toContain('no-record');
  });

  it('returns error on 429 (rate-limited)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('rate limit', { status: 429 }));
    const r = await trege({ type: 'ipv4', value: '1.2.3.4' }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('error');
    expect(r.error).toBe('rate-limited');
  });

  it('returns unsupported for an unhandled indicator type', async () => {
    const r = await trege({ type: 'cve', value: 'CVE-2024-1234' }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('unsupported');
  });

  it('falls back to score-based mapping when reputation field is missing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ score: 80 }), { status: 200 }));
    const r = await trege({ type: 'hash', value: 'a'.repeat(64) }, env, AbortSignal.timeout(2000));
    expect(r.verdict).toBe('malicious');
    expect(r.score).toBe(80);
  });
});
