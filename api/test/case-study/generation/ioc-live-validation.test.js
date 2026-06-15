import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { validateIocsLive } from '../../../src/case-study/generation/ioc-live-validation';
function installFetch(matrix) {
    const fetchMock = vi.fn(async (url, init) => {
        const u = typeof url === 'string' ? url : url.toString();
        const r = await Promise.resolve(matrix(u, init));
        return new Response(r.body !== undefined ? JSON.stringify(r.body) : '', { status: r.status });
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}
beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});
const goodIp = { type: 'ipv4', value: '91.215.155.42' };
const badIp = { type: 'ipv4', value: '198.51.100.99' };
const goodHash = {
    type: 'sha256',
    value: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
};
const goodDomain = { type: 'domain', value: 'malware.example.org' };
describe('validateIocsLive', () => {
    it('no-op fast path when no API keys are set', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const r = await validateIocsLive([goodIp, badIp], {});
        expect(r.iocs).toHaveLength(2);
        expect(r.skippedCount).toBe(2);
        expect(r.droppedCount).toBe(0);
        expect(fetchMock).not.toHaveBeenCalled();
    });
    it('drops an IPv4 when VT and AbuseIPDB both say "absent"', async () => {
        installFetch((url) => {
            if (url.includes('virustotal.com'))
                return { status: 404 };
            if (url.includes('abuseipdb.com'))
                return { status: 200, body: { data: { totalReports: 0 } } };
            return { status: 500 };
        });
        const r = await validateIocsLive([badIp], { VT_API_KEY: 'vt', ABUSEIPDB_API_KEY: 'ab' });
        expect(r.iocs).toHaveLength(0);
        expect(r.droppedCount).toBe(1);
        expect(r.dropReasons[0]).toContain('198.51.100.99');
    });
    it('keeps an IPv4 when at least one provider returns 200', async () => {
        installFetch((url) => {
            if (url.includes('virustotal.com'))
                return { status: 200, body: { data: {} } };
            if (url.includes('abuseipdb.com'))
                return { status: 200, body: { data: { totalReports: 0 } } };
            return { status: 500 };
        });
        const r = await validateIocsLive([goodIp], { VT_API_KEY: 'vt', ABUSEIPDB_API_KEY: 'ab' });
        expect(r.iocs).toHaveLength(1);
        expect(r.iocs[0].validated).toBe(true);
        expect(r.validatedCount).toBe(1);
    });
    it('keeps an IOC when every provider errors (we do not trust our own check)', async () => {
        installFetch(() => ({ status: 500 }));
        const r = await validateIocsLive([goodIp], { VT_API_KEY: 'vt', ABUSEIPDB_API_KEY: 'ab' });
        expect(r.iocs).toHaveLength(1);
        expect(r.iocs[0].validated).toBeUndefined();
        expect(r.skippedCount).toBeGreaterThanOrEqual(1);
        expect(r.droppedCount).toBe(0);
    });
    it('drops a sha256 when MalwareBazaar returns hash_not_found and VT 404s', async () => {
        installFetch((url) => {
            if (url.includes('virustotal.com'))
                return { status: 404 };
            if (url.includes('mb-api.abuse.ch'))
                return { status: 200, body: { query_status: 'hash_not_found' } };
            return { status: 500 };
        });
        const r = await validateIocsLive([goodHash], { VT_API_KEY: 'vt', ABUSECH_AUTH_KEY: 'ach' });
        expect(r.iocs).toHaveLength(0);
        expect(r.droppedCount).toBe(1);
    });
    it('keeps a sha256 when MalwareBazaar says ok', async () => {
        installFetch((url) => {
            if (url.includes('virustotal.com'))
                return { status: 404 };
            if (url.includes('mb-api.abuse.ch'))
                return { status: 200, body: { query_status: 'ok', data: [{}] } };
            return { status: 500 };
        });
        const r = await validateIocsLive([goodHash], { VT_API_KEY: 'vt', ABUSECH_AUTH_KEY: 'ach' });
        expect(r.iocs).toHaveLength(1);
        expect(r.iocs[0].validated).toBe(true);
    });
    it('keeps an IOC when no configured provider supports its type (e.g. email)', async () => {
        const fetchMock = installFetch(() => ({ status: 200, body: {} }));
        const email = { type: 'email', value: 'attacker@example.test' };
        // Only AbuseIPDB key set — it doesn't support email. VT-less.
        const r = await validateIocsLive([email], { ABUSEIPDB_API_KEY: 'ab' });
        expect(r.iocs).toHaveLength(1);
        expect(r.iocs[0].validated).toBeUndefined();
        // The AbuseIPDB probe runs and returns "unsupported"; no actual
        // network request to AbuseIPDB needs to be inspected at the
        // validator boundary because the probe short-circuits before fetch.
        expect(fetchMock).not.toHaveBeenCalled();
    });
    it('caps validations at MAX_VALIDATIONS — IOCs beyond the cap pass through unchanged', async () => {
        installFetch((url) => {
            if (url.includes('virustotal.com'))
                return { status: 200, body: { data: {} } };
            return { status: 500 };
        });
        const many = Array.from({ length: 30 }, (_, i) => ({
            type: 'ipv4',
            value: `91.215.155.${i + 1}`,
        }));
        const r = await validateIocsLive(many, { VT_API_KEY: 'vt' });
        expect(r.iocs).toHaveLength(30);
        expect(r.validatedCount).toBe(20);
        expect(r.skippedCount).toBe(10);
    });
    it('handles a mix of keep/drop in one pass', async () => {
        installFetch((url) => {
            if (url.includes('virustotal.com')) {
                // Decide by URL: the good IP is in the URL path; the bad one isn't.
                if (url.includes('91.215.155.42'))
                    return { status: 200, body: { data: {} } };
                return { status: 404 };
            }
            if (url.includes('abuseipdb.com')) {
                if (url.includes('91.215.155.42'))
                    return { status: 200, body: { data: { totalReports: 5 } } };
                return { status: 200, body: { data: { totalReports: 0 } } };
            }
            return { status: 500 };
        });
        const r = await validateIocsLive([goodIp, badIp, goodDomain], {
            VT_API_KEY: 'vt',
            ABUSEIPDB_API_KEY: 'ab',
        });
        // goodIp kept (VT + AbuseIPDB both confirm), badIp dropped (both absent),
        // goodDomain kept-but-unvalidated (VT 404 for URL containing 'malware.example.org';
        // AbuseIPDB doesn't support domain).
        const kept = r.iocs.map((i) => i.value);
        expect(kept).toContain('91.215.155.42');
        expect(kept).not.toContain('198.51.100.99');
        // goodDomain: VT returns 404 → absent. AbuseIPDB unsupported. Only one
        // voting provider, returns absent → dropped.
        expect(kept).not.toContain('malware.example.org');
        expect(r.droppedCount).toBe(2);
    });
});
