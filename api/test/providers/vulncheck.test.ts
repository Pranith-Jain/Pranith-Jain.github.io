import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vulncheck } from '../../src/providers/vulncheck';
import type { ProviderEnv } from '../../src/providers/types';

beforeEach(() => vi.restoreAllMocks());

const env = (token?: string) => ({ VULNCHECK_API_TOKEN: token }) as ProviderEnv;

describe('vulncheck provider', () => {
  it('is unsupported for non-ipv4 indicators', async () => {
    const r = await vulncheck({ type: 'domain', value: 'x.com' }, env('tok'), AbortSignal.timeout(2000));
    expect(r.status).toBe('unsupported');
  });

  it('is unsupported (with hint) when no token is configured', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const r = await vulncheck({ type: 'ipv4', value: '1.2.3.4' }, env(undefined), AbortSignal.timeout(2000));
    expect(r.status).toBe('unsupported');
    expect(r.error).toBe('no_vulncheck_token');
    expect(spy).not.toHaveBeenCalled();
  });

  it('flags a C2 IP as malicious from ipintel-3d', async () => {
    const body = JSON.stringify({
      _meta: { total_documents: 1 },
      data: [{ detection: 'c2', country: 'RU', asn: 'AS1', cves: ['CVE-2024-1709'] }],
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(body, { status: 200 }));
    const r = await vulncheck({ type: 'ipv4', value: '1.2.3.4' }, env('tok'), AbortSignal.timeout(2000));
    expect(r.verdict).toBe('malicious');
    expect(r.score).toBe(90);
    expect(r.tags).toContain('c2');
    expect(r.raw_summary).toMatchObject({ country: 'RU' });
  });

  it('returns clean when the IP is not listed', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    const r = await vulncheck({ type: 'ipv4', value: '8.8.8.8' }, env('tok'), AbortSignal.timeout(2000));
    expect(r.verdict).toBe('clean');
    expect(r.status).toBe('ok');
  });
});
