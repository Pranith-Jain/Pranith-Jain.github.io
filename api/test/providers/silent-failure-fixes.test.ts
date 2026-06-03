import { describe, it, expect, vi, beforeEach } from 'vitest';
import { feodo } from '../../src/providers/feodo';
import { kaspersky } from '../../src/providers/kaspersky';
import { urlscan } from '../../src/providers/urlscan';
import { censys } from '../../src/providers/censys';
import { digitalside } from '../../src/providers/digitalside';
import { yaraify } from '../../src/providers/yaraify';
import type { ProviderEnv } from '../../src/providers/types';

const env = {} as ProviderEnv;
beforeEach(() => vi.restoreAllMocks());

describe('feodo — keys the C2 map on ip_address (not the always-undefined `ip`)', () => {
  const FEED = JSON.stringify([
    { ip_address: '50.16.16.211', port: 443, status: 'online', hostname: 'x', malware: 'QakBot' },
  ]);
  it('flags a listed C2 IP as malicious', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(FEED, { status: 200 }));
    const r = await feodo({ type: 'ipv4', value: '50.16.16.211' }, env, AbortSignal.timeout(2000));
    expect(r.verdict).toBe('malicious');
    expect(r.score).toBe(95);
    expect(r.raw_summary).toMatchObject({ ip: '50.16.16.211', malware: 'QakBot' });
  });
});

describe('kaspersky — reads top-level Zone (PascalCase) via the request= param', () => {
  it('maps Zone:"Red" to malicious', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ Zone: 'Red' }), { status: 200 }));
    const r = await kaspersky(
      { type: 'ipv4', value: '1.2.3.4' },
      { KASPERSKY_API_KEY: 'k' } as ProviderEnv,
      AbortSignal.timeout(2000)
    );
    expect(r.verdict).toBe('malicious');
    const calledUrl = String(spy.mock.calls[0]?.[0] ?? '');
    expect(calledUrl).toContain('/search/ip?request=1.2.3.4'); // ip path + request param
  });
  it('maps Zone:"Green" to clean', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ Zone: 'Green' }), { status: 200 })
    );
    const r = await kaspersky(
      { type: 'domain', value: 'ok.com' },
      { KASPERSKY_API_KEY: 'k' } as ProviderEnv,
      AbortSignal.timeout(2000)
    );
    expect(r.verdict).toBe('clean');
  });
});

describe('urlscan — no false "clean"; abstains without a malicious-tag signal', () => {
  it('returns unknown (not clean) when results carry no malicious tags', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ results: [{ tags: ['certstream'] }], total: 1 }), { status: 200 })
    );
    const r = await urlscan({ type: 'domain', value: 'example.com' }, env, AbortSignal.timeout(2000));
    expect(r.verdict).toBe('unknown');
  });
  it('flags suspicious when a result is tagged phishing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ results: [{ tags: ['phishing'] }], total: 1 }), { status: 200 })
    );
    const r = await urlscan({ type: 'url', value: 'https://evil.test' }, env, AbortSignal.timeout(2000));
    expect(r.verdict).toBe('suspicious');
  });
});

describe('censys — org id goes in X-Organization-ID, not concatenated into the Bearer token', () => {
  it('sends Bearer <pat> + X-Organization-ID header', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 404 }));
    await censys(
      { type: 'ipv4', value: '1.2.3.4' },
      { CENSYS_PAT: 'PAT', CENSYS_ORG_ID: 'ORG' } as ProviderEnv,
      AbortSignal.timeout(2000)
    );
    const init = spy.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer PAT');
    expect(headers['X-Organization-ID']).toBe('ORG');
  });
});

describe('digitalside — feeds use the master branch (main 404s)', () => {
  it('fetches from the master branch', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 200 }));
    await digitalside({ type: 'domain', value: 'evil.test' }, env, AbortSignal.timeout(2000));
    const urls = spy.mock.calls.map((c) => String(c[0]));
    expect(urls.every((u) => u.includes('/Threat-Intel/master/lists/'))).toBe(true);
    expect(urls.some((u) => u.includes('/main/lists/'))).toBe(false);
  });
});

describe('yaraify — lookup_hash query + nested data.tasks parsing (was always "clean")', () => {
  const ykEnv = { ABUSECH_AUTH_KEY: 'k' } as ProviderEnv;

  it('uses query=lookup_hash + search_term, not the bogus get_file_report/hash', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ query_status: 'no_result' }), { status: 200 }));
    await yaraify({ type: 'hash', value: 'ABCDEF' }, ykEnv, AbortSignal.timeout(2000));
    const body = String((spy.mock.calls[0]?.[1] as RequestInit).body);
    expect(body).toContain('query=lookup_hash');
    expect(body).toContain('search_term=abcdef'); // lowercased
    expect(body).not.toContain('get_file_report');
  });

  it('flags malicious from nested data.tasks[].static_results / clamav_results', async () => {
    const RESP = JSON.stringify({
      query_status: 'ok',
      data: {
        metadata: { first_seen: '2024-01-01', last_seen: '2024-02-01', sightings: 3 },
        tasks: [
          {
            clamav_results: ['Win.Trojan.Foo'],
            static_results: [{ rule_name: 'r1' }, { rule_name: 'r2' }, { rule_name: 'r3' }],
            unpack_results: [{ unpacked_yara_matches: [{ rule_name: 'r4' }] }],
          },
        ],
      },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(RESP, { status: 200 }));
    const r = await yaraify({ type: 'hash', value: 'deadbeef' }, ykEnv, AbortSignal.timeout(2000));
    expect(r.verdict).toBe('malicious'); // 4 yara + 1 clam = 5 signals → score 75
    expect(r.raw_summary).toMatchObject({ yara_rules: 4, clamav: 1, first_seen: '2024-01-01' });
  });

  it('returns clean (not error) on no_result', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ query_status: 'no_result' }), { status: 200 })
    );
    const r = await yaraify({ type: 'hash', value: 'aaaa' }, ykEnv, AbortSignal.timeout(2000));
    expect(r.status).toBe('ok');
    expect(r.verdict).toBe('clean');
  });
});
