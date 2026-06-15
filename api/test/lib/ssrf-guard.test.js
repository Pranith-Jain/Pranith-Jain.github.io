import { describe, it, expect, vi, afterEach } from 'vitest';
import { PRIVATE_IPV4, isPrivateIpv6, assertPublicHost, pinnedFetchFollow } from '../../src/lib/ssrf-guard';
describe('PRIVATE_IPV4', () => {
    const blocked = [
        '0.0.0.0',
        '10.0.0.1',
        '10.255.255.255',
        '100.64.0.1', // CGNAT
        '100.127.255.255',
        '127.0.0.1',
        '127.255.255.255',
        '168.63.129.16', // Azure metadata — added in this fix
        '169.254.169.254', // AWS / GCP / DO / Oracle metadata
        '172.16.0.1',
        '172.31.255.255',
        '192.0.0.1',
        '192.0.2.1',
        '192.88.99.1',
        '192.168.0.1',
        '198.18.0.1',
        '198.51.100.1',
        '203.0.113.1',
        '224.0.0.1', // multicast
        '255.255.255.255', // broadcast
    ];
    for (const ip of blocked) {
        it(`blocks ${ip}`, () => {
            expect(PRIVATE_IPV4.test(ip)).toBe(true);
        });
    }
    const allowed = [
        '8.8.8.8',
        '1.1.1.1',
        '168.63.129.15', // adjacent to Azure metadata — must NOT match
        '168.63.129.17',
        '169.255.0.1', // adjacent to 169.254/16
        '100.63.255.255', // adjacent to CGNAT
        '100.128.0.1',
        '11.0.0.1',
        '99.99.99.99',
    ];
    for (const ip of allowed) {
        it(`allows ${ip}`, () => {
            expect(PRIVATE_IPV4.test(ip)).toBe(false);
        });
    }
});
describe('isPrivateIpv6', () => {
    const blocked = [
        '::1',
        '::',
        '::ffff:127.0.0.1',
        '::ffff:10.0.0.1',
        '::ffff:168.63.129.16', // Azure metadata via mapped v4 — should re-apply v4 rule
        'fe80::1', // link-local
        'fec0::1', // legacy site-local — fe[89ab] (catches feb but not fec)
        'fc00::1', // unique-local
        'fd12:3456::1',
        'ff02::1', // multicast
        '2001:db8::1', // documentation
        '2002::1', // 6to4
        '64:ff9b::1', // NAT64
    ];
    for (const addr of blocked) {
        it(`blocks ${addr}`, () => {
            expect(isPrivateIpv6(addr)).toBe(true);
        });
    }
    const allowed = [
        '2606:4700:4700::1111', // Cloudflare DNS
        '2001:4860:4860::8888', // Google DNS
        '2620:fe::fe', // Quad9
    ];
    for (const addr of allowed) {
        it(`allows ${addr}`, () => {
            expect(isPrivateIpv6(addr)).toBe(false);
        });
    }
});
// Literal-IP shortcut in assertPublicHost — does NOT touch DoH, so these
// tests run without mocking network. Confirms the regex/private-range check
// fires before any DNS lookup when the hostname is already an IP.
describe('assertPublicHost — IP literal shortcut', () => {
    const blockedV4 = ['127.0.0.1', '169.254.169.254', '168.63.129.16', '10.0.0.1', '192.168.1.1'];
    for (const ip of blockedV4) {
        it(`blocks IPv4 literal ${ip}`, async () => {
            const r = await assertPublicHost(ip);
            expect(r.ok).toBe(false);
            expect(r.status).toBe(403);
            expect(r.blockedIp).toBe(ip);
            expect(r.error).toMatch(/private\/reserved IP literal/);
        });
    }
    it('allows a public IPv4 literal and pins to it', async () => {
        const r = await assertPublicHost('8.8.8.8');
        expect(r.ok).toBe(true);
        expect(r.pinIp).toBe('8.8.8.8');
    });
    const blockedV6 = ['::1', 'fe80::1', 'fc00::1', 'fec0::1'];
    for (const addr of blockedV6) {
        it(`blocks IPv6 literal ${addr}`, async () => {
            const r = await assertPublicHost(addr);
            expect(r.ok).toBe(false);
            expect(r.status).toBe(403);
        });
    }
    it('handles bracketed IPv6 literal (WHATWG URL keeps the brackets)', async () => {
        const r = await assertPublicHost('[::1]');
        expect(r.ok).toBe(false);
        expect(r.status).toBe(403);
        expect(r.blockedIp).toBe('::1');
    });
    it('allows a public IPv6 literal (Cloudflare DNS)', async () => {
        const r = await assertPublicHost('2606:4700:4700::1111');
        expect(r.ok).toBe(true);
        expect(r.pinIp).toBe('2606:4700:4700::1111');
    });
});
// Redirect-SSRF regression. pinnedFetch validated only the first host; with
// redirect:'follow' a 302 to an internal IP was fetched anyway. pinnedFetchFollow
// re-validates every hop. We use IP-LITERAL hosts (public 8.8.8.8/1.1.1.1, private
// 169.254.169.254) so assertPublicHost takes the no-DoH literal shortcut — the
// only thing we mock is the page fetch, making these deterministic + offline.
describe('pinnedFetchFollow — per-hop redirect re-validation', () => {
    const urlOf = (input) => typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    afterEach(() => {
        vi.unstubAllGlobals();
    });
    it('REFUSES a public URL that 302s to a cloud-metadata IP (the bug)', async () => {
        const fetchMock = vi.fn(async (input) => {
            const u = urlOf(input);
            if (u.startsWith('http://8.8.8.8'))
                return new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } });
            throw new Error(`SSRF: internal hop should never be fetched — got ${u}`);
        });
        vi.stubGlobal('fetch', fetchMock);
        await expect(pinnedFetchFollow('http://8.8.8.8/start')).rejects.toMatchObject({ status: 403 });
        // The private hop must never have been requested.
        expect(fetchMock.mock.calls.every((c) => !urlOf(c[0]).includes('169.254.169.254'))).toBe(true);
    });
    it('follows a benign multi-hop redirect chain to the final 200', async () => {
        vi.stubGlobal('fetch', vi.fn(async (input) => {
            const u = urlOf(input);
            if (u === 'http://8.8.8.8/a')
                return new Response(null, { status: 302, headers: { location: 'http://1.1.1.1/b' } });
            if (u === 'http://1.1.1.1/b')
                return new Response('FINAL', { status: 200 });
            throw new Error(`unexpected ${u}`);
        }));
        const res = await pinnedFetchFollow('http://8.8.8.8/a');
        expect(res.status).toBe(200);
        expect(await res.text()).toBe('FINAL');
    });
    it('resolves a RELATIVE Location against the current hop', async () => {
        vi.stubGlobal('fetch', vi.fn(async (input) => {
            const u = urlOf(input);
            if (u === 'http://8.8.8.8/dir/a')
                return new Response(null, { status: 301, headers: { location: '/b' } });
            if (u === 'http://8.8.8.8/b')
                return new Response('REL', { status: 200 });
            throw new Error(`unexpected ${u}`);
        }));
        expect(await (await pinnedFetchFollow('http://8.8.8.8/dir/a')).text()).toBe('REL');
    });
    it('rejects a redirect to an unsupported scheme (file://)', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 302, headers: { location: 'file:///etc/passwd' } })));
        await expect(pinnedFetchFollow('http://8.8.8.8/x')).rejects.toMatchObject({ status: 400 });
    });
    it('caps the redirect chain (loop → 508 too many redirects)', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 302, headers: { location: 'http://8.8.8.8/loop' } })));
        await expect(pinnedFetchFollow('http://8.8.8.8/loop', undefined, { maxRedirects: 2 })).rejects.toMatchObject({
            status: 508,
        });
    });
    it('refuses when the FIRST host is already private', async () => {
        const fetchMock = vi.fn(async () => new Response('x', { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);
        await expect(pinnedFetchFollow('http://169.254.169.254/latest/meta-data/')).rejects.toMatchObject({ status: 403 });
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
