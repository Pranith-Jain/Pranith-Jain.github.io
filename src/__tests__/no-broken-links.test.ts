import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p: string): string => readFileSync(join(root, p), 'utf8');

/**
 * Every `to="/threatintel/*"` and `to="/dfir/*"` link in a `.tsx`
 * source file must resolve to either a registered App.tsx route or a
 * redirect target. If a link is a 404, the user lands on a blank
 * `NotFound` page — which is bad UX and is what this guard exists
 * to prevent.
 *
 * Pattern matching: routes with `:param` segments (e.g. /threatintel/wiki/:slug)
 * match any single non-slash path segment in the corresponding position.
 *
 * This test complements `route-drift.test.ts`, which guards the
 * prerender/Worker side. Together they cover the full link graph:
 *   1. Routes defined in App.tsx       (route-drift)
 *   2. Links in source files           (this test)
 *   3. HTML emitted by the prerender   (route-drift)
 */
function appRoutePatterns(): string[] {
  const src = read('src/App.tsx');
  const out: string[] = [];
  for (const m of src.matchAll(/\{\s*path:\s*'([^']+)',\s*Component:/g)) out.push(m[1]);
  for (const m of src.matchAll(/\{\s*path:\s*'([^']+)',\s*to:\s*'[^']+'/g)) out.push(m[1]);
  return out;
}

const PATTERNS = appRoutePatterns();

function patternMatches(path: string, pattern: string): boolean {
  if (!pattern.includes(':')) return path === pattern;
  const pp = pattern.split('/');
  const ap = path.split('/');
  if (pp.length !== ap.length) return false;
  for (let i = 0; i < pp.length; i++) {
    if (pp[i]!.startsWith(':')) continue;
    if (pp[i] !== ap[i]) return false;
  }
  return true;
}

function isRegisteredAppPath(path: string): boolean {
  return PATTERNS.some((p) => patternMatches(path, p));
}

/** Recursively collect all `to="/…"` link targets in src/.tsx files. */
function collectLinks(dir: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.tsx')) {
        const text = readFileSync(full, 'utf8');
        // Capture both React-Router `to="…"` (used by <Link>) and raw
        // `href="…"` (used by plain <a>). The previous version missed
        // three real broken links in plain <a> tags — the user landed
        // on a 404. We now scan both, with the same allowlist.
        for (const m of text.matchAll(
          /(?:to|href)="(\/(?:threatintel|dfir|blog|admin|portfolio)\/[^"?]+)(?:\?[^"]*)?"/g
        )) {
          const list = out.get(m[1]!) ?? [];
          list.push(full);
          out.set(m[1]!, list);
        }
      }
    }
  };
  walk(dir);
  return out;
}

describe('link-target drift guard', () => {
  it('every in-app threatintel/dfir Link to= resolves to an App.tsx route or redirect', () => {
    const links = collectLinks('src');
    const broken: string[] = [];
    for (const path of links.keys()) {
      if (!isRegisteredAppPath(path)) broken.push(path);
    }
    // Also list the source file:location for every broken link so the
    // failure message is actionable instead of just "X is broken".
    const lines: string[] = [];
    for (const [path, files] of links) {
      if (isRegisteredAppPath(path)) continue;
      for (const f of files) {
        const text = readFileSync(f, 'utf8');
        const lines2 = text.split('\n');
        for (let i = 0; i < lines2.length; i++) {
          if (lines2[i]?.includes(`"${path}`) || lines2[i]?.includes(`'${path}`)) {
            lines.push(`  ${f.replace(root + '/', '')}:${i + 1}  →  ${path}`);
          }
        }
      }
    }
    expect(
      broken,
      `The following link targets have no <Route> or redirect in src/App.tsx and would 404:\n${lines.join('\n')}`
    ).toEqual([]);
  });
});
