/**
 * Pure relevance ranking for unified-search results. No I/O, no env.
 *
 * `scoreMatch` scores how well a needle matches a field (exact > prefix >
 * word-boundary > substring-in-label > substring-in-description). `rankSections`
 * orders items within each section by that score and orders sections by their
 * best item — replacing the old count-only `sections.sort((a,b) => b.total - a.total)`
 * in api/src/routes/unified-search.ts. Unit-tested with zero network.
 */

import type { SearchItem, SearchSection } from '../../routes/unified-search';

/** Escape regex metacharacters so an IP/hash/CVE needle is a literal in `\b<n>`. */
export function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Higher = more relevant. Deterministic.
 * @param needle    the (already-lowercased-or-not) query
 * @param primary   the item's headline text (label)
 * @param secondary the item's supporting text (description)
 */
export function scoreMatch(needle: string, primary: string, secondary = ''): number {
  const n = needle.toLowerCase().trim();
  if (!n) return 0;
  const p = primary.toLowerCase();
  if (p === n) return 100; // exact
  if (p.startsWith(n)) return 80; // prefix
  if (new RegExp(`\\b${escapeRe(n)}`).test(p)) return 60; // word-boundary in label
  if (p.includes(n)) return 45; // substring anywhere in label
  if (secondary.toLowerCase().includes(n)) return 25; // substring in description
  return 0;
}

/**
 * Rank items within each section by `scoreMatch(label, description)`, then order
 * sections by their top item's score. Score ties between sections fall back to
 * `total` (item count) — preserving the previous count-sort when scores are
 * equal. Returns new arrays; inputs are not mutated.
 */
export function rankSections(needle: string, sections: SearchSection[]): SearchSection[] {
  const scored = sections.map((s) => {
    const items: SearchItem[] = s.items
      .map((it): SearchItem => ({ ...it, score: scoreMatch(needle, it.label, it.description ?? '') }))
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const first = items[0];
    const top = first ? (first.score ?? 0) : 0;
    return { section: { ...s, items }, top };
  });
  scored.sort((a, b) => b.top - a.top || b.section.total - a.section.total);
  return scored.map((x) => x.section);
}
