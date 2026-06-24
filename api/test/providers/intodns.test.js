import { describe, it, expect, vi, beforeEach } from 'vitest';
import { intodns } from '../../src/providers/intodns';
const env = {
  VT_API_KEY: '',
  ABUSEIPDB_API_KEY: '',
  SHODAN_API_KEY: '',
  CENSYS_PAT: '',
  CENSYS_ORG_ID: '',
  NETLAS_API_KEY: '',
  OTX_API_KEY: '',
  URLSCAN_API_KEY: '',
  HYBRID_ANALYSIS_API_KEY: '',
};
beforeEach(() => vi.restoreAllMocks());
const baseResponse = (overrides = {}) =>
  new Response(
    JSON.stringify({
      domain: 'example.com',
      timestamp: '2026-01-28T17:59:35.078Z',
      score: 139,
      maxScore: 146,
      percentage: 95,
      grade: 'A',
      gradeInfo: { grade: 'A', label: 'Very Good', description: 'Strong security posture' },
      categories: {
        dns: { score: 55, maxScore: 55, percentage: 100, status: 'pass' },
        email: { score: 44, maxScore: 46, percentage: 96, status: 'pass' },
        security: { score: 40, maxScore: 45, percentage: 89, status: 'pass' },
      },
      issues: [],
      recommendations: [],
      ...overrides,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
describe('intodns adapter', () => {
  it('returns unsupported for non-domain indicators', async () => {
    const r = await intodns({ type: 'ipv4', value: '1.2.3.4' }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('unsupported');
    expect(r.source).toBe('intodns');
    expect(r.score).toBe(0);
    expect(r.verdict).toBe('unknown');
  });
  it('maps a high percentage (95%) to verdict=clean and low risk score', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(baseResponse({ percentage: 95, grade: 'A' }));
    const r = await intodns({ type: 'domain', value: 'example.com' }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('ok');
    expect(r.score).toBe(5); // 100 - 95
    expect(r.verdict).toBe('clean');
    expect(r.tags).toContain('grade:A');
    expect(r.tags).toContain('grade-label:very-good');
    expect(r.tags).toContain('dns:pass');
    expect(r.tags).toContain('email:pass');
    expect(r.tags).toContain('security:pass');
  });
  it('maps a middle percentage (50%) to verdict=suspicious', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(baseResponse({ percentage: 50, grade: 'D' }));
    const r = await intodns({ type: 'domain', value: 'example.com' }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('ok');
    expect(r.score).toBe(50);
    expect(r.verdict).toBe('suspicious');
    expect(r.tags).toContain('grade:D');
  });
  it('maps a low percentage (10%) to verdict=malicious', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      baseResponse({
        percentage: 10,
        grade: 'F',
        issues: [
          {
            id: 'no-dmarc',
            severity: 'critical',
            category: 'email',
            title: 'No DMARC record',
            fixable: true,
          },
        ],
      })
    );
    const r = await intodns({ type: 'domain', value: 'example.com' }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('ok');
    expect(r.score).toBe(90);
    expect(r.verdict).toBe('malicious');
    expect(r.tags).toContain('grade:F');
    expect(r.tags).toContain('email:fail');
    expect(r.tags).toContain('critical-issues:1');
  });
  it('surfaces citation URLs in raw_summary', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(baseResponse());
    const r = await intodns({ type: 'domain', value: 'example.com' }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('ok');
    const citations = r.raw_summary.citations;
    expect(citations.liveReport).toBe('https://intodns.ai/api/report/everything?domain=example.com');
    expect(citations.methodology).toBe('https://intodns.ai/methodology');
    expect(citations.llmApi).toBe('https://intodns.ai/llm/api.md');
  });
  it('honors 429 by surfacing rate_limited error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'rate limited' }), {
        status: 429,
        headers: { 'content-type': 'application/json', 'Retry-After': '60' },
      })
    );
    const r = await intodns({ type: 'domain', value: 'example.com' }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('error');
    expect(r.error_code).toBe('rate_limited');
    expect(r.error_status).toBe(429);
  });
  it('honors upstream 500 by surfacing upstream_5xx error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('internal error', { status: 500, headers: { 'content-type': 'text/plain' } })
    );
    const r = await intodns({ type: 'domain', value: 'example.com' }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('error');
    expect(r.error_code).toBe('upstream_5xx');
    expect(r.error_status).toBe(500);
  });
  it('classifies malformed JSON (no percentage) as parse error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ domain: 'example.com', issues: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    const r = await intodns({ type: 'domain', value: 'example.com' }, env, AbortSignal.timeout(2000));
    expect(r.status).toBe('error');
    expect(r.error_code).toBe('parse');
    expect(r.error_tags).toContain('malformed-response');
  });
  it('sends Authorization header when INTODNS_API_KEY is set', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(baseResponse());
    await intodns(
      { type: 'domain', value: 'example.com' },
      { ...env, INTODNS_API_KEY: 'test-key' },
      AbortSignal.timeout(2000)
    );
    const init = fetchSpy.mock.calls[0]?.[1];
    const headers = init?.headers;
    expect(headers?.['Authorization']).toBe('Bearer test-key');
  });
  it('omits Authorization header when no key (anonymous tier)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(baseResponse());
    await intodns({ type: 'domain', value: 'example.com' }, env, AbortSignal.timeout(2000));
    const init = fetchSpy.mock.calls[0]?.[1];
    const headers = init?.headers;
    expect(headers?.['Authorization']).toBeUndefined();
  });
});
