#!/usr/bin/env node
/**
 * Diff two CERT-In index.json snapshots and print a human-readable
 * report. Used by the cert-in-sync GitHub Action to summarise what
 * changed in the proposed PR.
 *
 *   node scripts/cert-in-diff.mjs \
 *     --before <path-to-old.json> \
 *     --after  <path-to-new.json>
 *
 * The first line is either "NO_CHANGES" (workflow short-circuits) or
 * "CHANGED" followed by a markdown block. Always exits 0 (the diff
 * is informational; a non-empty diff is not an error).
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--before') out.before = argv[++i];
    else if (a === '--after') out.after = argv[++i];
  }
  return out;
}

function loadJson(path, label) {
  if (!existsSync(path)) {
    console.error(`WARN: ${label} file not found at ${path}, treating as empty`);
    return [];
  }
  try {
    const data = JSON.parse(readFileSync(path, 'utf8'));
    if (!Array.isArray(data)) {
      console.error(`WARN: ${label} file is not an array (${path}), treating as empty`);
      return [];
    }
    return data;
  } catch (e) {
    console.error(`WARN: ${label} file is not valid JSON (${path}): ${e.message}`);
    return [];
  }
}

function byId(rows) {
  const m = new Map();
  for (const r of rows) m.set(r.id, r);
  return m;
}

function changedFields(a, b) {
  // Compare the small set of fields the parser can plausibly change.
  const keys = ['published_at', 'severity', 'cves', 'products_affected', 'description', 'summary'];
  const diffs = [];
  for (const k of keys) {
    const av = JSON.stringify(a[k] ?? null);
    const bv = JSON.stringify(b[k] ?? null);
    if (av !== bv) diffs.push(k);
  }
  return diffs;
}

function shortRow(r) {
  return {
    id: r.id,
    published_at: r.published_at,
    severity: r.severity,
    cves: (r.cves || []).length,
    products: (r.products_affected || []).length,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.before || !args.after) {
    console.error('usage: cert-in-diff.mjs --before <old.json> --after <new.json>');
    process.exit(1);
  }
  const before = byId(loadJson(resolve(args.before), 'before'));
  const after = byId(loadJson(resolve(args.after), 'after'));

  const added = [];
  const removed = [];
  const changed = [];
  for (const [id, rec] of after) {
    const prev = before.get(id);
    if (!prev) {
      added.push(rec);
    } else {
      const fields = changedFields(prev, rec);
      if (fields.length > 0) changed.push({ id, fields, before: prev, after: rec });
    }
  }
  for (const [id, rec] of before) {
    if (!after.has(id)) removed.push(rec);
  }

  if (added.length === 0 && removed.length === 0 && changed.length === 0) {
    console.log('NO_CHANGES');
    console.log('');
    console.log(`Index unchanged (${after.size} advisories).`);
    return;
  }

  console.log('CHANGED');
  console.log('');
  console.log(`## CERT-In index diff`);
  console.log('');
  console.log(`- **Before:** ${before.size} advisories`);
  console.log(`- **After:** ${after.size} advisories`);
  console.log(`- **Added:** ${added.length}`);
  console.log(`- **Removed:** ${removed.length}`);
  console.log(`- **Changed:** ${changed.length}`);
  console.log('');

  if (added.length > 0) {
    added.sort((a, b) => (b.published_at || '').localeCompare(a.published_at || ''));
    console.log(`### New advisories (${added.length})`);
    console.log('');
    console.log('| ID | Published | Severity | CVEs | Products |');
    console.log('|---|---|---|---|---|');
    for (const r of added) {
      const s = shortRow(r);
      console.log(`| \`${s.id}\` | ${s.published_at} | ${s.severity} | ${s.cves} | ${s.products} |`);
    }
    console.log('');
  }

  if (changed.length > 0) {
    changed.sort((a, b) => a.id.localeCompare(b.id));
    console.log(`### Re-parsed advisories (${changed.length})`);
    console.log('');
    for (const c of changed) {
      console.log(`- \`${c.id}\` — fields: ${c.fields.map((f) => '`' + f + '`').join(', ')}`);
    }
    console.log('');
  }

  if (removed.length > 0) {
    removed.sort((a, b) => a.id.localeCompare(b.id));
    console.log(`### Removed advisories (${removed.length})`);
    console.log('');
    for (const r of removed) {
      console.log(`- \`${r.id}\` (was ${r.published_at}, [${r.severity}])`);
    }
    console.log('');
  }
}

main();
