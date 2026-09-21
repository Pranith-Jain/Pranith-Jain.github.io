import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apivoid } from '../../src/providers/apivoid';
import type { ProviderEnv } from '../../src/providers/types';

const env = {
  VT_API_KEY: '',
  ABUSEIPDB_API_KEY: '',
  SHODAN_API_KEY: '',
  CENSYS_PAT: '',
  CENSYS_ORG_ID: '',
  NETLAS_API_KEY: '',
  OTX_API_KEY: '',
  URLSCAN_API_KEY: '',
  HYBRID_ANALYSIS_API_KEY: '',
  APIVOID_API_KEY: 'fake-key',
} as unknown as ProviderEnv;

const noKeyEnv = { ...env, APIVOID_API_KEY: undefined } as unknown as ProviderEnv;

beforeEach(() => vi.restoreAllMocks());

function mockOk(body: unknown) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  );
}

describe('apivoid adapter', () => {
  it('returns unsupported without an API key', async () => {
    const r = await apivoid({ type: 'ipv4', value: '1.1.1.1' }, noKeyEnv, AbortSignal.timeout(2000));
    expect(r.status).toBe('unsupported');
    expect(r.source).toBe('apivoid');
  });

  it('returns unsupported for non-IP/domain/url types', async () => {
    const r = await apivoid({ type: 'hash', value: 'abc' }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('unsupported');
  });

  it('maps a high-risk IP to malicious', async () => {
    mockOk({
      ip: '80.82.77.139',
      blacklists: {
        engines: {
          0: { name: 'Backscatterer', detected: true, reference: 'https://www.backscatterer.org/' },
          1: { name: 'BitNinja', detected: true, reference: 'https://bitninja.com/' },
          2: { name: '0spam', detected: false, reference: 'https://0spam.org/' },
        },
        detections: 27,
        engines_count: 80,
        detection_rate: '33%',
      },
      anonymity: { is_proxy: false, is_vpn: false, is_tor: false, is_hosting: true },
      information: { country_code: 'NL', isp: 'FiberXpress BV', asn: 'AS202425' },
      risk_score: { result: 100 },
    });

    const r = await apivoid({ type: 'ipv4', value: '80.82.77.139' }, env, AbortSignal.timeout(2000));

    expect(r.status).toBe('ok');
    expect(r.verdict).toBe('malicious');
    expect(r.score).toBe(90);
    expect(r.tags).toContain('country:nl');
    expect(r.tags).toContain('hosting');
    const summary = r.raw_summary as { detections: number; risk_score: number };
    expect(summary.detections).toBe(27);
    expect(summary.risk_score).toBe(100);
  });

  it('maps a clean IP to clean', async () => {
    mockOk({
      ip: '1.1.1.1',
      blacklists: { engines: { 0: { name: '0spam', detected: false } }, detections: 0, engines_count: 80 },
      anonymity: { is_proxy: false, is_vpn: false, is_tor: false, is_hosting: false },
      information: { country_code: 'AU' },
      risk_score: { result: 0 },
    });

    const r = await apivoid({ type: 'ipv4', value: '1.1.1.1' }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('ok');
    expect(r.verdict).toBe('clean');
    expect(r.score).toBe(0);
  });

  it('flags tor exit as suspicious and posts host for URLs', async () => {
    mockOk({
      ip: '1.2.3.4',
      blacklists: { engines: {}, detections: 0, engines_count: 80 },
      anonymity: { is_tor: true },
      information: {},
      risk_score: { result: 10 },
    });

    const r = await apivoid({ type: 'ipv4', value: '1.2.3.4' }, env, AbortSignal.timeout(2000));
    expect(r.verdict).toBe('suspicious');

    mockOk({ host: 'example.com', blacklists: { engines: {}, detections: 0 }, risk_score: { result: 0 } });
    const fetchSpy = vi.mocked(globalThis.fetch);
    await apivoid({ type: 'url', value: 'https://example.com/path?q=1' }, env, AbortSignal.timeout(2000));
    const [, init] = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ host: 'example.com' });
  });

  it('maps domain detections to malicious', async () => {
    mockOk({
      host: 'evil.example',
      blacklists: {
        engines: {
          0: { name: 'Phishing Test', detected: true },
          1: { name: 'Scam Test', detected: true },
          2: { name: 'Badbitcoin', detected: true },
        },
        detections: 3,
      },
      risk_score: { result: 95 },
    });

    const r = await apivoid({ type: 'domain', value: 'evil.example' }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('ok');
    expect(r.verdict).toBe('malicious');
  });

  it('surfaces upstream errors as error, not clean', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('quota', { status: 429 }));
    const r = await apivoid({ type: 'ipv4', value: '1.1.1.1' }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('error');
    expect(r.verdict).toBe('unknown');
  });
});
