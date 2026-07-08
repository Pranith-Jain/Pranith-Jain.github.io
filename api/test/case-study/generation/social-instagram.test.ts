import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Post } from '../../../src/case-study/types';

vi.mock('../../../src/case-study/generation/ai-client', async () => {
  const actual = await vi.importActual('../../../src/case-study/generation/ai-client');
  return {
    ...(actual as Record<string, unknown>),
    runCompletion: vi.fn(),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

const post = {
  slug: 'cve-2026-1234-fortigate',
  type: 'cve',
  title: 'CVE-2026-1234 — FortiGate Auth Bypass',
  excerpt: 'An unauthenticated bypass on the FortiGate management plane.',
  body: '## Summary\n\nUnauthenticated bypass.\n\n## References\n\n- [NVD](https://nvd.nist.gov/vuln/detail/CVE-2026-1234)',
} as unknown as Post;

describe('generateSocialContent — instagram', () => {
  it('produces an instagram caption and a carousel with >= 3 slides', async () => {
    const caption = 'Unauthenticated FortiGate bypass — what defenders need to know.\n\n#FortiGate #infosec #DFIR';
    const slidesJson = JSON.stringify([
      { headline: 'FortiGate is wide open' },
      { headline: 'What broke', body: 'Auth check is skippable.' },
      { headline: 'Patch now' },
    ]);

    const { runCompletion } = await import('../../../src/case-study/generation/ai-client');
    (runCompletion as any).mockImplementation(async (_ai: unknown, opts: { user: string }) => {
      const text = opts.user.includes('Instagram carousel') ? slidesJson : caption;
      return { text, modelUsed: 'mock' };
    });

    const { generateSocialContent } = await import('../../../src/case-study/generation/social');
    const social = await generateSocialContent(post, {} as never, new Date('2026-05-19T15:05:00Z'));
    expect(typeof social.instagram).toBe('string');
    expect(social.instagram!.length).toBeGreaterThan(0);
    expect(social.instagram!.length).toBeLessThanOrEqual(2200);
    expect(social.carousel?.format).toBe('instagram');
    expect(social.carousel!.slides.length).toBeGreaterThanOrEqual(3);
  });
});
