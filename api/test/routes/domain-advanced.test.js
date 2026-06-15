import { SELF } from 'cloudflare:test';
import { describe, it, expect, vi, beforeEach } from 'vitest';
beforeEach(() => vi.restoreAllMocks());
describe('GET /api/v1/domain-rep', () => {
    it('rejects missing domain and ip', async () => {
        const r = await SELF.fetch('https://x/api/v1/domain-rep');
        expect(r.status).toBe(400);
        const body = (await r.json());
        expect(body.error).toContain('domain or ip parameter required');
    });
    it('checks IP reputation against blacklists', { timeout: 15_000 }, async () => {
        // Mock DNS responses for blacklist checks
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
            const url = String(input);
            // IP blacklist queries return NXDOMAIN (not listed)
            if (url.includes('spamhaus.org') || url.includes('spamcop.net') || url.includes('barracudacentral.org')) {
                return new Response(JSON.stringify({ Status: 3, Answer: [] }), { status: 200 });
            }
            // Default response
            return new Response(JSON.stringify({ Status: 0, Answer: [] }), { status: 200 });
        });
        const r = await SELF.fetch('https://x/api/v1/domain-rep?ip=8.8.8.8');
        expect(r.status).toBe(200);
        const body = (await r.json());
        expect(body.target).toBe('8.8.8.8');
        expect(body.type).toBe('ip');
        expect(body.score).toBeDefined();
        expect(body.checks).toBeDefined();
        expect(Array.isArray(body.checks)).toBe(true);
    });
    it('checks domain reputation with DNS resolution', { timeout: 15_000 }, async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
            const url = String(input);
            // Domain resolution returns IPs
            if (url.includes('name=example.com&type=A')) {
                return new Response(JSON.stringify({
                    Status: 0,
                    Answer: [{ data: '93.184.216.34' }],
                }), { status: 200 });
            }
            // Blacklist checks return not listed
            return new Response(JSON.stringify({ Status: 3, Answer: [] }), { status: 200 });
        });
        const r = await SELF.fetch('https://x/api/v1/domain-rep?domain=example.com');
        expect(r.status).toBe(200);
        const body = (await r.json());
        expect(body.target).toBe('example.com');
        expect(body.type).toBe('domain');
        expect(body.score).toBeDefined();
        expect(body.domain).toBeDefined();
        expect(body.ips).toBeDefined();
    });
    it('handles non-resolving domains', { timeout: 15_000 }, async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
            const url = String(input);
            // NXDOMAIN for non-existent domain
            if (url.includes('name=nonexistent.invalid')) {
                return new Response(JSON.stringify({ Status: 3, Answer: [] }), { status: 200 });
            }
            return new Response(JSON.stringify({ Status: 0, Answer: [] }), { status: 200 });
        });
        const r = await SELF.fetch('https://x/api/v1/domain-rep?domain=nonexistent.invalid');
        expect(r.status).toBe(200);
        const body = (await r.json());
        expect(body.score).toBe(0);
        expect(body.error).toContain('domain does not resolve');
    });
});
describe('GET /api/v1/domain-monitor', () => {
    it('rejects missing domain', async () => {
        const r = await SELF.fetch('https://x/api/v1/domain-monitor');
        expect(r.status).toBe(400);
        const body = (await r.json());
        expect(body.error).toContain('domain parameter required');
    });
    it('rejects invalid domain format', async () => {
        const r = await SELF.fetch('https://x/api/v1/domain-monitor?domain=not valid!');
        expect(r.status).toBe(400);
        const body = (await r.json());
        expect(body.error).toContain('invalid domain format');
    });
    it('generates typosquat variants and checks resolution', { timeout: 20_000 }, async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
            const url = String(input);
            // Only example.com resolves
            if (url.includes('name=example.com&type=A')) {
                return new Response(JSON.stringify({
                    Status: 0,
                    Answer: [{ data: '93.184.216.34' }],
                }), { status: 200 });
            }
            // All typosquats don't resolve
            return new Response(JSON.stringify({ Status: 3, Answer: [] }), { status: 200 });
        });
        const r = await SELF.fetch('https://x/api/v1/domain-monitor?domain=example.com');
        expect(r.status).toBe(200);
        const body = (await r.json());
        expect(body.domain).toBe('example.com');
        expect(body.total_variants).toBeGreaterThan(0);
        expect(body.checked).toBeDefined();
        expect(body.active).toBeDefined();
        expect(body.inactive).toBeDefined();
        expect(body.results).toBeDefined();
        const results = body.results;
        expect(results.active).toBeDefined();
        expect(results.inactive).toBeDefined();
        expect(results.unchecked).toBeDefined();
        expect(body.generated_at).toBeDefined();
    });
    it('detects active typosquats', { timeout: 20_000 }, async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
            const url = String(input);
            // Both example.com and exmple.com resolve
            if (url.includes('name=example.com&type=A') || url.includes('name=exmple.com&type=A')) {
                return new Response(JSON.stringify({
                    Status: 0,
                    Answer: [{ data: '93.184.216.34' }],
                }), { status: 200 });
            }
            // Others don't resolve
            return new Response(JSON.stringify({ Status: 3, Answer: [] }), { status: 200 });
        });
        const r = await SELF.fetch('https://x/api/v1/domain-monitor?domain=example.com');
        expect(r.status).toBe(200);
        const body = (await r.json());
        // exmple.com (character omission) should be detected as active
        const results = body.results;
        const foundTypo = results.active.find((a) => a.domain === 'exmple.com');
        expect(foundTypo).toBeDefined();
        expect(foundTypo?.type).toBe('typo');
    });
});
