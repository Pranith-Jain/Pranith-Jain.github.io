import { SELF } from 'cloudflare:test';
import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(() => {
  vi.restoreAllMocks();
});

// GitHub Security Advisories `malware` set — the live upstream shape.
const SAMPLE = JSON.stringify([
  {
    ghsa_id: 'GHSA-aaaa-1111-2222',
    summary: 'Malicious code in platform-telemetry-client (PyPI)',
    description: 'The PyPI package platform-telemetry-client contains malware.',
    severity: 'critical',
    html_url: 'https://github.com/advisories/GHSA-aaaa-1111-2222',
    published_at: '2026-09-10T00:00:00Z',
    updated_at: '2026-09-11T00:00:00Z',
    vulnerabilities: [
      { package: { ecosystem: 'pip', name: 'platform-telemetry-client' }, vulnerable_version_range: '< 2.0', patched_versions: [] },
    ],
  },
  {
    ghsa_id: 'GHSA-bbbb-3333-4444',
    summary: 'Malicious code in tailwind-form-kit (npm)',
    description: 'The npm package tailwind-form-kit contains malware.',
    severity: 'high',
    html_url: 'https://github.com/advisories/GHSA-bbbb-3333-4444',
    published_at: '2026-09-09T00:00:00Z',
    updated_at: '2026-09-09T00:00:00Z',
    vulnerabilities: [
      {
        package: { ecosystem: 'npm', name: 'tailwind-form-kit' },
        vulnerable_version_range: '< 1.2.3',
        first_patched_version: '1.2.3',
      },
    ],
  },
  {
    ghsa_id: 'GHSA-cccc-5555-6666',
    summary: 'Malicious code in cr-bot-common (npm)',
    description: '',
    severity: 'critical',
    published_at: '2026-09-08T00:00:00Z',
    updated_at: '2026-09-08T00:00:00Z',
    vulnerabilities: [{ package: { ecosystem: 'npm', name: 'cr-bot-common' } }],
  },
]);

function mockUpstream(status: number, body: string) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    async () => new Response(body, { status, headers: { 'Content-Type': 'application/json' } })
  );
}

describe('GET /api/v1/supply-chain-attacks', () => {
  // FIRST: error path — runs before any success can populate the global
  // KV last-good (supplychain:lastgood:v1), which would otherwise mask the 502.
  it('502s when upstream is unavailable and no last-good exists', async () => {
    mockUpstream(404, 'not found');
    const r = await SELF.fetch('https://x/api/v1/supply-chain-attacks?limit=104');
    expect(r.status).toBe(502);
    const body = (await r.json()) as { source: string };
    expect(body.source).toBe('GitHub Security Advisories (malware)');
  });

  it('returns normalized incidents + facets + attribution', async () => {
    mockUpstream(200, SAMPLE);
    const r = await SELF.fetch('https://x/api/v1/supply-chain-attacks?limit=101');
    expect(r.status).toBe(200);
    const body = (await r.json()) as {
      source: string;
      license: string;
      total: number;
      facets: { ecosystems: Record<string, number>; statuses: Record<string, number> };
      incidents: Array<{
        id: string;
        attack_vectors: string[];
        disclosed_date: string;
        iocs: Record<string, string[]>;
        status: string;
        remediation: string[];
      }>;
    };
    expect(body.source).toBe('GitHub Security Advisories (malware)');
    expect(body.license).toContain('GitHub Security Advisories');
    expect(body.total).toBe(3);
    // GHSA → catalog mapping
    expect(body.incidents[0]!.id).toBe('GHSA-aaaa-1111-2222');
    expect(body.incidents[0]!.attack_vectors).toEqual(['malicious-package']);
    expect(body.incidents[0]!.status).toBe('confirmed');
    expect(body.incidents[0]!.disclosed_date).toBe('2026-09-10T00:00:00Z');
    expect(body.incidents[0]!.iocs.packages).toEqual(['platform-telemetry-client']);
    // patched-version remediation derived from advisory metadata
    expect(body.incidents[1]!.remediation).toEqual(['Upgrade tailwind-form-kit to 1.2.3']);
    // facets reflect the FULL catalog
    expect(body.facets.ecosystems.npm).toBe(2);
    expect(body.facets.ecosystems.pip).toBe(1);
    expect(body.facets.statuses.confirmed).toBe(3);
  });

  it('filters by ecosystem (facets stay full-set)', async () => {
    mockUpstream(200, SAMPLE);
    const r = await SELF.fetch('https://x/api/v1/supply-chain-attacks?ecosystem=pip&limit=102');
    expect(r.status).toBe(200);
    const body = (await r.json()) as {
      count: number;
      incidents: Array<{ ecosystems: string[] }>;
      facets: { ecosystems: Record<string, number> };
    };
    expect(body.count).toBe(1);
    expect(body.incidents.every((i) => i.ecosystems.includes('pip'))).toBe(true);
    expect(body.facets.ecosystems.npm).toBe(2); // full-set facet survives filtering
  });

  it('filters by status', async () => {
    mockUpstream(200, SAMPLE);
    const r = await SELF.fetch('https://x/api/v1/supply-chain-attacks?status=confirmed&limit=103');
    expect(r.status).toBe(200);
    const body = (await r.json()) as { count: number; incidents: Array<{ status: string }> };
    expect(body.count).toBe(3);
    expect(body.incidents[0]!.status).toBe('confirmed');
  });

  it('400s on a non-numeric limit (validate() schema parity)', async () => {
    const r = await SELF.fetch('https://x/api/v1/supply-chain-attacks?limit=abc');
    expect(r.status).toBe(400);
  });

  it('sets a Cache-Control header on success', async () => {
    mockUpstream(200, SAMPLE);
    const r = await SELF.fetch('https://x/api/v1/supply-chain-attacks?limit=105');
    expect(r.headers.get('Cache-Control')).toContain('max-age');
  });
});
