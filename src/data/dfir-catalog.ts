/**
 * Backward-compatible shim that re-exports the modern registry.
 *
 * Mirrors `data/threatintel-catalog.ts`. The canonical source of truth for
 * every routable page in the DFIR / security toolkit area is
 * `dfir-hubs.ts`; this file simply re-exports the registry and provides
 * search helpers built on top of it.
 */

import {
  HUB_META,
  flattenPages,
  getAllPages,
  getHub,
  getPageByPath,
  type HubMeta,
  type HubPage,
} from './dfir-hubs';

export type { HubMeta, HubPage };

export type CatalogEntry = HubPage;
export type CatalogCategory = HubMeta;
export type CatalogBadge = 'live' | 'new' | 'alias' | 'beta' | 'static';

export const CATALOG: HubMeta[] = [...HUB_META];

export function flattenCatalog(categories: HubMeta[] = CATALOG): Array<HubPage & { category: HubMeta }> {
  return categories.flatMap((c) => c.pages.map((e) => ({ ...e, category: c })));
}

export { flattenPages, getAllPages, getHub, getPageByPath };

export function catalogSearch(
  query: string,
  categories: HubMeta[] = CATALOG
): Array<HubPage & { category: HubMeta; score: number }> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const all = flattenCatalog(categories);
  return all
    .map((e) => {
      const haystack = [e.label, e.desc, e.path, e.category.label].join(' ').toLowerCase();
      const keywordHay = (e.keywords ?? []).join(' ').toLowerCase();
      const words = q.split(/\s+/);
      let score = 0;
      for (const w of words) {
        if (w && haystack.includes(w)) score += 1;
        if (w && keywordHay.includes(w)) score += 3;
      }
      if (haystack.includes(q)) score += 2;
      return { ...e, score };
    })
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score);
}
