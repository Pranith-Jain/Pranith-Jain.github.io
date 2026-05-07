import { describe, it, expect, vi, beforeEach } from 'vitest';
import { aggregateExposure } from '../../src/lib/exposure';

const mockEnv = {
  VT_API_KEY: '',
  ABUSEIPDB_API_KEY: '',
  SHODAN_API_KEY: '',
  GREYNOISE_API_KEY: '',
  OTX_API_KEY: '',
  URLSCAN_API_KEY: '',
  HYBRID_ANALYSIS_API_KEY: '',
  PULSEDIVE_API_KEY: '',
};

beforeEach(() => vi.restoreAllMocks());

describe('aggregateExposure', () => {
  it('returns empty list on error from crt.sh', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('boom', { status: 500 }));
    const r = await aggregateExposure('example.com', mockEnv);
    expect(r.subdomains).toEqual([]);
    expect(r.score).toBe(0);
  });

  it('aggregates subdomains, dedupes, caps at 20', async () => {
    const ctRows = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      common_name: `s${i}.example.com`,
      name_value: `s${i}.example.com\nwww.example.com`,
      issuer_name: 'CN=R10',
      not_before: '2024-01-01',
      not_after: '2024-04-01',
    }));
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(ctRows))) // crt.sh
      .mockResolvedValue(new Response(JSON.stringify({ Status: 0, Answer: [] }))); // DoH for resolutions
    const r = await aggregateExposure('example.com', mockEnv);
    expect(r.subdomains.length).toBeLessThanOrEqual(20);
    expect(r.subdomains.every((s) => s.name.endsWith('.example.com') || s.name === 'example.com')).toBe(true);
  });

  it('skips Shodan when SHODAN_API_KEY is empty', async () => {
    const ctRows = [
      {
        id: 1,
        common_name: 'sub.example.com',
        name_value: 'sub.example.com',
        issuer_name: 'CN=R3',
        not_before: '2024-01-01',
        not_after: '2024-04-01',
      },
    ];
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(ctRows))) // crt.sh
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ Status: 0, Answer: [{ name: 'sub.example.com.', type: 1, TTL: 60, data: '93.184.216.34' }] })
        )
      ); // DoH
    await aggregateExposure('example.com', mockEnv);
    // No Shodan call should be made: total fetches = 1 crt.sh + 1 DoH per subdomain
    const calls = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.some((u) => u.includes('shodan.io'))).toBe(false);
  });
});
