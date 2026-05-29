import { SELF } from 'cloudflare:test';
import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(() => vi.restoreAllMocks());

describe('POST /api/v1/report/generate', () => {
  it('rejects missing query', async () => {
    const r = await SELF.fetch('https://x/api/v1/report/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(r.status).toBe(400);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body.error).toContain('missing query');
  });

  it('rejects empty query', async () => {
    const r = await SELF.fetch('https://x/api/v1/report/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: '   ' }),
    });
    expect(r.status).toBe(400);
  });

  it('generates CVE report with mocked AI', { timeout: 15_000 }, async () => {
    // Mock the CVE lookup and AI calls
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);

      // Mock NVD CVE lookup
      if (url.includes('services.nvd.nist.gov')) {
        return new Response(
          JSON.stringify({
            vulnerabilities: [
              {
                cve: {
                  id: 'CVE-2024-1709',
                  descriptions: [{ value: 'Authentication bypass vulnerability in ConnectWise ScreenConnect' }],
                  metrics: {
                    cvssMetricV31: [
                      {
                        cvssData: {
                          baseScore: 10.0,
                          baseSeverity: 'CRITICAL',
                          vectorString: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H',
                        },
                      },
                    ],
                  },
                },
              },
            ],
          }),
          { status: 200 }
        );
      }

      // Mock Groq AI response
      if (url.includes('api.groq.com')) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    '## TL;DR\n\nCVE-2024-1709 is a critical authentication bypass vulnerability.\n\n## Overview\n\nThis vulnerability affects ConnectWise ScreenConnect...',
                },
              },
            ],
          }),
          { status: 200 }
        );
      }

      return new Response(JSON.stringify({}), { status: 200 });
    });

    const r = await SELF.fetch('https://x/api/v1/report/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'CVE-2024-1709' }),
    });

    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.title).toContain('CVE-2024-1709');
    expect(body.markdown).toBeDefined();
    expect(body.query).toBe('CVE-2024-1709');
    expect(body.generated_at).toBeDefined();
    expect(body.elapsed_ms).toBeDefined();
  });

  it('generates threat actor report', { timeout: 15_000 }, async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);

      // Mock Groq AI response for actor
      if (url.includes('api.groq.com')) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    '## TL;DR\n\nAPT28 is a Russian state-sponsored threat actor...\n\n## Overview\n\nAlso known as Fancy Bear...',
                },
              },
            ],
          }),
          { status: 200 }
        );
      }

      return new Response(JSON.stringify({}), { status: 200 });
    });

    const r = await SELF.fetch('https://x/api/v1/report/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'APT28' }),
    });

    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.title).toContain('APT28');
    expect(body.markdown).toBeDefined();
  });

  it('generates generic report for unknown entities', { timeout: 15_000 }, async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);

      // Mock Groq AI response
      if (url.includes('api.groq.com')) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    '## TL;DR\n\nAnalysis of custom malware toolkit...\n\n## Overview\n\nThis appears to be a custom tool...',
                },
              },
            ],
          }),
          { status: 200 }
        );
      }

      return new Response(JSON.stringify({}), { status: 200 });
    });

    const r = await SELF.fetch('https://x/api/v1/report/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'Custom Malware Toolkit X' }),
    });

    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.title).toContain('Custom Malware Toolkit X');
  });

  it('handles AI service failures gracefully', { timeout: 15_000 }, async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);

      // Mock CVE lookup success
      if (url.includes('services.nvd.nist.gov')) {
        return new Response(
          JSON.stringify({
            vulnerabilities: [
              {
                cve: {
                  id: 'CVE-2024-1709',
                  descriptions: [{ value: 'Test vulnerability' }],
                },
              },
            ],
          }),
          { status: 200 }
        );
      }

      // Groq fails
      if (url.includes('api.groq.com')) {
        return new Response('Rate limited', { status: 429 });
      }

      return new Response(JSON.stringify({}), { status: 200 });
    });

    // This should fail since Workers AI isn't available in tests
    const r = await SELF.fetch('https://x/api/v1/report/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'CVE-2024-1709' }),
    });

    // Should return error since both AI providers fail in test env
    expect(r.status).toBe(500);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body.ok).toBe(false);
    expect(body.error).toBeDefined();
  });
});
