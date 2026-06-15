import { describe, it, expect, vi, beforeEach } from 'vitest';
import { digitalside } from '../../src/providers/digitalside';
const env = {};
beforeEach(() => vi.restoreAllMocks());
describe('digitalside — silent-failure fix (no false clean when all feeds 5xx)', () => {
    it('returns error with error_code upstream_5xx when every feed returns 502', async () => {
        // Two feeds (URL+domain indicator → 2 feeds). Both dead.
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('upstream dead', { status: 502, statusText: 'Bad Gateway' }));
        const r = await digitalside({ type: 'domain', value: 'evil.test' }, env, AbortSignal.timeout(2000));
        expect(r.status).toBe('error');
        expect(r.error_code).toBe('upstream_5xx');
        expect(r.error_status).toBe(502);
        expect(r.error_tags).toContain('502');
        // Critically: NOT 'ok' with verdict 'clean' — that was the old
        // silent-failure that turned any upstream outage into a false clean.
        expect(r.verdict).toBe('unknown');
    });
    it('returns error with error_code rate_limited when feeds 429', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 429, statusText: 'Too Many Requests' }));
        const r = await digitalside({ type: 'ipv4', value: '1.2.3.4' }, env, AbortSignal.timeout(2000));
        expect(r.status).toBe('error');
        expect(r.error_code).toBe('rate_limited');
        expect(r.error_status).toBe(429);
    });
    it('returns ok with partial_failure tags when one feed 5xx and one feed ok', async () => {
        // URL+domain indicator → 2 feeds. First fails, second succeeds.
        vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(new Response('boom', { status: 503, statusText: 'Service Unavailable' }))
            .mockResolvedValueOnce(new Response('# header\neviltest.com\n', { status: 200 }));
        const r = await digitalside({ type: 'domain', value: 'eviltest.com' }, env, AbortSignal.timeout(2000));
        // The surviving feed matched, so we still get a real malicious verdict.
        expect(r.status).toBe('ok');
        expect(r.verdict).toBe('malicious');
        // But the operator can see the partial failure in tags.
        expect(r.error_tags).toEqual(expect.arrayContaining(['upstream-5xx', '503']));
        expect(r.raw_summary).toMatchObject({ partial_failure: expect.stringMatching(/1\/2/) });
    });
});
