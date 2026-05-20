#!/usr/bin/env node
/**
 * codemod-back-link.mjs — rewrites the inline back-link <Link> on every
 * /threatintel and /dfir tool page to use the shared <BackLink> wrapper.
 *
 * What it changes per file:
 *   1. Finds  `<Link\s+to="/threatintel"...>...</Link>`  blocks (and
 *      the `/dfir` variant) and renames the tag to `<BackLink ...>`
 *      with the matching closing tag.
 *   2. Adds  `import { BackLink } from '<relative>/components/BackLink';`
 *      after the existing `react-router-dom` import line.
 *
 * It does NOT touch:
 *   - Other <Link> elements on the page (only the back-link block).
 *   - The Link/useLocation/etc. imports from react-router-dom — those
 *     are still needed for in-page navigation.
 *
 * Idempotent: re-running on an already-converted file is a no-op.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/** Files in scope: every tool/sub-page under /threatintel/* and /dfir/*. */
async function targetFiles() {
  const dirs = [path.join(ROOT, 'src/pages/threatintel'), path.join(ROOT, 'src/pages/dfir')];
  const out = [];
  for (const d of dirs) {
    const entries = await fs.readdir(d, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith('.tsx')) out.push(path.join(d, e.name));
    }
  }
  return out;
}

/**
 * Replace the back-link block in `src`. Returns `{ src, changed }`.
 *
 * The regex captures `<Link` + everything up to the matching `</Link>` where
 * the opening tag's `to` attribute equals exactly `/threatintel` or `/dfir`.
 * We rely on these back-link blocks being self-contained (no nested <Link>)
 * — true for every file in scope per a grep audit.
 */
function rewriteJsx(src) {
  const pattern = /<Link(\s+to="\/(?:threatintel|dfir)"[\s\S]*?)<\/Link>/g;
  let changed = false;
  const out = src.replace(pattern, (full, inner) => {
    changed = true;
    return `<BackLink${inner}</BackLink>`;
  });
  return { src: out, changed };
}

/**
 * Add `import { BackLink } from '../../components/BackLink';` after the
 * react-router-dom import line. If the import already exists, no-op.
 */
function ensureImport(src, filePath) {
  if (/from ['"][^'"]*components\/BackLink['"]/.test(src)) return src;
  const relDir = path.relative(path.dirname(filePath), path.join(ROOT, 'src/components')).replace(/\\/g, '/');
  const importLine = `import { BackLink } from '${relDir}/BackLink';`;
  // Insert after the first react-router-dom import we find. Every file in
  // scope has exactly one such line.
  const rrdRe = /^import\s+[^;]*from\s+['"]react-router-dom['"];?\s*$/m;
  const match = rrdRe.exec(src);
  if (!match) {
    // Fall back to inserting after the first import; shouldn't happen for
    // files in scope but keeps the codemod safe.
    const firstImport = /^import\s[^;]+;\s*$/m.exec(src);
    if (!firstImport) return `${importLine}\n${src}`;
    return src.slice(0, firstImport.index + firstImport[0].length) + `\n${importLine}` + src.slice(firstImport.index + firstImport[0].length);
  }
  return src.slice(0, match.index + match[0].length) + `\n${importLine}` + src.slice(match.index + match[0].length);
}

async function main() {
  const files = await targetFiles();
  let touched = 0;
  for (const f of files) {
    const before = await fs.readFile(f, 'utf8');
    const { src: afterJsx, changed } = rewriteJsx(before);
    if (!changed) continue;
    const after = ensureImport(afterJsx, f);
    if (after !== before) {
      await fs.writeFile(f, after, 'utf8');
      touched += 1;
      console.log(`✓ ${path.relative(ROOT, f)}`);
    }
  }
  console.log(`\nRewrote ${touched} file${touched === 1 ? '' : 's'}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
