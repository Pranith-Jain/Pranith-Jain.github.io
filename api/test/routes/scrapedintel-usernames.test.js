import { describe, it, expect, vi, afterEach } from 'vitest';
import { Hono } from 'hono';
import { scrapedintelUsernamesHandler } from '../../src/routes/scrapedintel-usernames';
import { budgetWindowKey, lastGoodKey, SCRAPEDINTEL_SOURCE_URL, } from '../../src/lib/scrapedintel';
function app() {
    const a = new Hono();
    a.get('/api/v1/scrapedintel-usernames', scrapedintelUsernamesHandler);
    return a;
}
// Minimal in-memory KV so budget + last-good assertions are deterministic and
// isolated from the shared test-wrangler binding.
function memKV(seed = {}) {
    const m = new Map(Object.entries(seed));
    return {
        get: async (k) => m.get(k) ?? null,
        put: async (k, v) => void m.set(k, v),
        delete: async (k) => void m.delete(k),
        _m: m,
    };
}
const env = (kv = memKV()) => ({ KV_CACHE: kv });
function upstream(body, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
/** Seed a KV so the egress budget is exhausted regardless of minute boundary. */
function budgetExhausted(extra = {}) {
    const now = Date.now();
    return memKV({
        [budgetWindowKey(now)]: '9',
        [budgetWindowKey(now + 60_000)]: '9',
        ...extra,
    });
}
afterEach(() => vi.restoreAllMocks());
describe('scrapedintel-usernames route', () => {
    it('400 when the query is shorter than 2 chars', async () => {
        const r = await app().request('/api/v1/scrapedintel-usernames?q=a', {}, env());
        expect(r.status).toBe(400);
    });
    it('400 when the query is longer than 80 chars', async () => {
        const r = await app().request(`/api/v1/scrapedintel-usernames?q=${'x'.repeat(81)}`, {}, env());
        expect(r.status).toBe(400);
    });
    it('200 with grouped results on upstream success, calling the upstream once', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(upstream({
            query: 'lockbit',
            found: true,
            count: 2,
            results: [
                { username: 'LockBitSupp', forum: 'Xss', logo: '/static/logos/xss_usernames.png' },
                { username: 'lockbitsupp', forum: 'Exploit', logo: '/static/logos/exploit_usernames.png' },
            ],
        }));
        const r = await app().request('/api/v1/scrapedintel-usernames?q=lockbit', {}, env());
        expect(r.status).toBe(200);
        const body = (await r.json());
        expect(body.found).toBe(true);
        expect(body.total_matches).toBe(1);
        expect(body.results[0].username).toBe('LockBitSupp');
        expect(body.results[0].forum_count).toBe(2);
        expect(body.source_url).toBe(SCRAPEDINTEL_SOURCE_URL);
        // upstream URL is the fixed host with the encoded query (no SSRF surface)
        const calledUrl = String(fetchMock.mock.calls[0][0]);
        expect(calledUrl.startsWith(`${SCRAPEDINTEL_SOURCE_URL}/api/search?q=`)).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    it('200 + empty results when upstream reports found:false', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(upstream({ query: 'ghostxyz', found: false, count: 0, results: [] }));
        const r = await app().request('/api/v1/scrapedintel-usernames?q=ghostxyz', {}, env());
        expect(r.status).toBe(200);
        const body = (await r.json());
        expect(body.found).toBe(false);
        expect(body.total_matches).toBe(0);
        expect(body.results).toEqual([]);
    });
    it('serves KV last-good (stale) when over the egress budget — no upstream call', async () => {
        const seeded = {
            query: 'staleguy',
            generated_at: '2026-06-01T00:00:00.000Z',
            found: true,
            total_matches: 1,
            truncated: false,
            results: [{ username: 'StaleGuy', forum_count: 1, forums: [{ forum: 'Xss' }] }],
            source: 'threatactorusernames.com',
            source_url: SCRAPEDINTEL_SOURCE_URL,
        };
        const kv = budgetExhausted({ [lastGoodKey('staleguy')]: JSON.stringify(seeded) });
        const fetchMock = vi.spyOn(globalThis, 'fetch');
        const r = await app().request('/api/v1/scrapedintel-usernames?q=staleguy', {}, env(kv));
        expect(r.status).toBe(200);
        const body = (await r.json());
        expect(body.stale).toBe(true);
        expect(body.results[0].username).toBe('StaleGuy');
        expect(fetchMock).not.toHaveBeenCalled();
    });
    it('429 rate_limited when over budget with no last-good — no upstream call', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch');
        const r = await app().request('/api/v1/scrapedintel-usernames?q=busyguy', {}, env(budgetExhausted()));
        expect(r.status).toBe(429);
        const body = (await r.json());
        expect(body.rate_limited).toBe(true);
        expect(fetchMock).not.toHaveBeenCalled();
    });
    it('502 when upstream errors and there is no last-good', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(upstream({ error: 'boom' }, 500));
        const r = await app().request('/api/v1/scrapedintel-usernames?q=errguy', {}, env());
        expect(r.status).toBe(502);
    });
});
