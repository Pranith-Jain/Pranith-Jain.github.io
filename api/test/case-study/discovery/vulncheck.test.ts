import { describe, it, expect } from 'vitest';
import { discoverVulnCheckKev } from '../../../src/case-study/discovery/vulncheck';

const body = {
  data: [
    {
      cve: ['CVE-2026-9999'],
      vendorProject: 'Acme',
      product: 'Gateway',
      shortDescription: 'Pre-auth RCE',
      date_added: '2026-06-03',
    },
  ],
};

describe('discoverVulnCheckKev', () => {
  it('returns [] (no fetch) when token is absent', async () => {
    let called = false;
    const fetch = (async () => {
      called = true;
      return new Response('{}', { status: 200 });
    }) as any;
    const out = await discoverVulnCheckKev({
      fetch,
      now: new Date('2026-06-04T06:00:00Z'),
      getDedup: async () => null,
      token: '',
    });
    expect(out).toEqual([]);
    expect(called).toBe(false);
  });

  it('emits a cve candidate (kev → severity 1.0) within the window', async () => {
    const now = new Date('2026-06-04T06:00:00Z');
    const fetch = (async () => new Response(JSON.stringify(body), { status: 200 })) as any;
    const out = await discoverVulnCheckKev({ fetch, now, getDedup: async () => null, token: 'tok' });
    expect(out).toHaveLength(1);
    expect(out[0]!.type).toBe('cve');
    expect(out[0]!.key).toBe('cve-2026-9999');
    expect(out[0]!.title).toContain('CVE-2026-9999');
  });
});
