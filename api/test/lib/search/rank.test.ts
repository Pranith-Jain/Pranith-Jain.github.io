import { describe, it, expect } from 'vitest';
import { scoreMatch, rankSections, escapeRe } from '../../../src/lib/search/rank';
import type { SearchSection } from '../../../src/routes/unified-search';

describe('scoreMatch', () => {
  it('ranks exact > prefix > word-boundary > substring-in-label > substring-in-desc', () => {
    expect(scoreMatch('lockbit', 'LockBit')).toBe(100); // exact (case-insensitive)
    expect(scoreMatch('lock', 'LockBit')).toBe(80); // prefix
    expect(scoreMatch('bit', 'Lock Bit')).toBe(60); // word-boundary in label
    expect(scoreMatch('ockb', 'LockBit')).toBe(45); // substring mid-word
    expect(scoreMatch('ransom', 'LockBit', 'a ransomware group')).toBe(25); // only in description
    expect(scoreMatch('zzz', 'LockBit', 'a ransomware group')).toBe(0); // no match
  });

  it('returns 0 for an empty needle', () => {
    expect(scoreMatch('', 'anything')).toBe(0);
    expect(scoreMatch('   ', 'anything')).toBe(0);
  });

  it('treats regex metacharacters in the needle as literals (IP / CVE / hash safe)', () => {
    expect(() => scoreMatch('1.2.3.4', '1.2.3.4')).not.toThrow();
    expect(scoreMatch('1.2.3.4', '1.2.3.4')).toBe(100);
    expect(scoreMatch('cve-2026-1', 'CVE-2026-1234')).toBe(80); // prefix, dashes literal
  });

  it('escapeRe escapes metacharacters', () => {
    expect(escapeRe('1.2.3.4')).toBe('1\\.2\\.3\\.4');
  });
});

const sec = (kind: string, total: number, items: Array<{ label: string; description?: string }>): SearchSection => ({
  label: kind,
  kind,
  total,
  items: items.map((i) => ({ ...i, source: kind })),
});

describe('rankSections', () => {
  it('orders sections by their best item, not by raw count', () => {
    const sections: SearchSection[] = [
      sec('writeups', 3, [{ label: 'A blog mentioning lockbit somewhere' }, { label: 'unrelated' }, { label: 'more' }]),
      sec('actors', 1, [{ label: 'LockBit' }]),
    ];
    const ranked = rankSections('lockbit', sections);
    // actors has 1 item but an EXACT match (100) → must outrank the 3-item writeups (60 word-boundary).
    expect(ranked[0]!.kind).toBe('actors');
    expect(ranked[0]!.items[0]!.score).toBe(100);
    expect(ranked[1]!.kind).toBe('writeups');
  });

  it('sorts items within a section by score descending', () => {
    const sections: SearchSection[] = [
      sec('cves', 2, [{ label: 'CVE-2026-9999 some desc' }, { label: 'CVE-2026-1234 exact-ish' }]),
    ];
    const ranked = rankSections('cve-2026-1234', sections);
    expect(ranked[0]!.items[0]!.label).toBe('CVE-2026-1234 exact-ish'); // prefix(80) beats no-match(0)
    expect(ranked[0]!.items[0]!.score).toBeGreaterThan(ranked[0]!.items[1]!.score ?? 0);
  });

  it('breaks section score ties by total (preserves count-sort behavior)', () => {
    const sections: SearchSection[] = [sec('x', 2, [{ label: 'foo' }]), sec('y', 5, [{ label: 'foo' }])];
    const ranked = rankSections('foo', sections);
    // Both top-score 100 (exact). Tie → higher total wins.
    expect(ranked[0]!.kind).toBe('y');
  });

  it('does not mutate the input sections', () => {
    const sections: SearchSection[] = [sec('a', 1, [{ label: 'foo' }])];
    const before = JSON.stringify(sections);
    rankSections('foo', sections);
    expect(JSON.stringify(sections)).toBe(before);
  });
});
