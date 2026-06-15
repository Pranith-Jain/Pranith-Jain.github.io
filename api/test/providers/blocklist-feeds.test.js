import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sslbl } from '../../src/providers/sslbl';
import { x4bnet } from '../../src/providers/x4bnet';
const env = {}; // both adapters ignore env
beforeEach(() => vi.restoreAllMocks());
describe('sslbl adapter — reads the IP from the correct CSV column', () => {
    // Real feed schema: `Firstseen,DstIP,DstPort` (the IP is column 2). The old
    // code read parts[0] (the timestamp) → the set was always empty → every IP
    // wrongly "clean".
    const CSV = '# Firstseen,DstIP,DstPort\n2025-08-20 00:00:00,1.2.3.4,443\n2025-08-21 00:00:00,5.6.7.8,8443\n';
    it('flags a listed IP as malicious', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(CSV, { status: 200 }));
        const r = await sslbl({ type: 'ipv4', value: '1.2.3.4' }, env, AbortSignal.timeout(2000));
        expect(r.status).toBe('ok');
        expect(r.verdict).toBe('malicious');
        expect(r.score).toBe(85);
        expect(r.raw_summary).toMatchObject({ listed: true, list_size: 2 });
    });
    it('returns clean for an unlisted IP (and the list actually parsed)', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(CSV, { status: 200 }));
        const r = await sslbl({ type: 'ipv4', value: '9.9.9.9' }, env, AbortSignal.timeout(2000));
        expect(r.verdict).toBe('clean');
        expect(r.raw_summary).toMatchObject({ listed: false, list_size: 2 });
    });
});
describe('x4bnet adapter — CIDR membership, not exact-string match', () => {
    const FEED = '# X4BNet VPN\n2.56.16.0/22\n2.26.157.0/24\n';
    it('flags an IP inside a listed CIDR range as suspicious', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(FEED, { status: 200 }));
        const r = await x4bnet({ type: 'ipv4', value: '2.26.157.42' }, env, AbortSignal.timeout(2000));
        expect(r.status).toBe('ok');
        expect(r.verdict).toBe('suspicious');
        expect(r.tags).toContain('vpn-endpoint');
    });
    it('returns clean for an IP outside every range', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(FEED, { status: 200 }));
        const r = await x4bnet({ type: 'ipv4', value: '9.9.9.9' }, env, AbortSignal.timeout(2000));
        expect(r.verdict).toBe('clean');
    });
});
