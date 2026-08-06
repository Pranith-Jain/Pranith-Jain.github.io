import { describe, it, expect } from 'vitest';
import {
  extractAtomicClaims,
  assignClaimsToPlatforms,
  planRepurposing,
  buildClaimHint,
  type AtomicClaim,
} from '../../src/case-study/generation/claim-extract';

const SAMPLE_BODY = `
LockBit posted 15 victims in 7 days. 4 of those companies already appeared on a different affiliate's leak site earlier this quarter.

Most coverage reads this as "LockBit is back." But the story underneath is operational: affiliates rotate the same victim pool across leak sites to pressure payment. The encryptor and the negotiator are differentiators the public reporting doesn't separate.

Median dwell time on the leak site before takedown was 11 days. The detection existed on day 1, but most EDR rules key on the encryptor hash, not the handoff between affiliates.

CVE-2026-42607 in Grav scores CVSS 9.1. Exploitation code dropped before the advisory. If you run Grav, patch now — this is in the CISA KEV catalog.

One KQL field exposes this whole campaign: the logon type. Everything else in the alert is noise. Write a Sigma rule for logon type 10 from a non-interactive account and you catch the lateral movement the encryptor hides.

If your IR retainer treats every extortion note as a fresh compromise, you've already lost the timing advantage. The teams that figure this out first will be the ones that survive.
`;

describe('extractAtomicClaims', () => {
  it('extracts claims with concrete anchors', () => {
    const claims = extractAtomicClaims(SAMPLE_BODY);
    expect(claims.length).toBeGreaterThan(0);
    // Should find the stat (15 victims), the CVE, the detection, the timeline, the actor
    const kinds = new Set(claims.map((c) => c.kind));
    expect(kinds.has('stat')).toBe(true);
    expect(kinds.has('cve')).toBe(true);
    expect(kinds.has('detection')).toBe(true);
    expect(kinds.has('timeline')).toBe(true);
    expect(kinds.has('actor')).toBe(true);
  });

  it('ranks claims by composite score (sharpness + proof + novelty)', () => {
    const claims = extractAtomicClaims(SAMPLE_BODY);
    expect(claims.length).toBeGreaterThan(1);
    // Scores should be descending
    for (let i = 1; i < claims.length; i++) {
      expect(claims[i - 1]!.score).toBeGreaterThanOrEqual(claims[i]!.score);
    }
  });

  it('caps at 7 claims', () => {
    const longBody = SAMPLE_BODY.repeat(20);
    const claims = extractAtomicClaims(longBody);
    expect(claims.length).toBeLessThanOrEqual(7);
  });

  it('deduplicates by kind (keeps highest-scoring of each kind)', () => {
    const claims = extractAtomicClaims(SAMPLE_BODY);
    const kinds = claims.map((c) => c.kind);
    const uniqueKinds = new Set(kinds);
    expect(kinds.length).toBe(uniqueKinds.size);
  });

  it('every claim has anchors or is an analytical kind (contrast/takeaway/detection)', () => {
    const claims = extractAtomicClaims(SAMPLE_BODY);
    for (const c of claims) {
      const hasAnchors = c.anchors.length > 0;
      const isAnalytical = c.kind === 'contrast' || c.kind === 'takeaway' || c.kind === 'detection';
      expect(hasAnchors || isAnalytical).toBe(true);
    }
  });

  it('skips vague sentences with no concrete anchor', () => {
    const vague = 'The threat landscape is evolving and organizations should stay vigilant.';
    const claims = extractAtomicClaims(vague);
    expect(claims.length).toBe(0);
  });

  it('stat claims have high proof scores', () => {
    const claims = extractAtomicClaims(SAMPLE_BODY);
    const stat = claims.find((c) => c.kind === 'stat');
    expect(stat).toBeDefined();
    expect(stat!.proof).toBeGreaterThan(0.2);
  });

  it('detection claims have high sharpness (save-magnet content)', () => {
    const claims = extractAtomicClaims(SAMPLE_BODY);
    const detection = claims.find((c) => c.kind === 'detection');
    expect(detection).toBeDefined();
    expect(detection!.sharpness).toBeGreaterThan(0.3);
  });
});

describe('assignClaimsToPlatforms', () => {
  it('assigns a distinct claim to each platform', () => {
    const claims = extractAtomicClaims(SAMPLE_BODY);
    const assignments = assignClaimsToPlatforms(claims);
    expect(assignments.length).toBe(3); // twitter, linkedin, instagram

    // Each platform gets a different claim (by text)
    const texts = assignments.map((a) => a.claim.text);
    const uniqueTexts = new Set(texts);
    expect(uniqueTexts.size).toBe(3);
  });

  it('returns empty array when no claims', () => {
    const assignments = assignClaimsToPlatforms([]);
    expect(assignments).toEqual([]);
  });

  it('twitter gets a stat or contrast (short, punchy)', () => {
    const claims = extractAtomicClaims(SAMPLE_BODY);
    const assignments = assignClaimsToPlatforms(claims);
    const twitter = assignments.find((a) => a.platform === 'twitter');
    expect(twitter).toBeDefined();
    expect(['stat', 'contrast', 'timeline', 'cve']).toContain(twitter!.claim.kind);
  });

  it('linkedin gets a takeaway or detection (save-magnet)', () => {
    const claims = extractAtomicClaims(SAMPLE_BODY);
    const assignments = assignClaimsToPlatforms(claims);
    const linkedin = assignments.find((a) => a.platform === 'linkedin');
    expect(linkedin).toBeDefined();
    expect(['takeaway', 'detection', 'contrast', 'stat']).toContain(linkedin!.claim.kind);
  });

  it('handles fewer claims than platforms gracefully', () => {
    const oneClaim: AtomicClaim[] = [
      {
        text: '15 victims in 7 days.',
        kind: 'stat',
        sharpness: 0.8,
        novelty: 0.5,
        proof: 0.7,
        score: 0.7,
        anchors: ['15 victims'],
      },
    ];
    const assignments = assignClaimsToPlatforms(oneClaim);
    // Only twitter gets the claim; linkedin/instagram get nothing (no fallback when pool is exhausted)
    expect(assignments.length).toBe(1);
    expect(assignments[0]!.platform).toBe('twitter');
  });
});

describe('buildClaimHint', () => {
  it('returns empty string for undefined assignment', () => {
    expect(buildClaimHint(undefined)).toBe('');
  });

  it('includes the claim text and platform note', () => {
    const claims = extractAtomicClaims(SAMPLE_BODY);
    const assignments = assignClaimsToPlatforms(claims);
    const twitterHint = buildClaimHint(assignments.find((a) => a.platform === 'twitter'));
    expect(twitterHint).toContain('<assigned_claim>');
    expect(twitterHint).toContain('Claim kind');
    expect(twitterHint).toContain('Concrete anchors');
  });

  it('twitter hint tells the model to lead tweet 1 with the claim', () => {
    const claims = extractAtomicClaims(SAMPLE_BODY);
    const assignments = assignClaimsToPlatforms(claims);
    const twitterHint = buildClaimHint(assignments.find((a) => a.platform === 'twitter'));
    expect(twitterHint).toContain('tweet 1');
  });

  it('linkedin hint references the fold', () => {
    const claims = extractAtomicClaims(SAMPLE_BODY);
    const assignments = assignClaimsToPlatforms(claims);
    const linkedinHint = buildClaimHint(assignments.find((a) => a.platform === 'linkedin'));
    expect(linkedinHint).toContain('above the fold');
  });
});

describe('planRepurposing', () => {
  it('returns claims + assignments together', () => {
    const result = planRepurposing(SAMPLE_BODY, 'ransom');
    expect(result.claims.length).toBeGreaterThan(0);
    expect(result.assignments.length).toBe(3);
  });

  it('assigns different claims to each platform', () => {
    const result = planRepurposing(SAMPLE_BODY);
    const texts = result.assignments.map((a) => a.claim.text);
    expect(new Set(texts).size).toBe(3);
  });
});
