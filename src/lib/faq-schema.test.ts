import { describe, it, expect } from 'vitest';
import { extractFaq } from './faq-schema';

describe('extractFaq', () => {
  const md = [
    '## TL;DR',
    'Something happened.',
    '',
    '## FAQ',
    '',
    '### What is affected?',
    'Acme Gateway 1.0 through 2.3 are affected by the pre-auth flaw.',
    '',
    '### How do you detect it?',
    'Hunt for POST requests to /admin/create with an empty auth header.',
    '',
    '## References',
    '- [NVD](https://nvd.nist.gov) — record',
  ].join('\n');

  it('parses each ### question + answer in the FAQ section', () => {
    const faq = extractFaq(md);
    expect(faq).toHaveLength(2);
    expect(faq[0]).toEqual({
      question: 'What is affected?',
      answer: 'Acme Gateway 1.0 through 2.3 are affected by the pre-auth flaw.',
    });
    expect(faq[1]!.question).toBe('How do you detect it?');
  });

  it('stops at the next ## section (does not bleed into References)', () => {
    const faq = extractFaq(md);
    expect(faq.every((f) => !f.answer.includes('NVD'))).toBe(true);
  });

  it('returns [] when there is no FAQ section', () => {
    expect(extractFaq('## Summary\nNo faq here.\n## References\n- x')).toEqual([]);
  });

  it('returns [] for a FAQ heading with no ### questions', () => {
    expect(extractFaq('## FAQ\njust prose, no questions\n## References')).toEqual([]);
  });
});
