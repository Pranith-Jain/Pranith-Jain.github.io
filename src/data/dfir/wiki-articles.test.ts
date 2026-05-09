import { describe, it, expect } from 'vitest';
import { wikiArticles } from './wiki-articles';

describe('wikiArticles', () => {
  it('has at least 25 articles', () => {
    expect(wikiArticles.length).toBeGreaterThanOrEqual(25);
  });
  it('all have unique slugs', () => {
    const slugs = wikiArticles.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
  it('all have category from the known buckets', () => {
    const ok = [
      'Email Security',
      'Threat Intelligence',
      'Forensics',
      'Detection Engineering',
      'Attack Types',
      'AI Security',
      'Identity & NHI',
      'Compliance & Frameworks',
      'Data Security & Privacy',
    ];
    for (const a of wikiArticles) expect(ok).toContain(a.category);
  });
  it('has at least one article in each of the foundational five categories', () => {
    const cats = new Set(wikiArticles.map((a) => a.category));
    for (const c of ['Email Security', 'Threat Intelligence', 'Forensics', 'Detection Engineering', 'Attack Types']) {
      expect(cats.has(c as never)).toBe(true);
    }
  });
});
