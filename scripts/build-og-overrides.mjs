#!/usr/bin/env node
/**
 * Generate `worker/og-overrides.generated.json` — a per-route OG title +
 * description map derived from the page components themselves.
 *
 * WHY THIS EXISTS
 * ───────────────
 * The SPA serves the same `index.html` for every path; `worker/og-rewriter.ts`
 * rewrites the OG/Twitter/canonical tags per route so social/SEO crawlers see
 * route-specific metadata. The hand-tuned `OG_OVERRIDES` map covers ~18 high-
 * value routes; the remaining ~400 routes fall through to `deriveOgFromPath`,
 * which synthesizes a *mechanical* title/description from the URL slug.
 *
 * That mechanical fallback is unique per route (so Google doesn't flag
 * duplicate content) but generic. Every page component already declares a
 * rich, human-authored `title` + `description` via `DataPageLayout` /
 * `PageMeta` props. This script statically extracts those props and emits
 * them as a JSON map the worker merges in (lower priority than hand-tuned
 * `OG_OVERRIDES`, higher priority than the slug-derived fallback).
 *
 * The map is regenerated on every `prebuild`, so it can never drift from the
 * components — when a page's description changes in its TSX, the next deploy
 * picks it up automatically.
 *
 * EXTRACTION STRATEGY
 * ───────────────────
 * 1. Parse `src/App.tsx`'s ROUTES array + the `lazy(() => import('./pages/X'))`
 *    bindings to build a route → component-file map. Skip dynamic `:slug`
 *    routes (their meta is resolved at runtime by `resolveOg`).
 * 2. For each component file, find the first `<DataPageLayout` or `<PageMeta`
 *    JSX element and extract its `title=` / `description=` props. Accept:
 *      - string literals:  title="IOC Investigator"
 *      - template literals: description={`Scan ${N} patterns...`}
 *    Skip expression props (title={selected.title}) — those are dynamic.
 * 3. Fall back to the first `<h1>` text content when no title prop is found.
 * 4. Skip routes already present in the hand-tuned `OG_OVERRIDES` map.
 *
 * Run via `prebuild` (see package.json). Also runnable standalone:
 *   node scripts/build-og-overrides.mjs
 */
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC_DIR = resolve(ROOT, 'src');

// ── 1. Parse App.tsx: route → component name → component file ───────────────

function parseAppRoutes() {
  const appSrc = readFileSync(resolve(SRC_DIR, 'App.tsx'), 'utf8');

  // Map: componentName -> relative import path (e.g. './pages/dfir/IocInvestigate')
  const componentToFile = new Map();
  const eagerRe = /^import\s+(\w+)\s+from\s+'(\.\/pages[^']+)'/gm;
  const lazyRe = /const\s+(\w+)\s*=\s*lazy\(\(\)\s*=>\s*import\('(\.\/[^']+)'\)\)/gm;
  let m;
  while ((m = eagerRe.exec(appSrc)) !== null) {
    componentToFile.set(m[1], m[2]);
  }
  while ((m = lazyRe.exec(appSrc)) !== null) {
    componentToFile.set(m[1], m[2]);
  }

  // Map: route path -> component file (relative to src/). Skip dynamic :slug routes.
  const routeToFile = new Map();
  const routeRe = /\{\s*path:\s*'([^']+)'\s*,\s*Component:\s*(\w+)/g;
  while ((m = routeRe.exec(appSrc)) !== null) {
    const path = m[1];
    const component = m[2];
    if (path.includes(':')) continue; // dynamic route — meta resolved at runtime
    const file = componentToFile.get(component);
    if (!file) continue;
    routeToFile.set(path, file);
  }
  return routeToFile;
}

// ── 2. Extract title/description from a component file ─────────────────────

/** Decode JS string-literal escapes (\n, \", \\, etc.) into display text. */
function decodeStringLiteral(s) {
  return s
    .replace(/\\n/g, ' ')
    .replace(/\\t/g, ' ')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, '\\');
}

/** Evaluate a template literal body (the part inside `...`) to a plain string.
 *  Strips ${...} expressions (they're dynamic; keep surrounding literal text). */
function evalTemplateLiteral(body) {
  const stripped = body.replace(/\$\{[^}]*\}/g, '');
  return decodeStringLiteral(stripped).replace(/\s+/g, ' ').trim();
}

function resolveComponentFile(imp) {
  const base = resolve(SRC_DIR, imp.replace(/^\.\//, ''));
  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const ext of ['.tsx', '.ts', '/index.tsx', '/index.ts']) {
    const candidate = base.endsWith(ext) ? base : base + ext;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Find the opening JSX tag for `tagName` in `src` starting at `fromIndex`,
 *  and return the full props block. Respects `{...}` brace nesting. */
function extractJsxOpeningTag(src, tagName, fromIndex = 0) {
  const startRe = new RegExp(`<(${tagName})\\b`, 'g');
  startRe.lastIndex = fromIndex;
  let m;
  while ((m = startRe.exec(src)) !== null) {
    const propsStart = m.index + m[0].length;
    let depth = 0;
    let i = propsStart;
    let inStr = null;
    let inTpl = false;
    while (i < src.length) {
      const ch = src[i];
      if (inStr) {
        if (ch === '\\\\') { i += 2; continue; }
        if (ch === inStr) { inStr = null; i += 1; continue; }
        i += 1; continue;
      }
      if (inTpl) {
        if (ch === '\\\\') { i += 2; continue; }
        if (ch === '`') { inTpl = false; i += 1; continue; }
        i += 1; continue;
      }
      if (ch === '"' || ch === "'") { inStr = ch; i += 1; continue; }
      if (ch === '`') { inTpl = true; i += 1; continue; }
      if (ch === '{') { depth += 1; i += 1; continue; }
      if (ch === '}') { depth = Math.max(0, depth - 1); i += 1; continue; }
      if (depth === 0 && ch === '>') {
        const end = src[i - 1] === '/' ? i - 1 : i;
        return { propsBlock: src.slice(propsStart, end), tagName: m[1] };
      }
      i += 1;
    }
  }
  return null;
}

/** Extract the first <DataPageLayout ...> or <PageMeta ...> JSX element and
 *  pull its title= / description= props. */
function extractMetaFromComponent(filePath) {
  const abs = resolveComponentFile(filePath);
  if (!abs) return {};
  const src = readFileSync(abs, 'utf8');

  for (const tagName of ['DataPageLayout', 'PageMeta']) {
    let cursor = 0;
    let el;
    while ((el = extractJsxOpeningTag(src, tagName, cursor)) !== null) {
      const extracted = extractProps(el.propsBlock);
      if (extracted.title) return extracted;
      cursor = src.indexOf(`<${tagName}`, cursor + 1) + 1;
    }
  }
  return {};
}

/** Pull title= and description= from a JSX props block. */
function extractProps(propsBlock) {
  const out = {};

  const titleStr = /\btitle\s*=\s*"((?:[^"\\]|\\.)*)"/.exec(propsBlock);
  if (titleStr) out.title = decodeStringLiteral(titleStr[1]).trim();

  if (!out.title) {
    const titleTpl = /\btitle\s*=\s*\{`((?:[^`\\]|\\.)*)`\}/.exec(propsBlock);
    if (titleTpl) out.title = evalTemplateLiteral(titleTpl[1]);
  }

  // Skip dynamic expression titles (title={someVar}) — they leak JSX.
  if (out.title && /[{}]/.test(out.title)) delete out.title;

  const descStr = /\bdescription\s*=\s*"((?:[^"\\]|\\.)*)"/.exec(propsBlock);
  if (descStr) out.description = decodeStringLiteral(descStr[1]).trim();

  if (!out.description) {
    const descTpl = /\bdescription\s*=\s*\{`((?:[^`\\]|\\.)*)`\}/.exec(propsBlock);
    if (descTpl) out.description = evalTemplateLiteral(descTpl[1]);
  }

  if (!out.description) {
    const descTplMulti = /\bdescription\s*=\s*\{\s*`((?:[^`\\]|\\.)*)`\s*\}/.exec(propsBlock);
    if (descTplMulti) out.description = evalTemplateLiteral(descTplMulti[1]);
  }

  // Skip dynamic expression descriptions.
  if (out.description && /[{}]/.test(out.description)) delete out.description;

  return out;
}

/** Fall back to the first <h1>text</h1> content (stripped of nested tags). */
function extractH1(filePath) {
  const abs = resolveComponentFile(filePath);
  if (!abs) return undefined;
  const src = readFileSync(abs, 'utf8');
  const m = /<h1\b[^>]*>([\s\S]*?)<\/h1>/.exec(src);
  if (!m) return undefined;
  // Strip nested tags + collapse whitespace.
  const text = m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  // Reject if it contains JSX expression remnants (e.g. {matrixSource === ...}).
  if (!text || /[{}]/.test(text)) return undefined;
  return text || undefined;
}

// ── 3. Read hand-tuned OG_OVERRIDES so we don't duplicate them ─────────────

function parseHandTunedOverrides() {
  const src = readFileSync(resolve(ROOT, 'worker/og-rewriter.ts'), 'utf8');
  const block = src.match(/export const OG_OVERRIDES[^=]*=\s*\{([\s\S]*?)\n\};/);
  if (!block) return new Set();
  const paths = new Set();
  const entryRe = /^\s*'([^']+)':\s*\{/gm;
  let m;
  while ((m = entryRe.exec(block[1])) !== null) paths.add(m[1]);
  return paths;
}

// ── 4. Main ─────────────────────────────────────────────────────────────────

function main() {
  const routeToFile = parseAppRoutes();
  const handTuned = parseHandTunedOverrides();

  const generated = {};
  let extracted = 0;
  let skippedHandTuned = 0;
  let skippedNoMeta = 0;
  const noMetaRoutes = [];

  for (const [route, file] of routeToFile) {
    if (route === '/') {
      skippedNoMeta++;
      continue;
    }
    if (handTuned.has(route)) {
      skippedHandTuned++;
      continue;
    }
    let meta = extractMetaFromComponent(file);
    if (!meta.title) {
      const h1 = extractH1(file);
      if (h1) meta.title = h1;
    }
    if (!meta.title && !meta.description) {
      skippedNoMeta++;
      noMetaRoutes.push(route);
      continue;
    }
    const entry = {};
    if (meta.title) entry.title = meta.title;
    if (meta.description) entry.description = meta.description;
    generated[route] = entry;
    extracted++;
  }

  const outPath = resolve(ROOT, 'worker/og-overrides.generated.json');
  writeFileSync(outPath, JSON.stringify(generated, null, 2) + '\n', 'utf8');

  console.log(
    `✓ build-og-overrides: ${extracted} routes → ${outPath.replace(ROOT + '/', '')}\n` +
      `  ${skippedHandTuned} skipped (hand-tuned in OG_OVERRIDES), ${skippedNoMeta} had no extractable meta (fall through to deriveOgFromPath).`
  );
  if (noMetaRoutes.length > 0) {
    console.log(`  routes with no extractable meta (first 20): ${noMetaRoutes.slice(0, 20).join(', ')}${noMetaRoutes.length > 20 ? ` … (+${noMetaRoutes.length - 20} more)` : ''}`);
  }
}

main();
