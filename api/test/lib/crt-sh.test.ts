import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ctLogs } from '../../src/lib/crt-sh';

beforeEach(() => vi.restoreAllMocks());

describe('ctLogs', () => {
  it('returns parsed entries sorted by recency, capped at 50', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            id: 1,
            common_name: 'example.com',
            name_value: 'example.com\nwww.example.com',
            issuer_name: "C=US, O=Let's Encrypt, CN=R3",
            not_before: '2024-01-01T00:00:00',
            not_after: '2024-04-01T00:00:00',
          },
          {
            id: 2,
            common_name: 'example.com',
            name_value: 'example.com',
            issuer_name: "C=US, O=Let's Encrypt, CN=R10",
            not_before: '2024-04-01T00:00:00',
            not_after: '2024-07-01T00:00:00',
          },
        ])
      )
    );
    const r = await ctLogs('example.com');
    expect(r.length).toBeLessThanOrEqual(50);
    // sorted by recency: most recent first
    expect(r[0].not_before >= r[r.length - 1].not_before).toBe(true);
    expect(r[0].subjects).toEqual(expect.arrayContaining(['example.com']));
    expect(r[0].issuer).toMatch(/Let's Encrypt|R/);
  });

  it('returns [] on non-200', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('boom', { status: 502 }));
    expect(await ctLogs('x.invalid')).toEqual([]);
  });

  it('returns [] on fetch rejection', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network'));
    expect(await ctLogs('x.invalid')).toEqual([]);
  });
});
