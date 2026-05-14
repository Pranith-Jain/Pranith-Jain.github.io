import { describe, it, expect, vi } from 'vitest';
import { generatePost } from '../../../src/case-study/generation/index';
import type { Candidate } from '../../../src/case-study/types';

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

const goodMd = [
  '## Summary',
  'CVE-2026-1234 affects Fortinet FortiGate.',
  '## Affected products',
  'FortiGate < 7.4.5',
  '## How it works',
  'Auth bypass.',
  '## Exploitation in the wild',
  'In KEV.',
  '## Detection & mitigation',
  'Patch.',
  '## IOCs',
  'None public.',
  '## References',
  '- https://www.cisa.gov/known-exploited-vulnerabilities',
].join('\n\n');

describe('generatePost', () => {
  it('produces a complete Post for an approved candidate', async () => {
    const ai = { run: vi.fn(async () => ({ response: goodMd })) };
    const post = await generatePost({
      candidate,
      ai: ai as any,
      now: new Date('2026-05-19T15:05:00Z'),
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
});
