import { describe, it, expect, vi } from 'vitest';
import { fetchRecentVictims } from '../../src/case-study/ransom-source';

describe('fetchRecentVictims', () => {
  it('maps raw entries to Victim[]', async () => {
    const fake = [{ victim: 'ACME', group: 'Akira', discovered: '2026-05-13 10:00:00', post_url: 'http://x' }];
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(fake)));
    const victims = await fetchRecentVictims(fetchMock as any);
    expect(victims).toHaveLength(1);
    expect(victims[0].group).toBe('Akira');
    expect(victims[0].victim).toBe('ACME');
    expect(victims[0].url).toBe('http://x');
  });

  it('returns [] when API errors', async () => {
    const fetchMock = vi.fn(async () => new Response('boom', { status: 500 }));
    expect(await fetchRecentVictims(fetchMock as any)).toEqual([]);
  });
});
