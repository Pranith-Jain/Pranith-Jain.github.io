import { describe, it, expect } from 'vitest';
import { splitSocial } from './social-parts';

describe('splitSocial', () => {
  it('pulls a LinkedIn FIRST COMMENT block and carousel out of the body', () => {
    const text = [
      'Hook line that matters.',
      '',
      'Some analysis here.',
      '',
      '#DFIR #ThreatIntel',
      '',
      'FIRST COMMENT: https://pranithjain.qzz.io/blog/x',
      '',
      'CAROUSEL OUTLINE:',
      '- Slide 1: the hook',
      '- Slide 2: the mechanism',
    ].join('\n');
    const p = splitSocial(text);
    expect(p.body).toContain('Hook line that matters.');
    expect(p.body).not.toContain('FIRST COMMENT');
    expect(p.body).not.toContain('CAROUSEL OUTLINE');
    expect(p.link).toEqual({ label: 'First comment', value: 'https://pranithjain.qzz.io/blog/x' });
    expect(p.carousel).toContain('Slide 1: the hook');
  });

  it('pulls a Twitter FIRST REPLY link', () => {
    const text = 'Post one. (1/3)\n\nPost two. (2/3)\n\nFIRST REPLY: https://pranithjain.qzz.io/blog/y';
    const p = splitSocial(text);
    expect(p.link).toEqual({ label: 'First reply', value: 'https://pranithjain.qzz.io/blog/y' });
    expect(p.body).not.toContain('FIRST REPLY');
    expect(p.body).toContain('Post two. (2/3)');
    expect(p.carousel).toBeUndefined();
  });

  it('returns the text unchanged when there are no blocks', () => {
    const p = splitSocial('Just a plain post.');
    expect(p).toEqual({ body: 'Just a plain post.', link: undefined, carousel: undefined });
  });
});
