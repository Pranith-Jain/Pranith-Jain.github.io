import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { env as testEnv } from 'cloudflare:test';
import { validate } from '../../src/lib/validate';
import { unifiedSearchSummarizeSchema } from '../../src/lib/validation-schemas';
import { unifiedSearchSummarizeHandler } from '../../src/routes/unified-search-summarize';
// Mini-app: only the route under test + the real validate middleware. The
// global same-origin auth lives in index.ts and is not exercised here.
function app() {
    const a = new Hono();
    a.post('/api/v1/unified-search/summarize', validate('json', unifiedSearchSummarizeSchema), unifiedSearchSummarizeHandler);
    return a;
}
const env = () => ({ ...testEnv });
function post(body) {
    return app().request('/api/v1/unified-search/summarize', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }, env());
}
describe('POST /api/v1/unified-search/summarize (mini-app)', () => {
    it('400 when items[] is missing (schema mirrors handler reads)', async () => {
        const r = await post({ q: 'lockbit' });
        expect(r.status).toBe(400);
    });
    it('400 when q is missing', async () => {
        const r = await post({ items: [{ title: 'x', body: 'y' }] });
        expect(r.status).toBe(400);
    });
    it('returns a cached summary verbatim without invoking the LLM', async () => {
        const q = 'lockbit-cache-test';
        const fake = {
            summary: 'Cached operational summary about LockBit ransomware.',
            modelUsed: 'groq:test',
            itemCount: 1,
        };
        // Pre-seed the handler's exact cache key so generateAiSummary is never reached.
        const key = new Request(`https://unified-search-summary.internal/v1/${encodeURIComponent(q.toLowerCase())}`);
        await caches.default.put(key, 
        // Cache API only stores responses with a positive max-age (matches the handler's own writes).
        new Response(JSON.stringify(fake), {
            headers: { 'content-type': 'application/json', 'cache-control': 'max-age=3600' },
        }));
        const r = await post({ q, items: [{ title: 'LockBit victim', body: 'manufacturing sector' }] });
        expect(r.status).toBe(200);
        const data = (await r.json());
        expect(data).toMatchObject(fake);
    });
});
