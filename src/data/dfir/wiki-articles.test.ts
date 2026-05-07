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
  it('all have category from the 5 known buckets', () => {
    const ok = ['Email Security', 'Threat Intelligence', 'Forensics', 'Detection Engineering', 'Attack Types'];
    for (const a of wikiArticles) expect(ok).toContain(a.category);
  });
  it('has at least one article in each category', () => {
    const cats = new Set(wikiArticles.map((a) => a.category));
    expect(cats.size).toBe(5);
  });
});
