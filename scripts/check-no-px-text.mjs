#!/usr/bin/env node
/**
 * Guard: ban ad-hoc sub-token font sizes (text-[Npx]).
 *
 * The named type scale (text-micro/mini/meta/tool/eyebrow in tailwind.config.js)
 * is the single source of truth. Arbitrary `text-[10px]` etc. reintroduces the
 * drift the type-scale codemod removed (~2,600 sites) and bypasses the mobile
 * legibility floor + light-mode contrast override that are keyed to the tokens.
 *
 * Run: `npm run check:no-px-text`. Exits 1 with a file:line list on any hit.
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
