import { describe, it, expect } from 'vitest';
import { discoverRansomware } from '../../../src/case-study/discovery/ransomware';

describe('discoverRansomware', () => {
  it('groups victims by ransomware group and uses victim count as severity', async () => {
    const victims = [
      { group: 'Akira', victim: 'ACME', postedAt: '2026-05-13T00:00:00Z', url: 'http://x' },
      { group: 'Akira', victim: 'BCorp', postedAt: '2026-05-14T00:00:00Z', url: 'http://y' },
      { group: 'LockBit', victim: 'XCorp', postedAt: '2026-05-13T00:00:00Z', url: 'http://z' },
    ];
    const cands = await discoverRansomware({
      fetchVictims: async () => victims,
      now: new Date('2026-05-14T06:00:00Z'),
      getDedup: async () => null,
    });
    const akira = cands.find((c) => c.key.startsWith('ransom-akira'));
    expect(akira).toBeDefined();
    expect(akira!.evidence.victimCount).toBe(2);
  });
});
