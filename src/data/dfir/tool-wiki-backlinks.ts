/**
 * Tool ↔ wiki cross-reference map (the inverse of tool-topics.ts).
 *
 * tool-topics.ts maps wiki prose terms → tool URLs (forward direction:
 * the wiki auto-links into tools). This module derives the OPPOSITE
 * mapping: given a tool path, find every wiki article that mentions any
 * term that resolves back to this tool.
 *
 * Computed once at module load — TOOL_TOPICS is small (~30 entries) and
 * wikiArticles is small (~60 entries), so this is sub-millisecond on
 * every page load. No reason to defer.
 */

import { TOOL_TOPICS } from './tool-topics';
import { wikiArticles } from './wiki-articles';

export interface RelatedWikiArticle {
  slug: string;
  title: string;
  /** The terms in this article that resolve back to the tool. */
  matchedTerms: string[];
}

/**
 * Backlink map keyed by tool path (e.g. '/dfir/domain'). Values are
 * sorted by match count descending so the most-relevant articles
 * appear first.
 */
export const TOOL_WIKI_BACKLINKS: Map<string, RelatedWikiArticle[]> = (() => {
  const map = new Map<string, Map<string, { title: string; terms: Set<string> }>>();

  for (const article of wikiArticles) {
    // Strip code fences + inline code so we don't match terms inside
    // example commands. (Same skip rule as the wiki auto-link injector.)
    const body = article.body.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' ');

    for (const topic of TOOL_TOPICS) {
      const escaped = topic.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`\\b${escaped}\\b`, 'i');
      if (!re.test(body) && !re.test(article.title) && !re.test(article.description)) continue;

      const href = topic.href.split('?')[0]!; // ignore prefill query params
      const inner = map.get(href) ?? new Map();
      const entry = inner.get(article.slug) ?? { title: article.title, terms: new Set<string>() };
      entry.terms.add(topic.term);
      inner.set(article.slug, entry);
      map.set(href, inner);
    }
  }

  const out = new Map<string, RelatedWikiArticle[]>();
  for (const [href, inner] of map.entries()) {
    const list: RelatedWikiArticle[] = [...inner.entries()]
      .map(([slug, entry]) => ({ slug, title: entry.title, matchedTerms: [...entry.terms].sort() }))
      .sort((a, b) => b.matchedTerms.length - a.matchedTerms.length);
    out.set(href, list);
  }
  return out;
})();

/**
 * Return wiki articles that backlink to the given tool path.
 * Path matching ignores query strings — `/dfir/domain?d=foo.com` and
 * `/dfir/domain` map to the same backlinks.
 */
export function getRelatedWiki(path: string): RelatedWikiArticle[] {
  const cleaned = path.split('?')[0]!;
  return TOOL_WIKI_BACKLINKS.get(cleaned) ?? [];
}
