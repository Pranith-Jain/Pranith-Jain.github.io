import { SELF } from 'cloudflare:test';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { __resetKevCache } from '../../src/routes/cve';

beforeEach(() => {
  vi.restoreAllMocks();
  __resetKevCache();
});

describe('GET /api/v1/cve/search', () => {
  it('rejects missing id', async () => {
    const r = await SELF.fetch('https://x/api/v1/cve/search');
    expect(r.status).toBe(400);
  });

  it('rejects invalid CVE id format', async () => {
    const r = await SELF.fetch('https://x/api/v1/cve/search?id=not-a-cve');
    expect(r.status).toBe(400);
  });

  it('returns 404 when CVE not found', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('nvd.nist.gov')) {
        return new Response(JSON.stringify({ totalResults: 0, vulnerabilities: [] }), { status: 200 });
      }
      // KEV and EPSS return empty but valid responses
      return new Response(JSON.stringify({ data: [], vulnerabilities: [] }), { status: 200 });
    });
    const r = await SELF.fetch('https://x/api/v1/cve/search?id=CVE-1999-0001');
    expect(r.status).toBe(404);
  });

  it('returns parsed cve with cvss + epss + kev', async () => {
    const calls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('nvd.nist.gov')) {
        return new Response(
          JSON.stringify({
            totalResults: 1,
            vulnerabilities: [
              {
                cve: {
                  id: 'CVE-2024-1234',
                  published: '2024-01-01T00:00:00.000',
                  lastModified: '2024-02-01T00:00:00.000',
                  descriptions: [{ lang: 'en', value: 'Sample vulnerability' }],
                  metrics: {
                    cvssMetricV31: [
                      {
                        cvssData: {
                          version: '3.1',
                          baseScore: 9.8,
                          baseSeverity: 'CRITICAL',
                          vectorString: 'CVSS:3.1/AV:N/AC:L/...',
                        },
                      },
                    ],
                  },
                  weaknesses: [{ description: [{ lang: 'en', value: 'CWE-79' }] }],
                  references: [{ url: 'https://example.com/advisory', tags: ['Vendor Advisory'] }],
                  configurations: [],
                },
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (url.includes('first.org/data/v1/epss')) {
        return new Response(
          JSON.stringify({
            data: [{ cve: 'CVE-2024-1234', epss: 0.97, percentile: 0.99, date: '2024-05-01' }],
          }),
          { status: 200 }
        );
      }
      if (url.includes('cisa.gov')) {
        return new Response(
          JSON.stringify({
            vulnerabilities: [
              {
                cveID: 'CVE-2024-1234',
                dateAdded: '2024-01-15',
                vulnerabilityName: 'X',
                requiredAction: 'patch',
                dueDate: '2024-02-01',
              },
            ],
          }),
          { status: 200 }
        );
      }
      return new Response('{}', { status: 200 });
    });

    const r = await SELF.fetch('https://x/api/v1/cve/search?id=CVE-2024-1234');
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body.cve_id).toBe('CVE-2024-1234');
    expect((body.cvss as { base_score: number }).base_score).toBe(9.8);
    expect((body.kev as { in_kev: boolean }).in_kev).toBe(true);
    expect((body.epss as { score: number }).score).toBe(0.97);
  });

  it('returns 502 on NVD rate-limit', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('rate limited', { status: 429 }));
    const r = await SELF.fetch('https://x/api/v1/cve/search?id=CVE-2024-9999');
    expect(r.status).toBe(502);
  });

  it('accepts case-insensitive CVE id', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('nvd.nist.gov')) {
        return new Response(
          JSON.stringify({
            totalResults: 1,
            vulnerabilities: [
              {
                cve: {
                  id: 'CVE-2024-5678',
                  descriptions: [{ lang: 'en', value: 'Test' }],
                  metrics: {},
                  weaknesses: [],
                  references: [],
                  configurations: [],
                },
              },
            ],
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });
    const r = await SELF.fetch('https://x/api/v1/cve/search?id=cve-2024-5678');
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body.cve_id).toBe('CVE-2024-5678');
  });
});
