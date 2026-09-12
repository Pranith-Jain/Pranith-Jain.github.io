import { SELF } from 'cloudflare:test';
import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(() => {
  vi.restoreAllMocks();
});

// PRIMARY: supplychainattack.org catalog shape.
const SCA_SAMPLE = JSON.stringify({
  license: 'Catalog data is free to cite with attribution to supplychainattack.org.',
  revised: '2026-06-10',
  incidents: [
    {
      id: 'malware-in-foo',
      url: 'https://supplychainattack.org/incident/malware-in-foo',
      title: 'Malware in foo',
      status: 'active',
      severity: 'critical',
      ecosystems: ['npm'],
      attackVectors: ['compromised-package'],
      disclosedDate: '2026-06-10',
      lastUpdated: '2026-06-10',
      blastRadius: 'Any system with the package installed',
      affectedEntities: [{ name: 'foo', note: 'npm package' }],
      summary: 'The npm package foo contains malware.',
      iocs: { packages: ['foo'] },
      remediation: ['Immediately remove foo'],
      sources: [{ url: 'https://github.com/advisories/GHSA-aaaa', title: 'GHSA-aaaa', publisher: 'GitHub Advisory Database' }],
    },
    {
      id: 'malware-in-bar',
      url: 'https://supplychainattack.org/incident/malware-in-bar',
      title: 'Malware in bar',
      status: 'resolved',
      severity: 'high',
      ecosystems: ['pypi'],
      attackVectors: ['account-takeover'],
      disclosedDate: '2026-06-09',
      lastUpdated: '2026-06-09',
      blastRadius: '',
      affectedEntities: [{ name: 'bar' }],
      summary: '',
      iocs: { packages: ['bar'] },
      remediation: [],
      sources: [],
    },
  ],
});

// FALLBACK: GitHub malware advisory shape.
const GHSA_SAMPLE = JSON.stringify([
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
]);

/** URL-aware mock: primary vs fallback can succeed/fail independently. */
function mockTiers(primary: { status: number; body: string } | null, fallback: { status: number; body: string } | null) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes('supplychainattack.org')) {
      if (!primary) throw new Error('primary unreachable');
      return new Response(primary.body, { status: primary.status, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('api.github.com')) {
      if (!fallback) throw new Error('fallback unreachable');
      return new Response(fallback.body, { status: fallback.status, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

describe('GET /api/v1/supply-chain-attacks', () => {
  // FIRST: error path — runs before any success can populate the global
  // KV last-good (supplychain:lastgood:v1), which would otherwise mask the 502.
  it('502s when both tiers are unavailable and no last-good exists', async () => {
    mockTiers({ status: 402, body: '{"error":"pay"}' }, { status: 500, body: 'err' });
    const r = await SELF.fetch('https://x/api/v1/supply-chain-attacks?limit=104');
    expect(r.status).toBe(502);
    const body = (await r.json()) as { source: string };
    expect(body.source).toContain('supplychainattack.org');
  });

  it('serves the primary catalog when available', async () => {
    mockTiers({ status: 200, body: SCA_SAMPLE }, { status: 200, body: GHSA_SAMPLE });
    const r = await SELF.fetch('https://x/api/v1/supply-chain-attacks?limit=101');
    expect(r.status).toBe(200);
    const body = (await r.json()) as {
      source: string;
      license: string;
      total: number;
      facets: { ecosystems: Record<string, number>; statuses: Record<string, number> };
      incidents: Array<{ attack_vectors: string[]; disclosed_date: string; iocs: Record<string, string[]> }>;
    };
    expect(body.source).toBe('supplychainattack.org');
    expect(body.license).toContain('free to cite with attribution');
    expect(body.total).toBe(2);
    // snake_case normalization
    expect(body.incidents[0]!.attack_vectors).toEqual(['compromised-package']);
    expect(body.incidents[0]!.disclosed_date).toBe('2026-06-10');
    expect(body.incidents[0]!.iocs.packages).toEqual(['foo']);
    // facets reflect the FULL catalog
    expect(body.facets.ecosystems.npm).toBe(1);
    expect(body.facets.ecosystems.pypi).toBe(1);
    expect(body.facets.statuses.active).toBe(1);
    expect(body.facets.statuses.resolved).toBe(1);
  });

  it('falls back to GHSA malware when the primary is paywalled', async () => {
    mockTiers({ status: 402, body: '{"error":{"code":"402"}}' }, { status: 200, body: GHSA_SAMPLE });
    const r = await SELF.fetch('https://x/api/v1/supply-chain-attacks?limit=106');
    expect(r.status).toBe(200);
    const body = (await r.json()) as {
      source: string;
      total: number;
      incidents: Array<{ id: string; status: string; remediation: string[]; iocs: Record<string, string[]> }>;
    };
    expect(body.source).toBe('GitHub Security Advisories (malware)');
    expect(body.total).toBe(2);
    expect(body.incidents[0]!.id).toBe('GHSA-aaaa-1111-2222');
    expect(body.incidents[0]!.status).toBe('confirmed');
    expect(body.incidents[0]!.iocs.packages).toEqual(['platform-telemetry-client']);
    expect(body.incidents[1]!.remediation).toEqual(['Upgrade tailwind-form-kit to 1.2.3']);
  });

  it('filters by ecosystem (facets stay full-set)', async () => {
    mockTiers({ status: 402, body: '{}' }, { status: 200, body: GHSA_SAMPLE });
    const r = await SELF.fetch('https://x/api/v1/supply-chain-attacks?ecosystem=pip&limit=102');
    expect(r.status).toBe(200);
    const body = (await r.json()) as {
      count: number;
      incidents: Array<{ ecosystems: string[] }>;
      facets: { ecosystems: Record<string, number> };
    };
    expect(body.count).toBe(1);
    expect(body.incidents.every((i) => i.ecosystems.includes('pip'))).toBe(true);
    expect(body.facets.ecosystems.npm).toBe(1); // full-set facet survives filtering
  });

  it('400s on a non-numeric limit (validate() schema parity)', async () => {
    const r = await SELF.fetch('https://x/api/v1/supply-chain-attacks?limit=abc');
    expect(r.status).toBe(400);
  });

  it('sets a Cache-Control header on success', async () => {
    mockTiers({ status: 402, body: '{}' }, { status: 200, body: GHSA_SAMPLE });
    const r = await SELF.fetch('https://x/api/v1/supply-chain-attacks?limit=105');
    expect(r.headers.get('Cache-Control')).toContain('max-age');
  });
});
