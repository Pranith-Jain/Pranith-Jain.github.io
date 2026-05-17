import { describe, it, expect } from 'vitest';
import {
  putCandidate,
  getCandidate,
  listCandidates,
  listAllCandidates,
  deleteCandidate,
} from '../../../src/case-study/storage/candidates';
import { countByPrefix } from '../../../src/case-study/storage/kv-util';
import type { Candidate } from '../../../src/case-study/types';

function mockKV() {
  const store = new Map<string, { value: string; expiresAt?: number }>();
  return {
    store,
    async get(key: string, _type?: 'json') {
      const e = store.get(key);
      if (!e) return null;
      if (e.expiresAt && Date.now() > e.expiresAt) {
        store.delete(key);
        return null;
      }
      return _type === 'json' ? JSON.parse(e.value) : e.value;
    },
    async put(key: string, value: string, opts?: { expirationTtl?: number }) {
      store.set(key, {
        value,
        expiresAt: opts?.expirationTtl ? Date.now() + opts.expirationTtl * 1000 : undefined,
      });
    },
    async delete(key: string) {
      store.delete(key);
    },
    async list(opts: { prefix: string }) {
      const keys = Array.from(store.keys())
        .filter((k) => k.startsWith(opts.prefix))
        .map((name) => ({ name }));
      return { keys, list_complete: true, cursor: '' };
    },
  };
}

const sampleCandidate: Candidate = {
  key: 'cve-2026-1234',
  type: 'cve',
  title: 'Test CVE',
  rationale: 'in KEV',
  score: 0.9,
  evidence: { cve: 'CVE-2026-1234' },
  discoveredAt: '2026-05-14T06:00:00Z',
  status: 'pending',
};

describe('candidates storage', () => {
  it('round-trips a candidate', async () => {
    const kv = mockKV() as any;
    await putCandidate(kv, sampleCandidate);
    const fetched = await getCandidate(kv, 'cve', 'cve-2026-1234');
    expect(fetched).toEqual(sampleCandidate);
  });

  it('writes with 7-day TTL', async () => {
    const kv = mockKV() as any;
    await putCandidate(kv, sampleCandidate);
    const entry = kv.store.get('candidates:cve:cve-2026-1234');
    expect(entry?.expiresAt).toBeDefined();
    const now = Date.now();
    const sevenDays = 7 * 24 * 3600 * 1000;
    expect(entry!.expiresAt! - now).toBeGreaterThan(sevenDays - 60_000);
    expect(entry!.expiresAt! - now).toBeLessThan(sevenDays + 60_000);
  });

  it('listCandidates returns candidates of a type', async () => {
    const kv = mockKV() as any;
    await putCandidate(kv, sampleCandidate);
    await putCandidate(kv, { ...sampleCandidate, key: 'cve-2026-5678' });
    await putCandidate(kv, { ...sampleCandidate, key: 'actor-fin7', type: 'actor' });
    const cves = await listCandidates(kv, 'cve');
    expect(cves).toHaveLength(2);
    const actors = await listCandidates(kv, 'actor');
    expect(actors).toHaveLength(1);
  });

  it('listAllCandidates returns every type in one pass', async () => {
    const kv = mockKV() as any;
    await putCandidate(kv, sampleCandidate);
    await putCandidate(kv, { ...sampleCandidate, key: 'cve-2026-5678' });
    await putCandidate(kv, { ...sampleCandidate, key: 'actor-fin7', type: 'actor' });
    await putCandidate(kv, { ...sampleCandidate, key: 'ransom-akira', type: 'ransom' });
    const all = await listAllCandidates(kv);
    expect(all).toHaveLength(4);
    expect(new Set(all.map((c) => c.type))).toEqual(new Set(['cve', 'actor', 'ransom']));
  });

  it('countByPrefix counts keys without fetching bodies', async () => {
    const kv = mockKV() as any;
    let gets = 0;
    const origGet = kv.get.bind(kv);
    kv.get = async (...a: unknown[]) => {
      gets += 1;
      return origGet(...a);
    };
    await putCandidate(kv, sampleCandidate);
    await putCandidate(kv, { ...sampleCandidate, key: 'actor-fin7', type: 'actor' });
    const n = await countByPrefix(kv, 'candidates:');
    expect(n).toBe(2);
    expect(gets).toBe(0);
  });

  it('deleteCandidate removes the entry', async () => {
    const kv = mockKV() as any;
    await putCandidate(kv, sampleCandidate);
    await deleteCandidate(kv, 'cve', 'cve-2026-1234');
    expect(await getCandidate(kv, 'cve', 'cve-2026-1234')).toBeNull();
  });
});
