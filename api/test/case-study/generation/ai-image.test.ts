import { describe, it, expect, vi } from 'vitest';
import {
  buildHeroImagePrompt,
  buildBodyImagePrompt,
  generateAiImage,
  injectBodyImage,
} from '../../../src/case-study/generation/ai-image';
import type { Ai } from '@cloudflare/workers-types';

describe('image prompt builders', () => {
  it('builds an on-brand hero prompt that forbids text + people', () => {
    const p = buildHeroImagePrompt({ title: 'FortiGate Auth Bypass', type: 'cve' });
    expect(p).toMatch(/no text/i);
    expect(p).toMatch(/no (human )?faces|no people/i);
    // on-brand palette cue
    expect(p).toMatch(/indigo|blue/i);
  });

  it('varies the subject by content type', () => {
    const cve = buildHeroImagePrompt({ title: 'X', type: 'cve' });
    const ransom = buildHeroImagePrompt({ title: 'X', type: 'ransom' });
    expect(cve).not.toBe(ransom);
  });

  it('builds a distinct in-body prompt', () => {
    const hero = buildHeroImagePrompt({ title: 'X', type: 'breach' });
    const body = buildBodyImagePrompt({ title: 'X', type: 'breach' });
    expect(body).not.toBe(hero);
    expect(body).toMatch(/no text/i);
  });
});

describe('injectBodyImage', () => {
  const body = ['## Summary', 'intro text', '## Details', 'more text', '## References', '- [x](https://x.test)'].join(
    '\n\n'
  );

  it('inserts the image before the second ## heading (mid-article)', () => {
    const out = injectBodyImage(body, '/api/v1/blog-image/s/body1', 'A Post');
    expect(out).toContain('![A Post — illustration](/api/v1/blog-image/s/body1)');
    // image appears after "## Summary" but before "## Details"
    expect(out.indexOf('blog-image')).toBeGreaterThan(out.indexOf('## Summary'));
    expect(out.indexOf('blog-image')).toBeLessThan(out.indexOf('## Details'));
  });

  it('sanitizes markdown-breaking characters in the alt text', () => {
    const out = injectBodyImage(body, '/img', 'A [tricky] (title)');
    expect(out).toContain('![A tricky title — illustration](/img)');
  });

  it('appends at the end when there are no headings', () => {
    const out = injectBodyImage('just a paragraph, no headings', '/img', 'T');
    expect(out.trimEnd().endsWith('![T — illustration](/img)')).toBe(true);
  });
});

/** Minimal base64 of a tiny payload to assert decode. */
const TINY_B64 = btoa('PNGDATA');

describe('generateAiImage', () => {
  it('decodes a Flux-style { image: base64 } response to bytes', async () => {
    const ai = { run: vi.fn(async () => ({ image: TINY_B64 })) } as unknown as Ai;
    const bytes = await generateAiImage(ai, 'a prompt');
    expect(bytes).not.toBeNull();
    expect(new TextDecoder().decode(bytes!)).toBe('PNGDATA');
  });

  it('accepts a raw Uint8Array response', async () => {
    const raw = new Uint8Array([1, 2, 3]);
    const ai = { run: vi.fn(async () => raw) } as unknown as Ai;
    const bytes = await generateAiImage(ai, 'p');
    expect(bytes).toEqual(raw);
  });

  it('returns null (never throws) when the model errors', async () => {
    const ai = {
      run: vi.fn(async () => {
        throw new Error('AI down');
      }),
    } as unknown as Ai;
    const bytes = await generateAiImage(ai, 'p');
    expect(bytes).toBeNull();
  });

  it('returns null on an unrecognized response shape', async () => {
    const ai = { run: vi.fn(async () => ({ nope: true })) } as unknown as Ai;
    const bytes = await generateAiImage(ai, 'p');
    expect(bytes).toBeNull();
  });
});
