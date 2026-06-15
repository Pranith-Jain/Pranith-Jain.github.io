import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vulncheckIp, vulncheckCve } from '../../src/lib/vulncheck';
beforeEach(() => vi.restoreAllMocks());
describe('vulncheckIp', () => {
    it('errors without a token (no fetch)', async () => {
        const spy = vi.spyOn(globalThis, 'fetch');
        const r = await vulncheckIp('', '1.2.3.4');
        expect('err' in r).toBe(true);
        if ('err' in r)
            expect(r.err.code).toBe('upstream_4xx');
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
        expect('ok' in r).toBe(true);
        if (!('ok' in r))
            throw new Error('expected ok result');
        expect(r.ok.found).toBe(true);
        expect(r.ok.tags.sort()).toEqual(['c2', 'initial-access']);
        expect(r.ok.country).toBe('RU');
        expect(r.ok.cves).toContain('CVE-2024-1709');
        const init = spy.mock.calls[0]?.[1];
        expect(init.headers.Authorization).toBe('Bearer tok');
        expect(String(spy.mock.calls[0]?.[0])).toContain('/v3/index/ipintel-3d?ip=1.2.3.4');
    });
    it('returns not-found on an empty index response', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 }));
        const r = await vulncheckIp('tok', '8.8.8.8');
        expect('ok' in r).toBe(true);
        if (!('ok' in r))
            throw new Error('expected ok result');
        expect(r.ok.found).toBe(false);
    });
    it('errors on a non-ok upstream', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('', { status: 403 }));
        const r = await vulncheckIp('tok', '1.2.3.4');
        expect('err' in r).toBe(true);
        if ('err' in r) {
            expect(r.err.code).toBe('upstream_4xx');
            expect(r.err.status).toBe(403);
        }
    });
});
describe('vulncheckCve', () => {
    it('flags exploited when initial-access records exist + collects actors', async () => {
        const body = JSON.stringify({ _meta: { total_documents: 1 }, data: [{ threat_actor: 'LockBit' }] });
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(body, { status: 200 }));
        const r = await vulncheckCve('tok', 'cve-2024-1709');
        expect('ok' in r).toBe(true);
        if (!('ok' in r))
            throw new Error('expected ok result');
        expect(r.ok.cve).toBe('CVE-2024-1709');
        expect(r.ok.exploited).toBe(true);
        expect(r.ok.reported).toContain('LockBit');
    });
    it('returns not-exploited on empty data', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 }));
        const r = await vulncheckCve('tok', 'CVE-2000-0001');
        expect('ok' in r).toBe(true);
        if (!('ok' in r))
            throw new Error('expected ok result');
        expect(r.ok.exploited).toBe(false);
    });
});
