import { describe, it, expect, vi } from 'vitest';
import { runDiscovery } from '../../src/case-study/discovery';
import { discoverCves } from '../../src/case-study/discovery/cve';
import { runPlanner } from '../../src/case-study/publishing/planner';
import { runPublisher } from '../../src/case-study/publishing/publisher';
import { putCandidate, deleteCandidate, listCandidates } from '../../src/case-study/storage/candidates';
import { approve, listApproved, getApproved, unapprove } from '../../src/case-study/storage/approved';
import { getSchedule, setSchedule, markSlotStatus, pickDueSlot } from '../../src/case-study/storage/schedule';
import { touchDedup, getDedup } from '../../src/case-study/storage/dedup';
import { putPost, getPost, listPostIndex } from '../../src/case-study/storage/posts';
import { recordFailure } from '../../src/case-study/storage/failed';
import { generatePost } from '../../src/case-study/generation';

function makeKv() {
  const store = new Map<string, { value: string; ttl?: number }>();
  return {
    store,
    async get(k: string, t?: 'json') {
      const e = store.get(k);
      if (!e) return null;
      return t === 'json' ? JSON.parse(e.value) : e.value;
    },
    async put(k: string, v: string, opts?: { expirationTtl?: number }) {
      store.set(k, { value: v, ttl: opts?.expirationTtl });
    },
    async delete(k: string) {
      store.delete(k);
    },
    async list(opts: { prefix: string }) {
      const keys = Array.from(store.keys())
        .filter((k) => k.startsWith(opts.prefix))
        .map((name) => ({ name }));
      return { keys, list_complete: true, cursor: '' };
    },
  } as any;
}

const fakeKev = {
  vulnerabilities: [
    {
      cveID: 'CVE-2026-1234',
      vendorProject: 'Fortinet',
      product: 'FortiGate',
      vulnerabilityName: 'Auth Bypass',
      dateAdded: '2026-05-14',
      shortDescription: 'x',
      knownRansomwareCampaignUse: 'Known',
    },
  ],
};

const goodMd = [
  '## Summary',
  'x',
  '## Affected products',
  'x',
  '## How it works',
  'x',
  '## Exploitation in the wild',
  'x',
  '## Detection & mitigation',
  'x',
  '## IOCs',
  'None.',
  '## References',
  '- https://example.com',
].join('\n\n');

describe('e2e CVE golden path', () => {
  it('discover → approve → plan → publish produces a post', async () => {
    const kv = makeKv();
    const fetch = vi.fn(async () => new Response(JSON.stringify(fakeKev)));
    const ai = { run: vi.fn(async () => ({ response: goodMd })) };

    const tStart = new Date('2026-05-14T06:00:00Z');
    await runDiscovery({
      runners: {
        cve: () => discoverCves({ fetch: fetch as any, now: tStart, getDedup: (k) => getDedup(kv, k) }),
        actor: async () => [],
        malware: async () => [],
        ransom: async () => [],
      },
      putCandidate: (c) => putCandidate(kv, c),
      touchDedup: (k, n) => touchDedup(kv, k, n),
      now: tStart,
    });
    const cves = await listCandidates(kv, 'cve');
    expect(cves).toHaveLength(1);
    const target = cves[0]!;

    await approve(kv, target);
    await deleteCandidate(kv, 'cve', target.key);
    expect((await listApproved(kv))[0]!.key).toBe(target.key);

    const tPlanner = new Date('2026-05-17T23:00:00Z');
    await runPlanner({
      listApproved: () => listApproved(kv),
      setSchedule: (slots) => setSchedule(kv, slots),
      now: tPlanner,
      random: () => 0.5,
    });
    const schedule = await getSchedule(kv);
    expect(schedule).toHaveLength(1);

    const tPublish = new Date(schedule[0]!.slotAt);
    const res = await runPublisher({
      pickDueSlot: (n) => pickDueSlot(kv, n),
      markSlotStatus: (cid, status, extras) => markSlotStatus(kv, cid, status, extras),
      getApproved: (k) => getApproved(kv, k),
      unapprove: (k) => unapprove(kv, k),
      generatePost: (cand, n) => generatePost({ candidate: cand, ai: ai as any, now: n }),
      putPost: (p) => putPost(kv, p),
      refreshRss: async () => {
        kv.store.set('meta:rss', { value: '<rss/>' });
      },
      touchDedup: (k, when, slug) => touchDedup(kv, k, when, slug),
      recordFailure: (rec) => recordFailure(kv, rec),
      now: tPublish,
    });
    expect(res.published).toBe(1);

    const index = await listPostIndex(kv);
    expect(index).toHaveLength(1);
    const post = await getPost(kv, index[0]!.slug);
    expect(post).toBeTruthy();
    expect(post!.body).toContain('## Summary');
    expect(post!.candidateId).toBe(target.key);
    expect(await listApproved(kv)).toHaveLength(0);
  });
});
