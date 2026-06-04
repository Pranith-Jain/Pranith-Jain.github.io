import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vulncheckIp, vulncheckCve } from '../../src/lib/vulncheck';

beforeEach(() => vi.restoreAllMocks());

describe('vulncheckIp', () => {
  it('returns null without a token (no fetch)', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    expect(await vulncheckIp('', '1.2.3.4')).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('sends a Bearer token to ipintel-3d and summarizes tags/country/cves', async () => {
    const body = JSON.stringify({
      _meta: { total_documents: 2 },
      data: [
        { detection: 'c2', country: 'RU', asn: 'AS12345', hostname: 'evil.example', cves: ['CVE-2024-1709'] },
        { detection: 'initial-access' },
      ],
    });
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(body, { status: 200 }));
    const r = await vulncheckIp('tok', '1.2.3.4');
    expect(r?.found).toBe(true);
    expect(r?.tags.sort()).toEqual(['c2', 'initial-access']);
    expect(r?.country).toBe('RU');
    expect(r?.cves).toContain('CVE-2024-1709');
    const init = spy.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(String(spy.mock.calls[0]?.[0])).toContain('/v3/index/ipintel-3d?ip=1.2.3.4');
  });

  it('returns not-found on an empty index response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    const r = await vulncheckIp('tok', '8.8.8.8');
    expect(r?.found).toBe(false);
  });

  it('returns null on a non-ok upstream', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('', { status: 403 }));
    expect(await vulncheckIp('tok', '1.2.3.4')).toBeNull();
  });
});

describe('vulncheckCve', () => {
  it('flags exploited when initial-access records exist + collects actors', async () => {
    const body = JSON.stringify({ _meta: { total_documents: 1 }, data: [{ threat_actor: 'LockBit' }] });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(body, { status: 200 }));
    const r = await vulncheckCve('tok', 'cve-2024-1709');
    expect(r?.cve).toBe('CVE-2024-1709');
    expect(r?.exploited).toBe(true);
    expect(r?.reported).toContain('LockBit');
  });

  it('returns not-exploited on empty data', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    const r = await vulncheckCve('tok', 'CVE-2000-0001');
    expect(r?.exploited).toBe(false);
  });
});
