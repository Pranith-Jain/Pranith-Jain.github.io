import { describe, it, expect } from 'vitest';
import { queryOsvBatch, queryOsvPackage } from '../../../src/lib/supply-chain/osv';

// URL-routing fake fetch: querybatch POST vs per-vuln GET. Asserts zero real network.
function osvFetch(
  batch: { results?: Array<{ vulns?: Array<{ id: string }> }> },
  vulns: Record<string, Record<string, unknown>>,
  calls?: { n: number }
): typeof fetch {
  return (async (url: string) => {
    if (calls) calls.n++;
    const u = String(url);
    if (u.endsWith('/v1/querybatch')) return new Response(JSON.stringify(batch), { status: 200 });
    const id = decodeURIComponent(u.split('/v1/vulns/')[1] ?? '');
    const v = vulns[id];
    return v ? new Response(JSON.stringify(v), { status: 200 }) : new Response('{}', { status: 404 });
  }) as unknown as typeof fetch;
}

describe('queryOsvBatch', () => {
  it('maps a vuln + isolates a MAL- malicious record', async () => {
    const batch = { results: [{ vulns: [{ id: 'GHSA-aaaa' }, { id: 'MAL-2024-0001' }] }] };
    const vulns = {
      'GHSA-aaaa': {
        summary: 'prototype pollution',
        severity: [{ type: 'CVSS_V3', score: '9.8' }],
        aliases: ['CVE-2024-1111'],
        affected: [{ ranges: [{ events: [{ introduced: '0' }, { fixed: '1.2.3' }] }] }],
      },
      'MAL-2024-0001': { summary: 'malicious typosquat', aliases: [], affected: [] },
    };
    const out = await queryOsvBatch([{ name: 'left-pad', ecosystem: 'npm', version: '1.0.0' }], {
      fetch: osvFetch(batch, vulns),
    });
    expect(out.results).toHaveLength(1);
    const r = out.results[0]!;
    expect(r.status).toBe('ok');
    expect(r.total).toBe(2);
    expect(r.malicious_count).toBe(1);
    const mal = r.findings.find((f) => f.id === 'MAL-2024-0001')!;
    expect(mal.malicious).toBe(true);
    const ghsa = r.findings.find((f) => f.id === 'GHSA-aaaa')!;
    expect(ghsa.malicious).toBe(false);
    expect(ghsa.cvss).toBe('9.8');
    expect(ghsa.fixed).toBe('1.2.3');
    expect(ghsa.aliases).toContain('CVE-2024-1111');
  });

  it('returns status empty for a package with no vulns', async () => {
    const out = await queryOsvBatch([{ name: 'clean-pkg', ecosystem: 'npm' }], {
      fetch: osvFetch({ results: [{ vulns: [] }] }, {}),
    });
    expect(out.results[0]!.status).toBe('empty');
    expect(out.results[0]!.total).toBe(0);
    expect(out.results[0]!.findings).toEqual([]);
  });

  it('caps detail lookups at 35 and flags detailed_capped', async () => {
    const ids = Array.from({ length: 40 }, (_, i) => ({ id: `GHSA-${i}` }));
    const vulns: Record<string, Record<string, unknown>> = {};
    for (const { id } of ids) vulns[id] = { summary: id, aliases: [] };
    const out = await queryOsvBatch([{ name: 'p', ecosystem: 'npm' }], {
      fetch: osvFetch({ results: [{ vulns: ids }] }, vulns),
    });
    expect(out.detailed_capped).toBe(true);
    expect(out.results[0]!.findings).toHaveLength(40); // all ids appear (id-only beyond cap)
    const detailed = out.results[0]!.findings.filter((f) => f.summary);
    expect(detailed.length).toBeLessThanOrEqual(35);
  });

  it('queryOsvPackage wraps the single-package path', async () => {
    const batch = { results: [{ vulns: [{ id: 'MAL-X' }] }] };
    const r = await queryOsvPackage('evilpkg', 'npm', undefined, {
      fetch: osvFetch(batch, { 'MAL-X': { summary: 'm', aliases: [] } }),
    });
    expect(r.package).toBe('evilpkg');
    expect(r.malicious_count).toBe(1);
    expect(r.status).toBe('ok');
  });

  it('never throws: upstream non-ok yields error status', async () => {
    const f = (async () => new Response('nope', { status: 502 })) as unknown as typeof fetch;
    const out = await queryOsvBatch([{ name: 'p', ecosystem: 'npm' }], { fetch: f });
    expect(out.results[0]!.status).toBe('error');
  });
});
