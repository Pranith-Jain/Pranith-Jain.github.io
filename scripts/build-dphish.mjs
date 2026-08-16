#!/usr/bin/env node
/**
 * Build the dPhish (dphish.com) phishing threat-intel manifest under
 * public/data/threat-intel/dphish/.
 *
 * Reads staging in ./threat-intel-staging/dphish/ (created by
 * `node scripts/sync-dphish.mjs`) and emits:
 *   index.json                     (slim — source meta, counts, slim entries)
 *   indicators/<slug>.json         (one per STIX indicator, full body)
 *
 * The manifest is read at runtime by worker/lib/threat-intel-manifest.ts
 * through env.ASSETS — no D1, no KV, no public fetch.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const STAGING = join(ROOT, 'threat-intel-staging', 'dphish');
const OUT = join(ROOT, 'public', 'data', 'threat-intel', 'dphish');

function hashString(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

function safeFilename(slug) {
  return String(slug).replace(/\//g, '__').replace(/[^A-Za-z0-9._-]/g, '_');
}

/** Human-friendly, collision-safe slug for an indicator's observable value. */
function indicatorSlug(value, stixId) {
  const base = safeFilename(String(value ?? 'unknown')).slice(0, 100) || 'unknown';
  const suffix = hashString(`${value ?? ''}|${stixId ?? ''}`).slice(0, 6);
  return `${base}-${suffix}`;
}

function readStaging() {
  const p = join(STAGING, 'indicators.json');
  if (!existsSync(p)) {
    console.error(`  ⚠ no staging file at ${p} — run \`node scripts/sync-dphish.mjs\` first`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(p, 'utf8'));
}

function toSlim(ind, slug) {
  return {
    slug,
    stixId: ind.stixId,
    value: ind.value,
    category: ind.category,
    mainObservableType: ind.mainObservableType,
    active: !ind.revoked,
    revoked: ind.revoked,
    confidence: ind.confidence,
    score: ind.score,
    created: ind.created,
    modified: ind.modified,
    validUntil: ind.validUntil,
    description: ind.description,
    sizeBytes: ind.sizeBytes ?? 0,
  };
}

function main() {
  console.log('dPhish build — writing into', OUT);
  const staged = readStaging();
  const indicators = Array.isArray(staged.indicators) ? staged.indicators : [];
  if (indicators.length === 0) {
    console.error('  ✘ staging has zero indicators — aborting');
    process.exit(1);
  }

  if (existsSync(OUT)) rmSync(OUT, { recursive: true });
  mkdirSync(join(OUT, 'indicators'), { recursive: true });

  const slim = [];
  const byCategory = {};
  let active = 0;
  for (const ind of indicators) {
    const slug = indicatorSlug(ind.value, ind.stixId);
    const body = { ...ind, slug, active: !ind.revoked, sizeBytes: Buffer.byteLength(JSON.stringify(ind), 'utf8') };
    writeFileSync(join(OUT, 'indicators', `${safeFilename(slug)}.json`), JSON.stringify(body));
    slim.push(toSlim(ind, slug));
    byCategory[ind.category] = (byCategory[ind.category] ?? 0) + 1;
    if (!ind.revoked) active += 1;
  }

  const index = {
    source: staged.source,
    sourceUrl: staged.sourceUrl,
    collectionId: staged.collectionId,
    collectionUrl: staged.collectionUrl,
    description: staged.description,
    license: staged.license,
    syncedAt: staged.syncedAt,
    counts: {
      indicators: indicators.length,
      active,
      revoked: indicators.length - active,
      byCategory,
    },
    indicators: slim,
  };
  writeFileSync(join(OUT, 'index.json'), JSON.stringify(index));

  console.log(`    ✔ index.json (${indicators.length} indicators, ${active} active)`);
  for (const [cat, n] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
    console.log(`      ${cat.padEnd(10)} ${String(n).padStart(3)}`);
  }
}

main();