/**
 * Backward-compatible shim that re-exports the modern registry.
 *
 * The original threatintel-catalog.ts had its own data. That data has been
 * consolidated into `threatintel-hubs.ts`, which is the canonical source of
 * truth for every routable page in the threat-intel area. This file now
 * simply re-exports the registry and provides search helpers built on top
 * of it.
 */

import {
  HUB_META,
  flattenPages,
  getAllPages,
  getHub,
  getPageByPath,
  type HubMeta,
  type HubPage,
} from './threatintel-hubs';

export type { HubMeta, HubPage };

/** @deprecated use HubPage from threatintel-hubs. */
export type CatalogEntry = HubPage;

/** @deprecated use HubMeta from threatintel-hubs. */
export type CatalogCategory = HubMeta;

/** @deprecated use HubPage.badge. */
export type CatalogBadge = 'live' | 'new' | 'alias' | 'beta' | 'static';

/* ------------------------------------------------------------------ */
/*  Catalog adapter                                                    */
/* ------------------------------------------------------------------ */

/**
 * The full catalog: every page in every hub.
 *
 * `CatalogCategory` here is identical to `HubMeta` — the old name is kept
 * to avoid breaking the Catalog page import.
 */
export const CATALOG: HubMeta[] = [...HUB_META];

/* ------------------------------------------------------------------ */
/*  Lookup helpers                                                     */
/* ------------------------------------------------------------------ */

/** @deprecated use getAllPages. */
export function flattenCatalog(categories: HubMeta[] = CATALOG): Array<HubPage & { category: HubMeta }> {
  return categories.flatMap((c) => c.pages.map((e) => ({ ...e, category: c })));
}

export { flattenPages, getAllPages, getHub, getPageByPath };

/**
 * Full-text search across the entire catalog.
 *
 * Matches against:
 *   - page label
 *   - page description
 *   - page path
 *   - hub label
 *   - explicit keywords (if any)
 *
 * Scoring:
 *   - each word match: +1
 *   - whole-query substring match: +2
 *
 * Results are sorted by score, descending.
 */
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
      const words = q.split(/\s+/);
      let score = 0;
      for (const w of words) {
        if (w && haystack.includes(w)) score += 1;
      }
      if (haystack.includes(q)) score += 2;
      return { ...e, score };
    })
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score);
}
