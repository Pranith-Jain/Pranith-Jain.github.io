import { describe, it, expect, vi } from 'vitest';
import { discoverCves } from '../../../src/case-study/discovery/cve';

const fakeKev = {
  vulnerabilities: [
    {
      cveID: 'CVE-2026-1234',
      vendorProject: 'Fortinet',
      product: 'FortiGate',
      vulnerabilityName: 'Authentication Bypass',
      dateAdded: '2026-05-14',
      shortDescription: 'Auth bypass',
      knownRansomwareCampaignUse: 'Known',
    },
  ],
};

describe('discoverCves', () => {
  it('returns candidates from KEV with kev=true severity', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('cisa.gov')) return new Response(JSON.stringify(fakeKev));
      return new Response(JSON.stringify({ vulnerabilities: [] }));
    });
    const now = new Date('2026-05-14T06:00:00Z');
    const cands = await discoverCves({ fetch: fetchMock as any, now, getDedup: async () => null });
    expect(cands.length).toBeGreaterThan(0);
    const c = cands.find((x) => x.key === 'cve-2026-1234');
    expect(c).toBeDefined();
    expect(c!.type).toBe('cve');
    expect(c!.evidence.kev).toBe(true);
    expect(c!.score).toBeGreaterThan(0.6);
  });

  it('penalizes novelty if previously seen', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(fakeKev)));
    const now = new Date('2026-05-14T06:00:00Z');
    const dedup = async (key: string) => ({ lastSeenAt: now.toISOString() });
    const cands = await discoverCves({ fetch: fetchMock as any, now, getDedup: dedup });
    expect(cands[0].score).toBeLessThan(0.76);
  });
});
