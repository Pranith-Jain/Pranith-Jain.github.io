import { SELF } from 'cloudflare:test';
import { describe, it, expect, vi, beforeEach } from 'vitest';
// Stub the AF fetcher so the test is deterministic and offline.
vi.mock('../../src/lib/andreafortuna-feeds', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        fetchAFDatamarkets: async () => [
            {
                title: 'DemonForums - Stub Item',
                url: 'https://demonforums.net/Thread-stub',
                source: 'andreafortuna-demonforums',
                category: 'underground-forums',
                published: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
                description: 'Underground forum thread',
                tags: ['demonforums', 'credentials', 'forum'],
            },
        ],
    };
});
// The handler also pulls from a curated list of external RSS feeds in
// CYBERCRIME_SOURCES. Returning a non-retryable 404 to every non-AF URL
// keeps the test offline and avoids the 3-attempt × 12s fetchResilient
// timeout that would otherwise exceed the 5s test timeout.
beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes('andreafortuna.org')) {
            // AF datamarkets/defacements/etc. — not used by this handler, but
            // route everything AF-related to the AF mock above. The AF fetcher
            // never calls globalThis.fetch in this test, so this branch is
            // mostly defensive.
            return new Response('[]', { status: 200 });
        }
        return new Response('not found', { status: 404 });
    });
});
describe('GET /api/v1/cyber-crime — Andrea Fortuna datamarkets', () => {
    it('includes the AF datamarkets source row in the response', async () => {
        const res = await SELF.fetch('https://example.com/api/v1/cyber-crime');
        expect(res.status).toBe(200);
        const body = (await res.json());
        const afSource = body.sources.find((s) => s.label === 'AndreaFortuna Datamarkets');
        expect(afSource).toBeDefined();
        expect(afSource.category).toBe('underground-forums');
        expect(afSource.ok).toBe(true);
        expect(afSource.count).toBeGreaterThanOrEqual(1);
    });
    it('includes the stubbed AF item in items[]', async () => {
        // Bust the previous test's cached response — KV/Cache-API persists across SELF.fetch.
        const res = await SELF.fetch('https://example.com/api/v1/cyber-crime?cb=' + Date.now());
        const body = (await res.json());
        const stub = body.items.find((i) => i.url === 'https://demonforums.net/Thread-stub');
        expect(stub).toBeDefined();
        expect(stub.source).toBe('andreafortuna-demonforums');
        expect(stub.category).toBe('underground-forums');
    });
});
