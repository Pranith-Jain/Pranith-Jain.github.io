import { describe, it, expect, vi } from 'vitest';
import { runDiscovery } from '../../src/case-study/discovery';
import { discoverCves } from '../../src/case-study/discovery/cve';
import { runPlanner } from '../../src/case-study/publishing/planner';
import { runPublisher } from '../../src/case-study/publishing/publisher';
import { putCandidate, deleteCandidate, listCandidates } from '../../src/case-study/storage/candidates';
import { approve, listApproved, getApproved, unapprove } from '../../src/case-study/storage/approved';
import { getSchedule, setSchedule, markSlotStatus, pickDueSlot } from '../../src/case-study/storage/schedule';
import { touchDedup, touchDedupMany, getDedup } from '../../src/case-study/storage/dedup';
import { putPost, getPost, listPostIndex } from '../../src/case-study/storage/posts';
import { recordFailure } from '../../src/case-study/storage/failed';
import { generatePost } from '../../src/case-study/generation';
function makeKv() {
    const store = new Map();
    return {
        store,
        async get(k, t) {
            const e = store.get(k);
            if (!e)
                return null;
            return t === 'json' ? JSON.parse(e.value) : e.value;
        },
        async put(k, v, opts) {
            store.set(k, { value: v, ttl: opts?.expirationTtl });
        },
        async delete(k) {
            store.delete(k);
        },
        async list(opts) {
            const keys = Array.from(store.keys())
                .filter((k) => k.startsWith(opts.prefix))
                .map((name) => ({ name }));
            return { keys, list_complete: true, cursor: '' };
        },
    };
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
// Realistic golden-path body: passes the deterministic content-QA gate
// (enough words, real sections, citations, no 3x repetition, no slop).
const goodMd = [
    'A pre-auth command injection in an internet-facing controller is the kind of bug that turns a quiet week loud. This one is unauthenticated and network-reachable, which collapses the usual time-to-exploit.',
    '## Summary',
    'The flaw lets an unauthenticated attacker run operating-system commands on the management plane. Reachability is the whole story here: no credentials, no user interaction, just a reachable port. Confidence is high because a working proof-of-concept is already public.',
    '## Affected products',
    'The vulnerable code path ships in the default configuration of the affected controller line. Older maintenance branches are in scope as well. Versions on the fixed train are not affected, which makes the upgrade boundary unusually clean.',
    '## How it works',
    'User-supplied input reaches a shell context without sanitisation. The request that triggers it looks like ordinary management traffic, so naive logging will not flag it. The interesting detail is that the injection point sits before the authentication check, not after it.',
    '## Exploitation in the wild',
    'Scanning for the affected service rose sharply once the proof-of-concept landed. Opportunistic exploitation against exposed instances is the realistic near-term expectation rather than targeted use.',
    '## Detection & mitigation',
    'Hunt for management-plane requests that carry shell metacharacters in the parameter that feeds the vulnerable handler. Restrict the management interface to a jump host and apply the fixed train on the vendor schedule. Network ACLs in front of the controller cut the blast radius even before patching completes.',
    '## IOCs',
    'No high-confidence network indicators are published yet; treat the request pattern above as the primary detection until samples are corroborated.',
    '## References',
    '- [NVD record](https://nvd.nist.gov/vuln/detail/CVE-2026-1234)',
    '- [CISA KEV catalog](https://www.cisa.gov/known-exploited-vulnerabilities-catalog)',
].join('\n\n');
describe('e2e CVE golden path', () => {
    it('discover → approve → plan → publish produces a post', async () => {
        const kv = makeKv();
        const fetch = vi.fn(async () => new Response(JSON.stringify(fakeKev)));
        const ai = { run: vi.fn(async () => ({ response: goodMd })) };
        const tStart = new Date('2026-05-14T06:00:00Z');
        await runDiscovery({
            runners: {
                cve: () => discoverCves({ fetch: fetch, now: tStart, getDedup: (k) => getDedup(kv, k) }),
                actor: async () => [],
                malware: async () => [],
                ransom: async () => [],
            },
            putCandidate: (c) => putCandidate(kv, c),
            commitDedup: (keys, n) => touchDedupMany(kv, keys, n),
            now: tStart,
        });
        const cves = await listCandidates(kv, 'cve');
        expect(cves).toHaveLength(1);
        const target = cves[0];
        await approve(kv, target);
        await deleteCandidate(kv, 'cve', target.key);
        expect((await listApproved(kv))[0].key).toBe(target.key);
        const tPlanner = new Date('2026-05-17T23:00:00Z');
        await runPlanner({
            listApproved: () => listApproved(kv),
            setSchedule: (slots) => setSchedule(kv, slots),
            now: tPlanner,
            random: () => 0.5,
        });
        const schedule = await getSchedule(kv);
        expect(schedule).toHaveLength(1);
        const tPublish = new Date(schedule[0].slotAt);
        const res = await runPublisher({
            pickDueSlot: (n) => pickDueSlot(kv, n),
            markSlotStatus: (cid, status, extras) => markSlotStatus(kv, cid, status, extras),
            getApproved: (k) => getApproved(kv, k),
            unapprove: (k) => unapprove(kv, k),
            generatePost: (cand, n) => generatePost({ candidate: cand, ai: ai, now: n }),
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
        const post = await getPost(kv, index[0].slug);
        expect(post).toBeTruthy();
        expect(post.body).toContain('## Summary');
        expect(post.candidateId).toBe(target.key);
        expect(await listApproved(kv)).toHaveLength(0);
    });
});
