import { SELF } from 'cloudflare:test';
import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(() => vi.restoreAllMocks());

describe('GET /api/v1/ioc/check', () => {
  it('rejects missing indicator', async () => {
    const r = await SELF.fetch('https://x/api/v1/ioc/check');
    expect(r.status).toBe(400);
  });

  it('rejects unrecognized indicator', async () => {
    const r = await SELF.fetch('https://x/api/v1/ioc/check?indicator=lol');
    expect(r.status).toBe(400);
  });

  it('streams provider events for a valid IPv4', async () => {
    // Mock all outgoing fetches to return a benign-looking response.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            attributes: {
              last_analysis_stats: { malicious: 0, suspicious: 0, harmless: 1, undetected: 0 },
              tags: [],
            },
            abuseConfidenceScore: 5,
            countryCode: 'US',
          },
          classification: 'benign',
          pulse_info: { count: 0, pulses: [] },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );

    const r = await SELF.fetch('https://x/api/v1/ioc/check?indicator=8.8.8.8');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('text/event-stream');

    const text = await r.text();
    // 'meta' first, then per-provider 'result' events, then 'done'.
    expect(text).toMatch(/event: meta\b/);
    expect(text).toMatch(/event: result\b/);
    expect(text).toMatch(/event: done\b/);
  });

  it('meta event includes the eligible providers list', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    const r = await SELF.fetch('https://x/api/v1/ioc/check?indicator=example.com');
    const text = await r.text();
    // domain supports: virustotal, urlscan, otx, pulsedive, shodan
    const meta = text.match(/event: meta\ndata: (.+)/)?.[1];
    expect(meta).toBeTruthy();
    const m = JSON.parse(meta!);
    expect(m.type).toBe('domain');
    expect(m.providers).toEqual(expect.arrayContaining(['virustotal', 'urlscan', 'otx', 'pulsedive', 'shodan']));
    expect(m.providers).not.toContain('abuseipdb'); // doesn't support domain
  });
});
