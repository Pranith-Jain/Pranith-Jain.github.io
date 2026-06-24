import { describe, it, expect } from 'vitest';
import { deterministicSlides, parseSlidesJson } from '../../../src/case-study/social/carousel-build';
import type { Post } from '../../../src/case-study/types';

const post = {
  slug: 'cve-2026-1234-fortigate',
  type: 'cve',
  title: 'CVE-2026-1234 — FortiGate Auth Bypass',
  excerpt: 'An unauthenticated bypass on the FortiGate management plane.',
  body: [
    'Intro paragraph that hooks the reader with the stakes.',
    '## Summary',
    'The bypass lets an attacker reach the admin plane unauthenticated.',
    '## Affected products',
    'FortiGate builds before 7.4.5.',
    '## Detection & mitigation',
    'Patch to 7.4.5 and remove the management interface from the internet.',
    '## References',
    '- [NVD](https://nvd.nist.gov/vuln/detail/CVE-2026-1234)',
  ].join('\n\n'),
} as unknown as Post;

describe('deterministicSlides', () => {
  it('produces a bounded carousel (hook + sections + cta) from a post', () => {
    const slides = deterministicSlides(post);
    expect(slides.length).toBeGreaterThanOrEqual(3);
    expect(slides.length).toBeLessThanOrEqual(8);
    expect(slides[0]!.kind).toBe('hook');
    expect(slides[slides.length - 1]!.kind).toBe('cta');
    expect(slides[0]!.headline.length).toBeGreaterThan(0);
  });
});

describe('parseSlidesJson', () => {
  it('parses a fenced JSON array of slides', () => {
    const out = parseSlidesJson('```json\n[{"headline":"H","body":"B"}]\n```');
    expect(out).not.toBeNull();
    expect(out![0]!.headline).toBe('H');
  });
  it('returns null on malformed output', () => {
    expect(parseSlidesJson('not json at all')).toBeNull();
  });
});
