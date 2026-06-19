import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PAGES, searchPages, hasPageMatch, type PageGroup, type PageEntry } from '../pages-index';

/**
 * Extract every `path: '/...'` route literal from the App.tsx route table.
 * Used to confirm the pages index has an entry for every registered
 * subpage — missing entries are surfaced as failing tests with a clear
 * list of routes that need to be added.
 */
function extractAppRoutes(): string[] {
  const appPath = resolve(__dirname, '..', '..', 'App.tsx');
  const src = readFileSync(appPath, 'utf8');
  // Match `path: '/foo/bar'` declarations in the ROUTES table only.
  // REDIRECTS entries share the same `path:` key but also carry a
  // sibling `to:` — they're alias URLs, not real subpages, and
  // don't need a pages-index entry (their target already has one).
  const matches = src.matchAll(/path:\s*'([^']+)'/g);
  const out = new Set<string>();
  for (const m of matches) {
    const idx = m.index ?? 0;
    // Look ahead for a `to:` on the same object literal.
    const window = src.slice(idx, idx + 200);
    if (/,\s*to:\s*'/.test(window)) continue;
    out.add(m[1]);
  }
  return Array.from(out).sort();
}

describe('pages-index', () => {
  it('contains a healthy number of pages (>= 250)', () => {
    expect(PAGES.length).toBeGreaterThanOrEqual(250);
  });

  it('has at least one page per group', () => {
    const groups = new Set(PAGES.map((p) => p.group));
    for (const g of ['portfolio', 'dfir', 'threatintel', 'admin', 'blog', 'case-study'] as PageGroup[]) {
      expect(groups.has(g)).toBe(true);
    }
  });

  it('every page entry has non-empty label, description, sectionLabel, group, and path', () => {
    for (const p of PAGES) {
      expect(p.path.startsWith('/'), `path should start with /: ${p.path}`).toBe(true);
      expect(p.label.length, `label empty for ${p.path}`).toBeGreaterThan(0);
      expect(p.description.length, `description empty for ${p.path}`).toBeGreaterThan(0);
      expect(p.sectionLabel.length, `sectionLabel empty for ${p.path}`).toBeGreaterThan(0);
      expect(['portfolio', 'dfir', 'threatintel', 'admin', 'blog', 'case-study']).toContain(p.group);
    }
  });

  it('has unique paths (or shares a path with a different group — redirects are allowed)', () => {
    const seen = new Map<string, PageEntry[]>();
    for (const p of PAGES) {
      const list = seen.get(p.path) ?? [];
      list.push(p);
      seen.set(p.path, list);
    }
    // Multiple entries with the same path are allowed (e.g. an "alias"
    // entry pointing at a primary page). What we forbid is two entries
    // with the same path AND the same group — that would be a typo.
    for (const [path, list] of seen) {
      if (list.length <= 1) continue;
      const groups = new Set(list.map((p) => p.group));
      expect(groups.size, `duplicate path "${path}" within the same group`).toBe(list.length);
    }
  });

  it('covers every route registered in App.tsx (DFIR + threatintel + portfolio + admin + blog)', () => {
    const routes = extractAppRoutes();
    const registered = new Set(PAGES.map((p) => p.path));
    // Ignore top-level paths that aren't subpages of the apps we want to
    // search. Admin and /admin, /sponsor, /behind-the-reports, /copilot
    // should be present. Portfolio root paths we still want to match.
    const expected = routes.filter((r) => {
      // /difr is a misspelled redirect in App.tsx — skip.
      if (r === '/difr') return false;
      return true;
    });
    const missing = expected.filter((r) => !registered.has(r));
    // Filter out :param-only routes — they require a real slug to be
    // searchable, and the index can hold the parametrized form OR a
    // concrete example.
    const realMissing = missing.filter((r) => !r.includes(':'));
    if (realMissing.length > 0) {
      throw new Error(`pages-index is missing entries for these App.tsx routes:\n  - ${realMissing.join('\n  - ')}`);
    }
    // Parametrized routes (e.g. /threatintel/wiki/:slug) must also be
    // represented as a generic entry in the index so a query like
    // "wiki" surfaces the route. The page label is allowed to be
    // generic ("Wiki Article", "Briefing", etc.).
    const paramMissing = missing.filter((r) => r.includes(':'));
    for (const r of paramMissing) {
      expect(registered.has(r), `parametrized route "${r}" is missing from the index`).toBe(true);
    }
  });

  it('searchPages returns ranked matches for a real query', () => {
    const matches = searchPages('ransomware');
    expect(matches.length).toBeGreaterThan(0);
    // First match should mention ransomware in the label, path, or section.
    const first = matches[0];
    const haystack = (first.page.path + ' ' + first.page.label + ' ' + first.page.description).toLowerCase();
    expect(haystack).toContain('ransom');
  });

  it('searchPages returns matches for a DFIR page query (cve)', () => {
    const matches = searchPages('cve lookup');
    expect(matches.length).toBeGreaterThan(0);
    const hasCve = matches.some((m) => m.page.path === '/dfir/cve');
    expect(hasCve).toBe(true);
  });

  it('searchPages returns matches for the knowledge base query', () => {
    const matches = searchPages('wiki');
    expect(matches.length).toBeGreaterThan(0);
    const hasWiki = matches.some((m) => m.page.path.startsWith('/threatintel/wiki'));
    expect(hasWiki).toBe(true);
  });

  it('searchPages respects the group filter', () => {
    const dfirOnly = searchPages('lookup', { group: 'dfir' });
    expect(dfirOnly.length).toBeGreaterThan(0);
    for (const m of dfirOnly) expect(m.page.group).toBe('dfir');

    const tiOnly = searchPages('actor', { group: 'threatintel' });
    for (const m of tiOnly) expect(m.page.group).toBe('threatintel');
  });

  it('hasPageMatch is a fast yes/no shortcut', () => {
    expect(hasPageMatch('ransomware')).toBe(true);
    expect(hasPageMatch('somethingnonexistent_xyz_123')).toBe(false);
  });

  it('returns empty for an empty or whitespace query', () => {
    expect(searchPages('')).toEqual([]);
    expect(searchPages('   ')).toEqual([]);
  });

  it('finds pages by keyword even when the keyword is not in the label', () => {
    // "kql" is a keyword on /dfir/rule-converter
    const matches = searchPages('kql');
    expect(matches.length).toBeGreaterThan(0);
    const found = matches.some((m) => m.page.path === '/dfir/rule-converter');
    expect(found).toBe(true);
  });
});
