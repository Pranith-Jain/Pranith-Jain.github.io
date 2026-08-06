import { describe, it, expect } from 'vitest';
import {
  analyzeCrossPlatform,
  assessReadiness,
  formatReadiness,
  type PlatformCopy,
} from '../../src/case-study/generation/readiness-gate';
import type { SocialContent } from '../../src/case-study/generation/social';

// ── Helpers ──────────────────────────────────────────────────────────────

function makeContent(twitter: string, linkedin: string, instagram?: string): SocialContent {
  return {
    slug: 'test-slug',
    twitter,
    linkedin,
    instagram,
    generatedAt: new Date().toISOString(),
    _validation: {
      twitter_quality: {
        char_count: twitter.length,
        over_limit: false,
        ungrounded_cves: [],
        untrusted_urls: 0,
        slop_count: 0,
        score: 75,
        issues: [],
      },
      linkedin_quality: {
        char_count: linkedin.length,
        over_limit: false,
        ungrounded_cves: [],
        untrusted_urls: 0,
        slop_count: 0,
        score: 75,
        issues: [],
      },
      instagram_quality: instagram
        ? {
            char_count: instagram.length,
            over_limit: false,
            ungrounded_cves: [],
            untrusted_urls: 0,
            slop_count: 0,
            score: 75,
            issues: [],
          }
        : undefined,
    },
  };
}

// ── analyzeCrossPlatform ──────────────────────────────────────────────────

describe('analyzeCrossPlatform', () => {
  it('reports 100 hook diversity when platforms open with completely different hooks', () => {
    const copies: PlatformCopy[] = [
      { platform: 'twitter', text: 'LockBit posted 15 victims in 7 days. Affiliate churn, not new compromise.' },
      { platform: 'linkedin', text: 'The encryptor ran on day 11. The detection existed on day 1.' },
      {
        platform: 'instagram',
        text: 'CVE-2026-42607 in Grav scores CVSS 9.1. Exploitation code dropped before the advisory.',
      },
    ];
    const report = analyzeCrossPlatform(copies);
    expect(report.hookDiversity).toBe(100);
    expect(report.similarHookPairs).toHaveLength(0);
  });

  it('flags similar hooks (same opening line)', () => {
    const sameHook = 'LockBit posted 15 victims in 7 days. This is affiliate churn.';
    const copies: PlatformCopy[] = [
      { platform: 'twitter', text: sameHook + '\n\nFIRST REPLY: https://pranithjain.qzz.io/blog/test' },
      { platform: 'linkedin', text: sameHook + '\n\nThe story underneath is operational.' },
    ];
    const report = analyzeCrossPlatform(copies);
    expect(report.similarHookPairs.length).toBeGreaterThan(0);
    expect(report.hookDiversity).toBeLessThan(60);
  });

  it('normalizes platform chrome before comparing', () => {
    // Same prose with different chrome (hashtags, links, counters) should still be flagged
    const copies: PlatformCopy[] = [
      {
        platform: 'twitter',
        text: 'LockBit posted 15 victims. (1/6)\n\n#ransomware #DFIR\nFIRST REPLY: https://pranithjain.qzz.io/blog/test',
      },
      {
        platform: 'linkedin',
        text: 'LockBit posted 15 victims.\n\nThe story underneath is operational.\n\nFIRST COMMENT: https://pranithjain.qzz.io/blog/test\n#LockBit #Ransomware',
      },
    ];
    const report = analyzeCrossPlatform(copies);
    // Hooks are identical after normalization → low diversity
    expect(report.hookDiversity).toBeLessThan(60);
  });

  it('handles a single platform gracefully', () => {
    const copies: PlatformCopy[] = [{ platform: 'twitter', text: 'Only Twitter has copy.' }];
    const report = analyzeCrossPlatform(copies);
    expect(report.hookDiversity).toBe(100); // no pairs to compare
    expect(report.similarHookPairs).toHaveLength(0);
  });

  it('handles empty copies', () => {
    const copies: PlatformCopy[] = [
      { platform: 'twitter', text: '' },
      { platform: 'linkedin', text: '' },
    ];
    const report = analyzeCrossPlatform(copies);
    expect(report.hookDiversity).toBe(100);
  });
});

// ── assessReadiness ───────────────────────────────────────────────────────

describe('assessReadiness', () => {
  it('marks ready when all platforms pass and hooks are diverse', () => {
    const content = makeContent(
      'LockBit posted 15 victims in 7 days. Affiliate churn.',
      'The encryptor ran on day 11. The detection existed on day 1. Most EDR rules miss the handoff.',
      'CVE-2026-42607 in Grav. CVSS 9.1. Patch now.'
    );
    const verdict = assessReadiness(content);
    expect(verdict.ready).toBe(true);
    expect(verdict.score).toBeGreaterThanOrEqual(60);
    expect(verdict.blockers).toHaveLength(0);
  });

  it('blocks when a platform exceeds char limit', () => {
    const content = makeContent('a'.repeat(300), 'b'.repeat(200));
    content._validation!.twitter_quality!.over_limit = true;
    content._validation!.twitter_quality!.issues = ['Post exceeds 280 chars (300)'];
    const verdict = assessReadiness(content);
    expect(verdict.ready).toBe(false);
    expect(verdict.blockers.length).toBeGreaterThan(0);
    expect(verdict.blockers[0]).toContain('twitter');
    expect(verdict.blockers[0]).toContain('character limit');
  });

  it('warns when cross-platform hooks are too similar', () => {
    const sameHook = 'LockBit posted 15 victims in 7 days. This is affiliate churn, not new compromise.';
    const content = makeContent(sameHook, sameHook + '\n\nThe story underneath is operational.');
    const verdict = assessReadiness(content);
    expect(verdict.warnings.some((w) => w.includes('hooks are') && w.includes('similar'))).toBe(true);
  });

  it('warns when a platform quality score is low', () => {
    const content = makeContent('good twitter post', 'good linkedin post');
    content._validation!.twitter_quality!.score = 40;
    content._validation!.twitter_quality!.issues = ['only 2 concrete specifics'];
    const verdict = assessReadiness(content);
    expect(verdict.warnings.some((w) => w.includes('twitter') && w.includes('40'))).toBe(true);
  });

  it('warns when twitter or linkedin copy is missing', () => {
    const content = makeContent('', 'good linkedin post');
    const verdict = assessReadiness(content);
    expect(verdict.warnings.some((w) => w.includes('twitter') && w.includes('no copy'))).toBe(true);
  });

  it('does not warn about missing instagram (optional)', () => {
    const content = makeContent('good twitter post', 'good linkedin post');
    const verdict = assessReadiness(content);
    expect(verdict.warnings.some((w) => w.includes('instagram') && w.includes('no copy'))).toBe(false);
  });

  it('penalizes score for low hook diversity', () => {
    const diverse = makeContent(
      'LockBit posted 15 victims in 7 days. Affiliate churn.',
      'The encryptor ran on day 11. The detection existed on day 1.',
      'CVE-2026-42607 in Grav. CVSS 9.1.'
    );
    const sameHook = 'LockBit posted 15 victims in 7 days. This is affiliate churn.';
    const similar = makeContent(sameHook, sameHook + '\n\nMore detail here.');
    const diverseVerdict = assessReadiness(diverse);
    const similarVerdict = assessReadiness(similar);
    expect(similarVerdict.score).toBeLessThan(diverseVerdict.score);
  });

  it('returns per-platform summary', () => {
    const content = makeContent('twitter copy', 'linkedin copy', 'instagram copy');
    const verdict = assessReadiness(content);
    expect(verdict.platforms).toHaveLength(3);
    expect(verdict.platforms.map((p) => p.platform)).toEqual(['twitter', 'linkedin', 'instagram']);
    expect(verdict.platforms[0]!.present).toBe(true);
  });
});

// ── formatReadiness ───────────────────────────────────────────────────────

describe('formatReadiness', () => {
  it('shows READY for a passing verdict', () => {
    const content = makeContent(
      'LockBit posted 15 victims in 7 days.',
      'The encryptor ran on day 11. Detection existed on day 1.'
    );
    const verdict = assessReadiness(content);
    const formatted = formatReadiness(verdict);
    expect(formatted).toContain('READY');
    expect(formatted).toContain('score');
  });

  it('shows NOT READY for a failing verdict', () => {
    const content = makeContent('a'.repeat(300), 'b'.repeat(200));
    content._validation!.twitter_quality!.over_limit = true;
    content._validation!.twitter_quality!.issues = ['exceeds 280 chars'];
    const verdict = assessReadiness(content);
    const formatted = formatReadiness(verdict);
    expect(formatted).toContain('NOT READY');
    expect(formatted).toContain('Blockers');
  });
});
