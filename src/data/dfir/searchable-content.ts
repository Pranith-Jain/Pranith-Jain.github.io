/**
 * Searchable content registry for the Cmd+K palette.
 *
 * The palette mounts in App.tsx so its initial code is in the main bundle.
 * Catalog data files are large (wiki-articles alone is ~100KB gzip) so we
 * dynamic-import them on first palette open and cache the merged index.
 *
 * Tools (the existing 61 tile-level entries) ship synchronously via ToolGrid
 * because they're tiny and need to render instantly when Cmd+K opens. The
 * catalog content is merged in once `loadCatalogIndex()` resolves.
 */

export type SearchKind = 'tool' | 'wiki' | 'telegram' | 'secops' | 'cve' | 'actor' | 'threatintel';

export interface SearchEntry {
  kind: SearchKind;
  /** Display label shown as the result row title. */
  label: string;
  /** One-line context shown under the label. */
  desc: string;
  /** Where Enter / click navigates to. */
  path: string;
  /** Section / category hint shown alongside desc. */
  sectionLabel: string;
}

export const KIND_LABEL: Record<SearchKind, string> = {
  tool: 'Tool',
  wiki: 'Wiki',
  telegram: 'Telegram',
  secops: 'SecOps',
  cve: 'CVE Res.',
  actor: 'Actor',
  threatintel: 'Threat Intel',
};

/** Tailwind colour pill per kind for the result-row badge. */
export const KIND_PILL: Record<SearchKind, string> = {
  tool: 'border-brand-500/40 bg-brand-500/10 text-brand-700 dark:text-brand-300',
  wiki: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  telegram: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  secops: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  cve: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  actor: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  threatintel: 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300',
};

/**
 * Sort priority for kinds. Tools first because they're instant actions; wiki
 * second because they're likely the analyst's intent when searching by
 * concept; catalogs after because they're navigation aids.
 */
export const KIND_PRIORITY: Record<SearchKind, number> = {
  tool: 0,
  wiki: 1,
  actor: 2,
  threatintel: 3,
  telegram: 4,
  cve: 5,
  secops: 6,
};

let catalogCache: SearchEntry[] | null = null;
let catalogPromise: Promise<SearchEntry[]> | null = null;

/**
 * Lazy-load all catalog content (wiki + telegram + secops + cve + actors)
 * in a single round trip. Cached after first call. Safe to call
 * repeatedly; subsequent calls return the same resolved array.
 */
export function loadCatalogIndex(): Promise<SearchEntry[]> {
  if (catalogCache) return Promise.resolve(catalogCache);
  if (catalogPromise) return catalogPromise;
  catalogPromise = (async () => {
    const [wikiM, tgM, secopsM, cveM, actorM, tiM] = await Promise.all([
      import('./wiki-articles'),
      import('./telegram-watch-catalog'),
      import('./secops-catalog'),
      import('./cve-resources-catalog'),
      import('./threat-actors'),
      import('../pages-index'),
    ]);

    const out: SearchEntry[] = [];

    // Wiki articles. Body is excluded — too noisy for substring search and
    // already represented in the Wiki page's own search.
    for (const a of wikiM.wikiArticles) {
      out.push({
        kind: 'wiki',
        label: a.title,
        desc: a.description,
        path: `/threatintel/wiki/${a.slug}`,
        sectionLabel: a.category,
      });
    }

    // Telegram channels — link to /threatintel/telegram-watch with q= so the catalog
    // page filters down to the matched entry on arrival.
    for (const e of tgM.CATALOG) {
      out.push({
        kind: 'telegram',
        label: e.name,
        desc: e.description,
        path: `/threatintel/telegram-watch?q=${encodeURIComponent(e.name)}`,
        sectionLabel: tgM.CATEGORY_LABELS[e.categories[0]!] ?? 'Telegram',
      });
    }

    // SecOps tools — large set (~140), so the substring filter does the heavy
    // lifting. Catalog pre-filter is left to the page itself.
    for (const t of secopsM.TOOLS) {
      out.push({
        kind: 'secops',
        label: t.name,
        desc: t.description,
        path: `/threatintel/secops-tools?q=${encodeURIComponent(t.name)}`,
        sectionLabel: secopsM.CATEGORY_LABELS[t.categories[0]!] ?? 'SecOps',
      });
    }

    // CVE resources catalog.
    for (const r of cveM.RESOURCES) {
      out.push({
        kind: 'cve',
        label: r.name,
        desc: r.description,
        path: `/threatintel/cve-resources?q=${encodeURIComponent(r.name)}`,
        sectionLabel: cveM.CATEGORY_LABELS[r.categories[0]!] ?? 'CVE Resources',
      });
    }

    // Threat actors — direct deep link to the per-actor page.
    for (const a of actorM.threatActors) {
      const aliases = (a as unknown as { aliases?: string[] }).aliases ?? [];
      const desc = (a as unknown as { description?: string }).description ?? '';
      const aliasHint = aliases.length > 0 ? ` · aka ${aliases.slice(0, 3).join(', ')}` : '';
      out.push({
        kind: 'actor',
        label: a.name,
        desc: (desc ? desc.slice(0, 120) : 'Threat actor profile') + aliasHint,
        path: `/threatintel/actors/${a.slug}`,
        sectionLabel: 'Threat Actor',
      });
    }

    // Threat-intel pages from pages-index — high-value pages that analysts
    // search for by keyword (MCP Search, tools, feeds, dashboards, etc.)
    const TI_PRIORITY = new Set([
      '/threatintel/mcp-search',
      '/threatintel/tools/mcp',
      '/threatintel/copilot',
      '/threatintel/ai-report',
      '/threatintel/unified-search',
      '/threatintel/threat-feeds',
      '/threatintel/live-iocs',
      '/threatintel/ransomware-live',
      '/threatintel/cve-list',
      '/threatintel/external/external',
      '/threatintel/secops-tools',
      '/threatintel/osint-framework',
      '/threatintel/threat-landscape',
      '/threatintel/investigations',
      '/threatintel/watches',
      '/threatintel/misp-browser',
      '/threatintel/yara',
      '/threatintel/stix-bundles',
      '/threatintel/feed-catalog',
      '/threatintel/darkweb-tools',
      '/threatintel/breach',
      '/threatintel/telegram',
      '/threatintel/onion-watch',
      '/threatintel/infostealer',
      '/threatintel/c2-tracker',
      '/threatintel/entity-resolution',
      '/threatintel/relationship-graph',
      '/threatintel/cross-correlate',
    ]);
    for (const p of tiM.PAGES) {
      if (!TI_PRIORITY.has(p.path)) continue;
      out.push({
        kind: 'threatintel',
        label: p.label,
        desc: p.description,
        path: p.path,
        sectionLabel: p.sectionLabel ?? 'Threat Intel',
      });
    }

    catalogCache = out;
    return out;
  })();
  return catalogPromise;
}
