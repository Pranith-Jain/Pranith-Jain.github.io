import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveRecord, resolveAllStandard } from '../../src/lib/dns';

beforeEach(() => vi.restoreAllMocks());

describe('resolveRecord', () => {
  it('parses successful A record response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          Status: 0,
          Answer: [{ name: 'example.com.', type: 1, TTL: 300, data: '93.184.216.34' }],
        })
      )
    );
    const r = await resolveRecord('example.com', 'A');
    expect(r.records).toEqual(['93.184.216.34']);
    expect(r.error).toBeUndefined();
  });

  it('returns empty records on NXDOMAIN', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          Status: 3,
          Answer: [],
        })
      )
    );
    const r = await resolveRecord('does-not-exist-xyz123.example', 'A');
    expect(r.records).toEqual([]);
  });

  it('strips quotes from TXT', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          Status: 0,
          Answer: [{ name: 'example.com.', type: 16, TTL: 300, data: '"v=spf1 -all"' }],
        })
      )
    );
    const r = await resolveRecord('example.com', 'TXT');
    expect(r.records).toEqual(['v=spf1 -all']);
  });

  it('returns error on non-200', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('boom', { status: 500 }));
    const r = await resolveRecord('example.com', 'A');
    expect(r.records).toEqual([]);
    expect(r.error).toMatch(/500/);
  });

  it('handles fetch rejection', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network'));
    const r = await resolveRecord('example.com', 'A');
    expect(r.records).toEqual([]);
    expect(r.error).toMatch(/network/);
  });
});

describe('resolveAllStandard', () => {
  it('returns map keyed by 8 standard record types', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          Status: 0,
          Answer: [{ name: 'x.', type: 1, TTL: 60, data: '1.2.3.4' }],
        })
      )
    );
    const r = await resolveAllStandard('example.com');
    expect(Object.keys(r).sort()).toEqual(['A', 'AAAA', 'CAA', 'CNAME', 'MX', 'NS', 'SOA', 'TXT']);
  });
});
