import { describe, it, expect, vi } from 'vitest';
import { generatePost } from '../../../src/case-study/generation/index';
import type { Candidate } from '../../../src/case-study/types';
import type { LinkStatus } from '../../../src/lib/verify-url';

// Hermetic reference verifier: treat every URL as resolving so unit tests
// never issue real HEAD requests. Tests that exercise pruning pass their
// own stub.
const allOk = async (urls: string[]) => new Map<string, LinkStatus>(urls.map((u) => [u, 'ok']));

const candidate: Candidate = {
  key: 'cve-2026-1234',
  type: 'cve',
  title: 'CVE-2026-1234 — Fortinet FortiGate Auth Bypass',
  rationale: 'KEV',
  score: 0.9,
  evidence: { cveId: 'CVE-2026-1234', vendor: 'Fortinet', product: 'FortiGate', kev: true },
  discoveredAt: '2026-05-14T06:00:00Z',
  status: 'approved',
};

// Realistic body that clears the deterministic content-QA gate (word
// count, real sections, citations, no 3x repetition, no slop phrases).
const goodMd = [
  'An authentication bypass on an internet-facing firewall management plane is close to a worst case. CVE-2026-1234 is exactly that, and it is already on the CISA KEV list.',
  '## Summary',
  'CVE-2026-1234 lets an unauthenticated attacker reach the FortiGate management plane as a privileged user. KEV placement means exploitation is observed, not theoretical. The realistic time-to-impact here is short.',
  '## Affected products',
  'FortiGate builds before 7.4.5 on the affected branch are in scope. The fixed build closes the bypass cleanly, so the upgrade boundary is unambiguous for asset owners.',
  '## How it works',
  'The authentication decision can be skipped by a crafted management request, so the access check never runs. Because the request resembles ordinary admin traffic, basic logging will not surface it without a targeted rule.',
  '## Exploitation in the wild',
  'CISA KEV inclusion reflects confirmed exploitation against exposed devices. Opportunistic scanning of management interfaces is the expected near-term pattern.',
  '## Detection & mitigation',
  'Apply 7.4.5 on the vendor KEV due-date schedule and remove the management interface from the public internet first. Until patched, restrict it to a bastion and alert on admin sessions that lack a preceding authentication event.',
  '## IOCs',
  'No corroborated network indicators are published yet; the missing-auth session pattern above is the primary detection until samples land.',
  '## References',
  '- [CISA KEV catalog](https://www.cisa.gov/known-exploited-vulnerabilities)',
  '- [NVD record](https://nvd.nist.gov/vuln/detail/CVE-2026-1234)',
].join('\n\n');

describe('generatePost', () => {
  it('produces a complete Post for an approved candidate', async () => {
    const ai = { run: vi.fn(async () => ({ response: goodMd })) };
    const post = await generatePost({
      candidate,
      ai: ai as any,
      now: new Date('2026-05-19T15:05:00Z'),
      verifyRefs: allOk,
    });
    expect(post.slug).toMatch(/^cve-2026-1234/);
    expect(post.type).toBe('cve');
    expect(post.publishedAt).toBe('2026-05-19T15:05:00.000Z');
    expect(post.body).toContain('## Summary');
    expect(post.hero).toContain('<svg');
    expect(post.excerpt.length).toBeGreaterThan(0);
    expect(post.candidateId).toBe('cve-2026-1234');
  });

  it('throws if post-processing rejects the output', async () => {
    const ai = { run: vi.fn(async () => ({ response: 'Garbage with no sections.' })) };
    await expect(generatePost({ candidate, ai: ai as any, now: new Date() })).rejects.toThrow(/validation failed/i);
  });

  it('a QA-failing first draft is rescued by the one-shot repair pass', async () => {
    const thin = ['## Summary', 'Too short to be useful.', '## References', '- https://x.test'].join('\n\n');
    const ai = {
      run: vi
        .fn()
        .mockResolvedValueOnce({ response: thin }) // draft 1: structurally ok but fails QA
        .mockResolvedValueOnce({ response: goodMd }), // repair: substantive, passes QA
    };
    const post = await generatePost({ candidate, ai: ai as any, now: new Date(), verifyRefs: allOk });
    expect(ai.run).toHaveBeenCalledTimes(2); // proves the QA repair path ran
    expect(post.body).toContain('## Summary');
    expect(post.qa?.passed).toBe(true);
  });

  it('throws "qa failed" when content stays sub-standard after repair', async () => {
    const thin = ['## Summary', 'Too short.', '## References', '- https://x.test'].join('\n\n');
    const ai = { run: vi.fn(async () => ({ response: thin })) };
    await expect(generatePost({ candidate, ai: ai as any, now: new Date() })).rejects.toThrow(/qa failed/i);
  });

  it('prunes a confirmed-broken reference URL from the published post body', async () => {
    const withBrokenRef = [
      goodMd,
      '- [Fabricated writeup](https://www.bleepingcomputer.com/news/security/this-slug-does-not-exist/)',
    ].join('\n');
    const ai = { run: vi.fn(async () => ({ response: withBrokenRef })) };
    const post = await generatePost({
      candidate,
      ai: ai as any,
      now: new Date('2026-05-19T15:05:00Z'),
      verifyRefs: async (urls) =>
        new Map(urls.map((u) => [u, u.includes('this-slug-does-not-exist') ? 'broken' : 'ok'] as const)),
    });
    expect(post.body).not.toContain('this-slug-does-not-exist');
    expect(post.body).toContain('## Summary'); // good refs + body survive
  });
});
