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
        for (const m of text.matchAll(/to="(\/(?:threatintel|dfir)\/[^"?]+)(?:\?[^"]*)?"/g)) {
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
    expect(
      broken,
      `The following link targets have no <Route> or redirect in src/App.tsx and would 404: ${broken.join(', ')}`
    ).toEqual([]);
  });
});
