import { describe, it, expect, vi } from 'vitest';
import { generateSocialContent } from '../../../src/case-study/generation/social';
import type { Post } from '../../../src/case-study/types';

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
    // ai.run returns caption for the IG caption call and slides for the carousel call.
    const ai = { run: vi.fn(async () => ({ response: caption })) };
    // Force the carousel builder's AI call to yield slide JSON by routing on prompt content.
    ai.run = vi.fn(async (_model: string, opts: { messages: { content: string }[] }) => {
      const u = opts.messages.map((m) => m.content).join(' ');
      return { response: u.includes('Instagram carousel') ? slidesJson : caption };
    }) as never;

    const social = await generateSocialContent(post, ai as never, new Date('2026-05-19T15:05:00Z'));
    expect(typeof social.instagram).toBe('string');
    expect(social.instagram!.length).toBeGreaterThan(0);
    expect(social.instagram!.length).toBeLessThanOrEqual(2200);
    expect(social.carousel?.format).toBe('instagram');
    expect(social.carousel!.slides.length).toBeGreaterThanOrEqual(3);
  });
});
