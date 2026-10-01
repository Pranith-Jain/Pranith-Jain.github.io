#!/usr/bin/env node
/**
 * Regenerate `eslint-rules/raw-colors-baseline.mjs`.
 *
 * Run after landing a batch of `no-raw-colors` fixes:
 *
 *     node scripts/update-raw-colors-baseline.mjs
 *
 * The baseline is the set of files that still trip the rule. Shrinking it is
 * how progress on the token migration becomes visible: after a cleanup commit,
 * this script drops the cleaned files and the rule tightens over them again.
 *
 * The rule is disabled repo-wide in `eslint.config.js` (so CI's
 * `--max-warnings 0` gate can pass), which means this script has to run the
 * rule explicitly via `--rule` rather than reading the current config.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RAW_COLORS_BASELINE } from '../eslint-rules/raw-colors-baseline.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = resolve(ROOT, 'eslint-rules/raw-colors-baseline.mjs');

console.log(`Scanning src/ for no-raw-colors findings (previous baseline: ${RAW_COLORS_BASELINE.length})`);

let stdout = '';
try {
  stdout = execFileSync(
    'npx',
    // `--rule` re-enables the one rule on top of the flat config, where it is
    // currently registered as 'off'. No `--no-eslintrc`: this project uses flat
    // config, where that flag does not exist.
    ['eslint', 'src', '--format', 'json', '--rule', '{"no-raw-colors/no-raw-colors":"warn"}'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] },
  );
} catch (err) {
  // ESLint exits non-zero when it reports problems, which is expected here.
  if (err.stdout) stdout = String(err.stdout);
  else {
    console.error('eslint failed:', err.stderr || err.message);
    process.exit(1);
  }
}

const results = JSON.parse(stdout);
const files = results
  .filter((r) => r.messages.some((m) => m.ruleId === 'no-raw-colors/no-raw-colors'))
  .map((r) => relative(ROOT, r.filePath))
  .sort();

if (files.length === 0) {
  console.log('No findings left - the rule can be re-enabled in eslint.config.js and this file deleted.');
  process.exit(0);
}

const before = RAW_COLORS_BASELINE.length;
const added = files.filter((f) => !RAW_COLORS_BASELINE.includes(f));
const removed = RAW_COLORS_BASELINE.filter((f) => !files.includes(f));

const body = `/**
 * Legacy raw-palette baseline for the \`no-raw-colors\` ESLint rule.
 *
 * Generated, not hand-maintained. Regenerate with:
 *
 *     node scripts/update-raw-colors-baseline.mjs
 *
 * ## Why this exists
 *
 * \`no-raw-colors\` (added in 3d66d0e0c) is correct about what it reports: the
 * rule's own test suite passes. But it also flags ~1,800 pre-existing usages
 * across 203 files, and CI gates on \`--max-warnings 0\`, so enabling it repo-
 * wide fails every push.
 *
 * ## Why a baseline rather than turning the rule off
 *
 * Turning the rule off entirely would also stop it catching NEW raw colours,
 * which is the actual value. This list scopes the waiver to the files that
 * already carry the debt, so the rule stays live everywhere else - including
 * any file added after this baseline was generated.
 *
 * ## Why a blanket autofix is not the answer
 *
 * Only 31 of the ~1,800 reports are autofixable, and at least some fixes
 * would change rendering rather than spelling. Roughly 486 reports are state
 * variants (\`hover:\`, \`disabled:\`, \`group-hover:\`, \`dark:hover:\`) that the
 * rule describes as lacking a "dark-mode counterpart" - but a hover state is
 * not a theme. Rewriting \`hover:text-slate-700\` to \`hover:text-muted\` would
 * collapse a deliberate hover step onto the resting colour. \`bg-white ...
 * dark:bg-transparent\` (chrome surfaces) is another: \`bg-surface-100\` is not
 * a synonym for \`transparent\`.
 *
 * So the sweep needs per-group visual review, not a bulk fix. Each entry here
 * should leave the list as its file is cleaned up.
 */
export const RAW_COLORS_BASELINE = ${JSON.stringify(files, null, 2)};
`;

writeFileSync(TARGET, body);

console.log(`Baseline updated: ${before} -> ${files.length} files`);
if (removed.length) console.log(`  cleared (${removed.length}): ${removed.slice(0, 8).join(', ')}${removed.length > 8 ? ' ...' : ''}`);
if (added.length) console.log(`  new (${added.length}): ${added.slice(0, 8).join(', ')}${added.length > 8 ? ' ...' : ''}`);