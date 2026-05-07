import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rdapLookup } from '../../src/lib/rdap';

beforeEach(() => vi.restoreAllMocks());

describe('rdapLookup', () => {
  it('extracts registrar, dates, name servers, status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          handle: 'EXAMPLE-COM',
          ldhName: 'EXAMPLE.COM',
          events: [
            { eventAction: 'registration', eventDate: '1995-08-14T04:00:00Z' },
            { eventAction: 'expiration', eventDate: '2030-08-13T04:00:00Z' },
            { eventAction: 'last changed', eventDate: '2024-08-14T07:01:34Z' },
          ],
          entities: [{ roles: ['registrar'], vcardArray: ['vcard', [['fn', {}, 'text', 'IANA']]] }],
          nameservers: [{ ldhName: 'A.IANA-SERVERS.NET' }, { ldhName: 'B.IANA-SERVERS.NET' }],
          status: ['client transfer prohibited'],
        })
      )
    );
    const r = await rdapLookup('example.com');
    expect(r.registrar).toMatch(/IANA/i);
    expect(r.created).toBe('1995-08-14T04:00:00Z');
    expect(r.expires).toBe('2030-08-13T04:00:00Z');
    expect(r.nameservers).toEqual(['A.IANA-SERVERS.NET', 'B.IANA-SERVERS.NET']);
    expect(r.status).toContain('client transfer prohibited');
  });

  it('returns error on 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('not found', { status: 404 }));
    const r = await rdapLookup('does-not-exist.invalid');
    expect(r.error).toMatch(/404/);
  });

  it('handles empty response gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({})));
    const r = await rdapLookup('example.com');
    expect(r.nameservers).toEqual([]);
    expect(r.status).toEqual([]);
    expect(r.registrar).toBeUndefined();
  });
});
