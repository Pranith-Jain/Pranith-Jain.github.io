#!/usr/bin/env node
/**
 * Strip `Link` from react-router-dom imports in files where it's no longer
 * referenced after the back-link codemod ran. Conservative: only modifies
 * files where the only remaining Link usage was the back-link block that
 * codemod-back-link.mjs replaced with <BackLink>.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

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

function stripLinkImport(src) {
  // First check: is `Link` still actually used anywhere in the file body
  // (excluding the import line itself)? If yes, do nothing — keep the
  // import so other in-page navigation keeps working.
  const importLineRe = /^import\s*{([^}]+)}\s*from\s*['"]react-router-dom['"];?\s*$/m;
  const match = importLineRe.exec(src);
  if (!match) return null;
  const named = match[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!named.includes('Link')) return null;
  const withoutImport = src.slice(0, match.index) + src.slice(match.index + match[0].length);
  // Word-boundary search for Link uses outside of the import line. JSX uses
  // <Link ...> and TS uses Link as a value/type reference.
  const linkUsageRe = /\bLink\b/;
  if (linkUsageRe.test(withoutImport)) return null; // still used elsewhere

  const kept = named.filter((n) => n !== 'Link');
  if (kept.length === 0) {
    // Drop the entire import line.
    return src.slice(0, match.index) + src.slice(match.index + match[0].length + 1);
  }
  const newImport = `import { ${kept.join(', ')} } from 'react-router-dom';`;
  return src.slice(0, match.index) + newImport + src.slice(match.index + match[0].length);
}

async function main() {
  const files = await targetFiles();
  let touched = 0;
  for (const f of files) {
    const before = await fs.readFile(f, 'utf8');
    const after = stripLinkImport(before);
    if (after && after !== before) {
      await fs.writeFile(f, after, 'utf8');
      touched += 1;
      console.log(`✓ ${path.relative(ROOT, f)}`);
    }
  }
  console.log(`\nStripped from ${touched} file${touched === 1 ? '' : 's'}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
