#!/usr/bin/env node
/**
 * Guard: ban ad-hoc sub-token font sizes (text-[Npx]).
 *
 * Phase 5: Tailwind removed. The remaining `text-[10px]` / `text-[11px]`
 * strings in the codebase are now no-op (Tailwind JIT is no longer
 * running), but we keep this guard so the codebase doesn't accumulate
 * dead Tailwind patterns during the migration's tail end. When all
 * remaining ad-hoc strings are migrated (or removed), this script
 * will return 0 hits and can be deleted.
 *
 * The named type scale (text-micro/mini/meta/tool/eyebrow) is now
 * defined in panda.config.ts as fontSize tokens. Panda recipes emit
 * typed CSS via `fs_mini` / `fs_micro` etc. — no arbitrary `[Npx]`
 * values.
 *
 * Run: `npm run check:no-px-text`. Exits 1 with a file:line list on
 * any hit. Expected hits today: ~10 (InfraMap, Projects, McpStatusBanner).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve('src');
// Sub-token sizes the named scale replaces: <=13px (micro 10 / mini 11 /
// meta 12 / tool 13, and anything smaller is below the legibility floor).
// Larger ad-hoc sizes (14px+) map cleanly to Tailwind defaults and are allowed.
const RE = /text-\[([0-9]|1[0-3])px\]/g;
const hits = [];
const stack = [root];

while (stack.length) {
  const dir = stack.pop();
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    continue;
  }
  for (const name of entries) {
    const full = path.join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (name !== 'node_modules') stack.push(full);
      continue;
    }
    if (!/\.(tsx?|jsx?)$/.test(name)) continue;
    const text = readFileSync(full, 'utf8');
    text.split('\n').forEach((line, i) => {
      const m = line.match(RE);
      if (m) hits.push(`${path.relative(process.cwd(), full)}:${i + 1}  ${[...new Set(m)].join(', ')}`);
    });
  }
}

if (hits.length) {
  console.error(
    `✗ Found ${hits.length} ad-hoc text-[Npx] font size(s). ` +
      `Use the named scale (text-micro 10px / text-mini 11px / text-meta 12px / text-tool 13px / text-eyebrow):\n`
  );
  console.error(hits.join('\n'));
  process.exit(1);
}
console.log('✓ No ad-hoc text-[Npx] font sizes — type scale is the single source of truth.');
