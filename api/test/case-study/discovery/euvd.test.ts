import { describe, it, expect } from 'vitest';
import { discoverEuvd } from '../../../src/case-study/discovery/euvd';

const arr = [
  { id: 'EUVD-2026-1001', description: 'Heap overflow in Foo', datePublished: '2026-06-03T00:00:00Z', baseScore: 9.1 },
];

describe('discoverEuvd', () => {
  it('emits a cve-type candidate from a recent EUVD entry', async () => {
    const now = new Date('2026-06-04T06:00:00Z');
    const fetch = (async () => new Response(JSON.stringify(arr), { status: 200 })) as any;
    const out = await discoverEuvd({ fetch, now, getDedup: async () => null });
    expect(out).toHaveLength(1);
    expect(out[0]!.type).toBe('cve');
    expect(out[0]!.key).toBe('euvd-2026-1001');
    expect(out[0]!.title).toContain('EUVD-2026-1001');
  });

  it('a non-ok response yields []', async () => {
    const now = new Date('2026-06-04T06:00:00Z');
    const fetch = (async () => new Response('err', { status: 500 })) as any;
    const out = await discoverEuvd({ fetch, now, getDedup: async () => null });
    expect(out).toEqual([]);
  });
});
