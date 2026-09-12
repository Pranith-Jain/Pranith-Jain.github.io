import { describe, it, expect, vi, beforeEach } from 'vitest';
import { stalkphish } from '../../src/providers/stalkphish';
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
  STALKPHISH_API_KEY: 'fake-key',
};

const noKeyEnv: ProviderEnv = { ...env, STALKPHISH_API_KEY: undefined };

beforeEach(() => vi.restoreAllMocks());

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('stalkphish adapter', () => {
  it('flags malicious with kit/brand/telegram tags on a hit', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse([
        {
          siteurl: 'https://fake-paypal-login.com/signin',
          sitedomain: 'fake-paypal-login.com',
          pagetitle: 'PayPal Login',
          firstseentime: '2026-09-10T10:30:00Z',
          ipaddress: '198.51.100.7',
          asn: 'AS12345',
          phishing_score: 92,
          phishingkit_family: 'PayPalKit',
          targeted_brand: 'PayPal',
          extracted_telegram: '@scam_support_bot',
          zipfilehash: 'abc123def456',
        },
      ])
    );

    const r = await stalkphish(
      { type: 'url', value: 'https://fake-paypal-login.com/signin' },
      env,
      AbortSignal.timeout(2000)
    );

    expect(r.status).toBe('ok');
    expect(r.source).toBe('stalkphish');
    expect(r.score).toBe(85);
    expect(r.verdict).toBe('malicious');
    expect(r.tags).toContain('kit:paypalkit');
    expect(r.tags).toContain('brand:paypal');
    expect(r.tags).toContain('telegram-exfil');
    expect(r.tags).toContain('kit-hash');
    expect(r.raw_summary).toMatchObject({ match_count: 1, kit_family: 'PayPalKit' });
    expect(r.cached).toBe(false);
  });

  it('scores a bare hit (no enrichment fields) at 75, still malicious', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse([{ siteurl: 'https://evil.example/x', sitedomain: 'evil.example' }])
    );
    const r = await stalkphish({ type: 'domain', value: 'evil.example' }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('ok');
    expect(r.verdict).toBe('malicious');
    expect(r.score).toBe(75);
  });

  it('abstains (unknown, NOT clean) on an empty result set', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse([]));
    const r = await stalkphish({ type: 'domain', value: 'safe.example' }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('ok');
    expect(r.score).toBe(0);
    expect(r.verdict).toBe('unknown');
  });

  it('queries the exact-match ipv4 endpoint for IP indicators', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse([]));
    await stalkphish({ type: 'ipv4', value: '198.51.100.7' }, env, AbortSignal.timeout(2000));
    expect(spy).toHaveBeenCalledOnce();
    expect(String(spy.mock.calls[0]?.[0])).toContain('/search/ipv4/198.51.100.7');
  });

  it('sends the Token auth header', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse([]));
    await stalkphish({ type: 'domain', value: 'x.example' }, env, AbortSignal.timeout(2000));
    const init = spy.mock.calls[0]?.[1] as RequestInit | undefined;
    expect((init?.headers as Record<string, string>)?.['Authorization']).toBe('Token fake-key');
  });

  it('returns unsupported without a key', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const r = await stalkphish({ type: 'url', value: 'https://x.example/' }, noKeyEnv, AbortSignal.timeout(2000));
    expect(r.status).toBe('unsupported');
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns unsupported for email indicators', async () => {
    const r = await stalkphish({ type: 'email', value: 'a@b.example' }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('unsupported');
  });

  it('surfaces 401 and 429 as typed errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('unauthorized', { status: 401 }));
    const unauth = await stalkphish({ type: 'domain', value: 'x.example' }, env, AbortSignal.timeout(2000));
    expect(unauth.status).toBe('error');
    expect(unauth.error_code).toBe('unauthorized');

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('slow down', { status: 429 }));
    const limited = await stalkphish({ type: 'domain', value: 'x.example' }, env, AbortSignal.timeout(2000));
    expect(limited.status).toBe('error');
    expect(limited.error_code).toBe('rate_limited');
  });
});
