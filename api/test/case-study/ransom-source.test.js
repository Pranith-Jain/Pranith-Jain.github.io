import { describe, it, expect, vi } from 'vitest';
import { fetchRecentVictims } from '../../src/case-study/ransom-source';
describe('fetchRecentVictims', () => {
    it('maps raw entries to Victim[]', async () => {
        const fake = [
            { post_title: 'ACME', group_name: 'Akira', discovered: '2026-05-13 10:00:00', link: '/company/akira/' },
        ];
        const fetchMock = vi.fn(async () => new Response(JSON.stringify(fake)));
        const victims = await fetchRecentVictims(fetchMock);
        expect(victims).toHaveLength(1);
        expect(victims[0].group).toBe('Akira');
        expect(victims[0].victim).toBe('ACME');
        expect(victims[0].url).toBe('https://www.ransomlook.io/company/akira/');
    });
    it('returns [] when API errors', async () => {
        const fetchMock = vi.fn(async () => new Response('boom', { status: 500 }));
        expect(await fetchRecentVictims(fetchMock)).toEqual([]);
    });
});
