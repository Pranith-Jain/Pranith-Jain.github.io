import { SELF } from 'cloudflare:test';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
vi.mock('../../src/lib/andreafortuna-feeds', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        fetchAFDefacements: async () => [
            {
                value: 'https://defaced-stub.example.com/',
                kind: 'url',
                source: 'andreafortuna-defacements',
                reporter: 'hax.or',
                context: 'website defacement',
                // The handler applies a 7-day freshness filter to timestamped items.
                // Use a date 1 hour before now so the fixture stays in-window no
                // matter when the test runs.
                observed_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
            },
        ],
    };
});
// Stub all upstream fetches so the handler responds fast in the test env.
beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 502 }));
});
afterEach(() => {
    vi.restoreAllMocks();
});
describe('GET /api/v1/live-iocs — Andrea Fortuna defacements', () => {
    it('includes the AF defacements source row', async () => {
        const res = await SELF.fetch('https://example.com/api/v1/live-iocs');
        expect(res.status).toBe(200);
        const body = (await res.json());
        const afSource = body.sources.find((s) => s.id === 'andreafortuna-defacements');
        expect(afSource).toBeDefined();
        expect(afSource.ok).toBe(true);
        expect(afSource.count).toBeGreaterThanOrEqual(1);
    });
    it('includes the stubbed defacement URL in items[]', async () => {
        const res = await SELF.fetch('https://example.com/api/v1/live-iocs?cb=' + Date.now());
        const body = (await res.json());
        const stub = body.items.find((i) => i.value === 'https://defaced-stub.example.com/');
        expect(stub).toBeDefined();
        expect(stub.source).toBe('andreafortuna-defacements');
        expect(stub.kind).toBe('url');
    });
});
