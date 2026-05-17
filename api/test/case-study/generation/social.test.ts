import { describe, it, expect } from 'vitest';
import type { Post } from '../../../src/case-study/types';

const mockPost: Post = {
  slug: 'cve-2026-20182-cisco-catalyst-sd-wan-con',
  type: 'cve',
  title: 'CVE-2026-20182 — Cisco Catalyst SD-WAN Auth Bypass',
  excerpt: 'CVE-2026-20182 is an auth bypass...',
  publishedAt: '2026-05-16T00:00:00.000Z',
  candidateId: 'cve-2026-20182',
  body: '# Summary\nCVE-2026-20182 affects Cisco Catalyst SD-WAN Manager...',
  hero: '<svg></svg>',
  iocs: [],
  tags: ['cve', 'cisco', 'sdwan'],
  sources: [{ url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-20182', title: 'NVD' }],
};

function mockAi(assert: (messages: any[]) => void) {
  return {
    run: async (_model: any, input: any) => {
      assert(input.messages);
      return { response: 'ok' };
    },
  } as any;
}

describe('LinkedIn prompt', () => {
  it('includes the post URL in user prompt', async () => {
    const { generateLinkedinContent } = await import('../../../src/case-study/generation/social');
    await generateLinkedinContent(
      mockPost,
      mockAi((msgs) => {
        const user = msgs.find((m: any) => m.role === 'user')?.content ?? '';
        expect(user).toContain('pranithjain.qzz.io/blog/cve-2026-20182-cisco-catalyst-sd-wan-con');
      }),
      new Date()
    );
  });

  it('uses a PAS hook and engagement bait, long-form', async () => {
    const { generateLinkedinContent } = await import('../../../src/case-study/generation/social');
    await generateLinkedinContent(
      mockPost,
      mockAi((msgs) => {
        const user = msgs.find((m: any) => m.role === 'user')?.content ?? '';
        expect(user).toContain('PAS');
        expect(user).toContain('engagement bait');
        expect(user).toContain('1400-1800 characters');
        expect(user).toContain('CTA');
      }),
      new Date()
    );
  });

  it('bans hashtags and emojis', async () => {
    const { generateLinkedinContent } = await import('../../../src/case-study/generation/social');
    await generateLinkedinContent(
      mockPost,
      mockAi((msgs) => {
        const user = msgs.find((m: any) => m.role === 'user')?.content ?? '';
        expect(user).toContain('No hashtags');
        expect(user).toContain('No emojis');
      }),
      new Date()
    );
  });
});

describe('Twitter prompt', () => {
  it('is a 5-7 tweet thread with PAS hook and CTA bait', async () => {
    const { generateTwitterContent } = await import('../../../src/case-study/generation/social');
    await generateTwitterContent(
      mockPost,
      mockAi((msgs) => {
        const user = msgs.find((m: any) => m.role === 'user')?.content ?? '';
        expect(user).toContain('X/TWITTER THREADS (5-7 tweets)');
        expect(user).toContain('Hook that stops the scroll (use PAS)');
        expect(user).toContain('CTA with engagement bait');
        expect(user).toContain('1/7');
      }),
      new Date()
    );
  });

  it('includes the post URL and the 280-char rule', async () => {
    const { generateTwitterContent } = await import('../../../src/case-study/generation/social');
    await generateTwitterContent(
      mockPost,
      mockAi((msgs) => {
        const user = msgs.find((m: any) => m.role === 'user')?.content ?? '';
        expect(user).toContain('pranithjain.qzz.io/blog/cve-2026-20182-cisco-catalyst-sd-wan-con');
        expect(user).toContain('<280 characters');
      }),
      new Date()
    );
  });
});

describe('system prompt', () => {
  it('embeds the copywriting rules + engagement bait + quality checks', async () => {
    const { generateLinkedinContent } = await import('../../../src/case-study/generation/social');
    await generateLinkedinContent(
      mockPost,
      mockAi((msgs) => {
        const sys = msgs.find((m: any) => m.role === 'system')?.content ?? '';
        expect(sys).toContain('#COPYWRITING RULES');
        expect(sys).toContain('#ENGAGEMENT BAIT STRATEGIES');
        expect(sys).toContain('#QUALITY CHECKS');
        // Pipeline guardrail: only the final piece, no Verbalized-Sampling meta
        expect(sys).toContain('#PIPELINE OUTPUT (STRICT)');
        expect(sys).toMatch(/game-changer/);
      }),
      new Date()
    );
  });
});

describe('generateSocialContent', () => {
  it('produces both twitter and linkedin', async () => {
    const { generateSocialContent } = await import('../../../src/case-study/generation/social');
    const ai = { run: async (_model: any, _input: any) => ({ response: 'content' }) } as any;
    const res = await generateSocialContent(mockPost, ai, new Date());
    expect(res.slug).toBe(mockPost.slug);
    expect(res.twitter).toBe('content');
    expect(res.linkedin).toBe('content');
    expect(res.generatedAt).toBeTruthy();
  });
});
