#!/usr/bin/env node
/**
 * Build the AI Threat Actors manifest under public/data/ai-threats/.
 *
 * Reads from ./ai-threats-staging/ (created by `node scripts/sync-ai-threats.mjs`)
 * and emits:
 *   public/data/ai-threats/index.json                (slim index, no bodies)
 *   public/data/ai-threats/entries/<slug>.json       (one per threat entry)
 *
 * Source: github.com/cybershujin/Threat-Actors-use-of-Artifical-Intelligence
 * License: MIT (inferred from public GitHub Pages content)
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const STAGING = join(ROOT, 'ai-threats-staging');
const OUT = join(ROOT, 'public', 'data', 'ai-threats');

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

function safeFilename(slug) {
  return String(slug).replace(/\//g, '__').replace(/[^A-Za-z0-9._-]/g, '_');
}

function shortDesc(desc) {
  if (!desc) return '';
  return desc.length > 240 ? desc.slice(0, 237) + '…' : desc;
}

function extractTtps(ttpMd) {
  if (!ttpMd) return [];
  const ttps = [];
  for (const m of ttpMd.matchAll(/T\d{4}(?:\.\d{3})?/g)) ttps.push(m[0]);
  return Array.from(new Set(ttps)).sort();
}

function extractCategories(ttpMd) {
  if (!ttpMd) return [];
  const cats = [];
  for (const m of ttpMd.matchAll(/\*\*[^*]+\*\*/g)) {
    cats.push(m[0].replace(/\*\*/g, '').trim());
  }
  return Array.from(new Set(cats));
}

if (!existsSync(STAGING)) {
  console.error(`✘ Staging folder missing: ${STAGING}`);
  console.error('  Run: node scripts/sync-ai-threats.mjs first.');
  process.exit(1);
}

if (existsSync(OUT)) rmSync(OUT, { recursive: true });
ensureDir(join(OUT, 'entries'));

const tracker = JSON.parse(readFileSync(join(STAGING, 'tracker.json'), 'utf8'));
const entries = tracker.entries ?? [];
const stixRaw = existsSync(join(STAGING, 'stix.json'))
  ? JSON.parse(readFileSync(join(STAGING, 'stix.json'), 'utf8'))
  : null;

const threatIndex = [];
const slugCounts = {};
let mainCount = 0;
let deepfakeCount = 0;

for (const entry of entries) {
  const table = entry.table ?? 'main';
  if (table === 'main') mainCount++;
  if (table === 'deepfake') deepfakeCount++;

  let slug = entry.name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  if (!slug) slug = 'unnamed';
  if (slugCounts[slug]) {
    slugCounts[slug]++;
    slug = `${slug}-${slugCounts[slug]}`;
  } else {
    slugCounts[slug] = 1;
  }

  const ttps = extractTtps(entry.ttp_md);
  const categories = extractCategories(entry.ttp_md);

  const brief = shortDesc(entry.brief ?? '');

  const indexEntry = {
    slug,
    name: entry.name,
    akas: entry.akas ?? '',
    brief,
    ttps,
    categories,
    reported: entry.reported ?? '',
    activity: entry.activity ?? '',
    table,
    sizeBytes: (entry.brief ?? '').length,
  };
  threatIndex.push(indexEntry);

  const body = {
    ...indexEntry,
    brief: entry.brief ?? '',
    ttpMd: entry.ttp_md ?? '',
  };
  writeFileSync(join(OUT, 'entries', `${safeFilename(slug)}.json`), JSON.stringify(body));
}

threatIndex.sort((a, b) => a.name.localeCompare(b.name));

const index = {
  source: 'Cybershujin Threat Actors\' Use of Artificial Intelligence tracker',
  sourceUrl: 'https://cybershujin.github.io/Threat-Actors-use-of-Artifical-Intelligence/',
  license: 'MIT',
  replicatedAt: new Date().toISOString().slice(0, 10),
  lastSyncedAt: new Date().toISOString(),
  counts: {
    total: threatIndex.length,
    main: mainCount,
    deepfake: deepfakeCount,
  },
  stixAvailable: stixRaw !== null,
  threatIndex,
};

writeFileSync(join(OUT, 'index.json'), JSON.stringify(index));

console.log('✔ Built:');
console.log(`    ${threatIndex.length} entries  (public/data/ai-threats/entries/)`);
console.log(`    ${mainCount} main        (${deepfakeCount} deepfake)`);
console.log(`    ${stixRaw ? 'with' : 'without'} STIX 2.1 bundle`);
console.log(`    1 slim index          (public/data/ai-threats/index.json)`);
