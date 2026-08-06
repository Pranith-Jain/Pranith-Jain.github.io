import { describe, it, expect } from 'vitest';
import { buildVoiceProfile } from '../../src/case-study/generation/voice-profile';
import type { Post } from '../../src/case-study/types';

function makePost(body: string, slug = 'test-post'): Post {
  return {
    slug,
    type: 'cve',
    title: 'Test Post',
    excerpt: '',
    publishedAt: new Date().toISOString(),
    candidateId: 'test',
    body,
    hero: '',
    iocs: [],
    tags: [],
    sources: [],
  };
}

const SAMPLE_BODY_1 = `LockBit posted 15 victims in 7 days. 4 of those companies already appeared on a different affiliate's leak site earlier this quarter.

## Summary
Most coverage reads this as "LockBit is back." But the story underneath is operational: affiliates rotate the same victim pool across leak sites to pressure payment. The encryptor and the negotiator are differentiators the public reporting doesn't separate.

## Detection
One KQL field exposes this whole campaign: the logon type. Everything else in the alert is noise. Write a Sigma rule for logon type 10 from a non-interactive account.

\`\`\`kql
SigninLogs | where LogonType == 10
\`\`\`

## References
- [ransomlook.io](https://ransomlook.io) — 15 victim posts
`;

const SAMPLE_BODY_2 = `CVE-2026-42607 in Grav scores CVSS 9.1. Exploitation code dropped before the advisory. If you run Grav, patch now.

## What is this vulnerability?
This is a critical SQL injection in Grav CMS. The CVSS 9.1 score reflects remote code execution potential.

## Detection & mitigation
Write a Sigma rule for suspicious process creation. Use EDR telemetry to catch the exploit payload.

## References
- [NVD](https://nvd.nist.gov/vuln/detail/CVE-2026-42607)
`;

describe('buildVoiceProfile', () => {
  it('returns a zeroed profile for an empty post list', () => {
    const profile = buildVoiceProfile([]);
    expect(profile.sampleSize).toBe(0);
    expect(profile.avgSentenceLength).toBe(0);
    expect(profile.profileString).toContain('No published posts');
  });

  it('computes sentence length stats from post bodies', () => {
    const profile = buildVoiceProfile([makePost(SAMPLE_BODY_1)]);
    expect(profile.sampleSize).toBe(1);
    expect(profile.avgSentenceLength).toBeGreaterThan(0);
    expect(profile.medianSentenceLength).toBeGreaterThan(0);
  });

  it('counts contractions (casual voice marker)', () => {
    const profile = buildVoiceProfile([makePost(SAMPLE_BODY_1)]);
    // "don't", "isn't" etc. should be detected
    expect(profile.contractionRate).toBeGreaterThan(0);
  });

  it('detects em-dashes (the voice bans these)', () => {
    const bodyWithEmDash = `LockBit posted 15 victims — 4 were re-victimized. The story is operational.`;
    const profile = buildVoiceProfile([makePost(bodyWithEmDash)]);
    expect(profile.emDashRate).toBeGreaterThan(0);
  });

  it('classifies hook forms', () => {
    const profile = buildVoiceProfile([makePost(SAMPLE_BODY_1), makePost(SAMPLE_BODY_2)]);
    // SAMPLE_BODY_1 starts with "LockBit posted 15 victims" → data-shock
    // SAMPLE_BODY_2 starts with "CVE-2026-42607" → data-shock
    expect(Object.keys(profile.hookForms).length).toBeGreaterThan(0);
  });

  it('extracts domain vocabulary', () => {
    const profile = buildVoiceProfile([makePost(SAMPLE_BODY_1), makePost(SAMPLE_BODY_2)]);
    expect(profile.topVocabulary.length).toBeGreaterThan(0);
    const words = profile.topVocabulary.map((v) => v.word);
    expect(words).toContain('sigma');
    expect(words).toContain('kql');
    expect(words).toContain('cve');
    expect(words).toContain('cvss');
  });

  it('counts sections and bullets', () => {
    const profile = buildVoiceProfile([makePost(SAMPLE_BODY_1)]);
    expect(profile.avgSections).toBeGreaterThan(0);
    expect(profile.avgBullets).toBeGreaterThan(0);
  });

  it('detects code blocks', () => {
    const profile = buildVoiceProfile([makePost(SAMPLE_BODY_1)]);
    expect(profile.codeBlockRate).toBe(100); // 1/1 posts has code block
  });

  it('counts first-person usage', () => {
    const profile = buildVoiceProfile([
      makePost(
        'I investigated this breach last week. We found the IOC in the logs. I think the actor is LockBit. We should patch now.'
      ),
    ]);
    expect(profile.firstPersonRate).toBeGreaterThan(0);
  });

  it('builds a profile string for prompt injection', () => {
    const profile = buildVoiceProfile([makePost(SAMPLE_BODY_1)]);
    expect(profile.profileString).toContain('<voice_profile>');
    expect(profile.profileString).toContain('</voice_profile>');
    expect(profile.profileString).toContain('Sentence length');
    expect(profile.profileString).toContain('Contraction rate');
    expect(profile.profileString).toContain('Derived from 1 published post');
  });

  it('aggregates across multiple posts', () => {
    const profile = buildVoiceProfile([makePost(SAMPLE_BODY_1, 'post-1'), makePost(SAMPLE_BODY_2, 'post-2')]);
    expect(profile.sampleSize).toBe(2);
    expect(profile.avgSections).toBeGreaterThan(0);
    // Vocabulary should include words from both posts
    const words = profile.topVocabulary.map((v) => v.word);
    expect(words).toContain('sigma');
  });

  it('profile string notes casual vs formal based on contraction rate', () => {
    const casual = buildVoiceProfile([
      makePost("I don't think you're right. We can't fix this. It's broken. Won't work."),
    ]);
    expect(casual.profileString).toContain('Casual, conversational');

    const formal = buildVoiceProfile([
      makePost('The vulnerability is critical. The patch is available. The system is compromised.'),
    ]);
    expect(formal.profileString).toContain('Formal-leaning');
  });

  it('profile string includes dominant hook forms when present', () => {
    const profile = buildVoiceProfile([makePost(SAMPLE_BODY_1)]);
    if (Object.keys(profile.hookForms).length > 0) {
      expect(profile.profileString).toContain('Dominant hook forms');
    }
  });
});
