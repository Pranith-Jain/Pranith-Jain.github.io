import { describe, it, expect } from 'vitest';
import type { Post } from '../../../src/case-study/types';

const mockPost: Post = {
  slug: 'cve-2026-20182-cisco-catalyst-sd-wan-con',
  type: 'cve',
  title: 'CVE-2026-20182 Cisco Catalyst SD-WAN Auth Bypass',
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

  it('encodes the LinkedIn fold + mobile-first whitespace + scannable list contract', async () => {
    const { generateLinkedinContent } = await import('../../../src/case-study/generation/social');
    await generateLinkedinContent(
      mockPost,
      mockAi((msgs) => {
        const user = msgs.find((m: any) => m.role === 'user')?.content ?? '';
        expect(user).toContain('THE FOLD');
        expect(user).toContain('210 characters');
        expect(user).toMatch(/mobile-first/i);
        expect(user).toContain('No raw URLs in the body');
        expect(user).toContain('1300-2000 characters');
        expect(user).toMatch(/scannable .* bulleted list/);
        expect(user).toMatch(/at most two lowercase hashtags/i);
      }),
      new Date()
    );
  });
});

describe('Twitter prompt', () => {
  it('encodes the standalone-hook, no-pad, end-counter thread contract', async () => {
    const { generateTwitterContent } = await import('../../../src/case-study/generation/social');
    await generateTwitterContent(
      mockPost,
      mockAi((msgs) => {
        const user = msgs.find((m: any) => m.role === 'user')?.content ?? '';
        expect(user).toContain('2-5 posts');
        expect(user).toContain('must stand alone');
        expect(user).toMatch(/does NOT start with "1\/"/);
        expect(user).toContain('< 270 chars');
        expect(user).not.toContain('3-6 tweets');
        expect(user).not.toContain('5-7 tweets');
      }),
      new Date()
    );
  });

  it('includes the post URL and bans hashtags', async () => {
    const { generateTwitterContent } = await import('../../../src/case-study/generation/social');
    await generateTwitterContent(
      mockPost,
      mockAi((msgs) => {
        const user = msgs.find((m: any) => m.role === 'user')?.content ?? '';
        expect(user).toContain('pranithjain.qzz.io/blog/cve-2026-20182-cisco-catalyst-sd-wan-con');
        expect(user).toContain('No hashtags');
      }),
      new Date()
    );
  });
});

describe('system prompt', () => {
  it('embeds the shared analyze-then-construct ruleset', async () => {
    const { generateLinkedinContent } = await import('../../../src/case-study/generation/social');
    await generateLinkedinContent(
      mockPost,
      mockAi((msgs) => {
        const sys = msgs.find((m: any) => m.role === 'system')?.content ?? '';
        expect(sys).toContain('#COPYWRITING RULES');
        expect(sys).toContain('Analyze, then construct. Never template.');
        expect(sys).toContain('Hook construction');
        expect(sys).toContain('#PIPELINE OUTPUT (STRICT)');
        expect(sys).toContain("Here's the thing");
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
