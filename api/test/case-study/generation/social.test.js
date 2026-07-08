import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/case-study/generation/ai-client', async () => {
  const actual = await vi.importActual('../../../src/case-study/generation/ai-client');
  return {
    ...actual,
    runCompletion: vi.fn(),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

const mockPost = {
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

describe('LinkedIn prompt', () => {
  it('includes the post URL in user prompt', async () => {
    const { runCompletion } = await import('../../../src/case-study/generation/ai-client');
    runCompletion.mockImplementation(async (_ai, opts) => {
      expect(opts.user).toContain('pranithjain.qzz.io/blog/cve-2026-20182-cisco-catalyst-sd-wan-con');
      return { text: 'ok', modelUsed: 'mock' };
    });
    const { generateLinkedinContent } = await import('../../../src/case-study/generation/social');
    await generateLinkedinContent(mockPost, {}, new Date());
  });

  it('encodes the 2026 LinkedIn contract: link-in-first-comment, 3-5 hashtags, carousel option', async () => {
    const { runCompletion } = await import('../../../src/case-study/generation/ai-client');
    runCompletion.mockImplementation(async (_ai, opts) => {
      expect(opts.user).toContain('THE FOLD');
      expect(opts.user).toContain('210 characters');
      expect(opts.user).toMatch(/mobile-first/i);
      expect(opts.user).toContain('FIRST COMMENT:');
      expect(opts.user).toMatch(/body must contain NO link/i);
      expect(opts.user).toContain('1300-2000 characters');
      expect(opts.user).toMatch(/scannable .* bulleted list/);
      expect(opts.user).toMatch(/0-3 specific, on-topic hashtags/i);
      expect(opts.user).toContain('CAROUSEL OUTLINE:');
      expect(opts.user).not.toMatch(/at most two lowercase hashtags/i);
      return { text: 'ok', modelUsed: 'mock' };
    });
    const { generateLinkedinContent } = await import('../../../src/case-study/generation/social');
    await generateLinkedinContent(mockPost, {}, new Date());
  });
});

describe('Twitter prompt', () => {
  it('encodes the 2026 thread contract: 5-8 posts, link-in-reply, bookmark+reply optimization', async () => {
    const { runCompletion } = await import('../../../src/case-study/generation/ai-client');
    runCompletion.mockImplementation(async (_ai, opts) => {
      expect(opts.user).toContain('6 tweets exactly');
      expect(opts.user).toMatch(/It does NOT start with "1\/"/);
      expect(opts.user).toContain('FIRST REPLY:');
      expect(opts.user).toMatch(/bookmark/i);
      expect(opts.user).toMatch(/repl(y|ies)/i);
      expect(opts.user).toContain('< 280 chars');
      expect(opts.user).not.toContain('2-5 posts');
      return { text: 'ok', modelUsed: 'mock' };
    });
    const { generateTwitterContent } = await import('../../../src/case-study/generation/social');
    await generateTwitterContent(mockPost, {}, new Date());
  });

  it('includes the post URL and allows at most one hashtag', async () => {
    const { runCompletion } = await import('../../../src/case-study/generation/ai-client');
    runCompletion.mockImplementation(async (_ai, opts) => {
      expect(opts.user).toContain('pranithjain.qzz.io/blog/cve-2026-20182-cisco-catalyst-sd-wan-con');
      expect(opts.user).toMatch(/at most ONE hashtag/i);
      expect(opts.user).not.toContain('No hashtags');
      return { text: 'ok', modelUsed: 'mock' };
    });
    const { generateTwitterContent } = await import('../../../src/case-study/generation/social');
    await generateTwitterContent(mockPost, {}, new Date());
  });
});

describe('system prompt', () => {
  it('embeds the shared analyze-then-construct ruleset', async () => {
    const { runCompletion } = await import('../../../src/case-study/generation/ai-client');
    runCompletion.mockImplementation(async (_ai, opts) => {
      expect(opts.system).toContain('#COPYWRITING RULES');
      expect(opts.system).toContain('Analyze, then construct. Never template.');
      expect(opts.system).toContain('Hook construction');
      expect(opts.system).toContain('#PIPELINE OUTPUT (STRICT)');
      expect(opts.system).toContain("Here's the thing");
      expect(opts.system).toMatch(/game-changer/);
      return { text: 'ok', modelUsed: 'mock' };
    });
    const { generateLinkedinContent } = await import('../../../src/case-study/generation/social');
    await generateLinkedinContent(mockPost, {}, new Date());
  });
});

describe('generateSocialContent', () => {
  it('produces both twitter and linkedin', async () => {
    const { runCompletion } = await import('../../../src/case-study/generation/ai-client');
    runCompletion.mockResolvedValue({ text: 'content', modelUsed: 'mock' });
    const { generateSocialContent } = await import('../../../src/case-study/generation/social');
    const res = await generateSocialContent(mockPost, {}, new Date());
    expect(res.slug).toBe(mockPost.slug);
    expect(res.twitter).toBe('content');
    expect(res.linkedin).toBe('content');
    expect(res.generatedAt).toBeTruthy();
  });
});

describe('whitespace tidy', () => {
  it('collapses 3+ blank lines to one and strips trailing spaces', async () => {
    const { runCompletion } = await import('../../../src/case-study/generation/ai-client');
    runCompletion.mockResolvedValue({ text: 'Hook line.   \n\n\n\nSecond para.\n\n\n- bullet  ', modelUsed: 'mock' });
    const { generateLinkedinContent } = await import('../../../src/case-study/generation/social');
    const res = await generateLinkedinContent(mockPost, {}, new Date());
    expect(res.linkedin).not.toMatch(/\n{3,}/);
    expect(res.linkedin).not.toMatch(/[ \t]\n/);
    expect(res.linkedin).not.toMatch(/[ \t]$/);
    expect(res.linkedin).toContain('Hook line.\nSecond para.');
    expect(res.linkedin).toContain('\n\n- bullet');
  });
});

describe('LinkedIn sparse-merge tidy', () => {
  it('joins consecutive short single-line paragraphs with soft returns and keeps blank lines before lists / hashtags / special blocks', async () => {
    const { runCompletion } = await import('../../../src/case-study/generation/ai-client');
    runCompletion.mockResolvedValue({
      text: [
        'First short line.',
        '',
        'Second short line.',
        '',
        'Third short line.',
        '',
        '- bullet 1',
        '- bullet 2',
        '',
        '#DFIR #ThreatIntel',
        '',
        'FIRST COMMENT: https://pranithjain.qzz.io/blog/x',
      ].join('\n'),
      modelUsed: 'mock',
    });
    const { generateLinkedinContent } = await import('../../../src/case-study/generation/social');
    const res = await generateLinkedinContent(mockPost, {}, new Date());
    expect(res.linkedin).toContain('First short line.\nSecond short line.\nThird short line.');
    expect(res.linkedin).not.toContain('First short line.\n\nSecond short line.');
    expect(res.linkedin).toContain('\n\n- bullet 1');
    expect(res.linkedin).toContain('\n\n#DFIR #ThreatIntel');
    expect(res.linkedin).toContain('\n\nFIRST COMMENT:');
  });

  it('keeps a long single-line paragraph as its own block (not merged with neighbors)', async () => {
    const { runCompletion } = await import('../../../src/case-study/generation/ai-client');
    const long = 'x'.repeat(200);
    runCompletion.mockResolvedValue({
      text: `Short one.\n\n${long}\n\nShort two.`,
      modelUsed: 'mock',
    });
    const { generateLinkedinContent } = await import('../../../src/case-study/generation/social');
    const res = await generateLinkedinContent(mockPost, {}, new Date());
    expect(res.linkedin).toContain(`Short one.\n\n${long}\n\nShort two.`);
  });
});
