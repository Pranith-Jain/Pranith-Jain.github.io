#!/usr/bin/env node
/**
 * Inventory em dashes in user-facing UI copy.
 *
 * PRODUCT.md bans em dashes in UI copy as an AI-slop tell. A blind
 * `—` -> `,` swap is NOT the fix: most of these are parenthetical or
 * appositive dashes where a comma changes the grammar, and a few are ranges
 * or score notation where any punctuation swap is simply wrong.
 *
 * So this only *classifies* and counts. It proposes nothing automatically,
 * because the right replacement is a per-string judgement (comma, colon,
 * semicolon, period, parentheses, or a rewrite).
 *
 * Comments are stripped first - prose in a `//` note is not UI copy.
 */
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';

const PATTERNS = [
  // "(a) — (b)" tight, no spaces: "70—80", "1,200—1,500", "alpha—omega"
  { name: 'tight-range/nohash', re: /\S—\S/g },
  // spaced dash between two clauses: the common parenthetical case
  { name: 'spaced-clause', re: /\S\s+—\s+\S/g },
  // "Word —" trailing, e.g. a label like "Settings — library export"
  { name: 'trailing', re: /—\s*$/ },
];

const rows = [];
let inComments = 0;
let inCopy = 0;

for (const file of globSync('src/**/*.{tsx,ts}', { cwd: process.cwd() })) {
  const raw = readFileSync(file, 'utf8');
  const clean = raw
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
  inComments += (raw.match(/—/g) || []).length - (clean.match(/—/g) || []).length;
  const n = (clean.match(/—/g) || []).length;
  if (!n) continue;
  inCopy += n;
  clean.split('\n').forEach((line, i) => {
    if (!line.includes('—')) return;
    const trimmed = line.trim();
    // Skip JSX comment remnants and pure-import noise
    if (/^\*\s|^\/\//.test(trimmed)) return;
    const kinds = PATTERNS.filter((p) => p.re.test(trimmed)).map((p) => p.name);
    rows.push({ file, line: i + 1, kinds: kinds.length ? kinds : ['other'], text: trimmed.slice(0, 120) });
  });
}

const byKind = {};
for (const r of rows) for (const k of r.kinds) byKind[k] = (byKind[k] || 0) + 1;

console.log(`em dashes in comments (leave alone): ${inComments}`);
console.log(`em dashes in user-facing copy:        ${inCopy}`);
console.log(`lines affected:                       ${rows.length}`);
console.log('\nby shape:');
for (const [k, v] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(22)} ${v}`);
}
const files = new Set(rows.map((r) => r.file));
console.log(`\nfiles affected: ${files.size}`);
if (process.env.LIST) {
  console.log('\n--- worst offenders ---');
  const byFile = {};
  for (const r of rows) (byFile[r.file] ??= []).push(r);
  for (const [f, rs] of Object.entries(byFile).sort((a, b) => b[1].length - a[1].length).slice(0, 25)) {
    console.log(`\n${f}  (${rs.length})`);
    rs.slice(0, 4).forEach((r) => console.log(`   ${r.line}: ${r.text}`));
  }
}
