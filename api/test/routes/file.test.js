import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withTestApiKey } from '../test-helpers';
beforeEach(() => vi.restoreAllMocks());
describe('POST /api/v1/file/analyze', () => {
    it('rejects empty body', async () => {
        const f = await withTestApiKey();
        const r = await f('https://x/api/v1/file/analyze', { method: 'POST', body: '' });
        expect(r.status).toBe(400);
    });
    it('rejects non-hash input', async () => {
        const f = await withTestApiKey();
        const r = await f('https://x/api/v1/file/analyze', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ hash: 'not-a-hash' }),
        });
        expect(r.status).toBe(400);
    });
    it('returns combined result for valid SHA-256', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
            data: {
                attributes: {
                    last_analysis_stats: { malicious: 5, suspicious: 2, harmless: 60, undetected: 0 },
                    tags: ['trojan'],
                },
            },
        }), { status: 200 }));
        const f = await withTestApiKey();
        const r = await f('https://x/api/v1/file/analyze', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ hash: 'a'.repeat(64) }),
        });
        expect(r.status).toBe(200);
        const body = (await r.json());
        expect(body.hash).toBe('a'.repeat(64));
        expect(body.hash_type).toBe('sha256');
        expect(body.providers).toBeDefined();
    });
});
