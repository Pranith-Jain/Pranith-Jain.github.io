#!/usr/bin/env node
/**
 * Build the OSS Feed Registry manifest under public/data/oss-feed-registry/.
 *
 * Reads from ./oss-feeds-staging/ (created by `node scripts/sync-oss-feeds.mjs`)
 * and emits:
 *   public/data/oss-feed-registry/index.json  (slim index with complete feed list)
 *   public/data/oss-feed-registry/categories/<category>.json  (per-category feed lists)
 *
 * Source: github.com/Bert-JanP/Open-Source-Threat-Intel-Feeds (BSD-3-Clause)
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const STAGING = join(ROOT, 'oss-feeds-staging');
const OUT = join(ROOT, 'public', 'data', 'oss-feed-registry');

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

if (!existsSync(STAGING)) {
  console.error(`✘ Staging folder missing: ${STAGING}`);
  console.error('  Run: node scripts/sync-oss-feeds.mjs first.');
  process.exit(1);
}

if (existsSync(OUT)) rmSync(OUT, { recursive: true });
ensureDir(join(OUT, 'categories'));

const csv = readFileSync(join(STAGING, 'feeds.csv'), 'utf8').trim();
const lines = csv.split('\n');

// Parse CSV (Vendor;Description;Category;Url;FeedStatus)
const headers = lines[0].split(';').map((h) => h.trim());
const vendorIdx = headers.indexOf('Vendor');
const descIdx = headers.indexOf('Description');
const catIdx = headers.indexOf('Category');
const urlIdx = headers.indexOf('Url');
const statusIdx = headers.indexOf('FeedStatus');

const feeds = [];
for (let i = 1; i < lines.length; i++) {
  if (!lines[i].trim()) continue;
  const cols = lines[i].split(';').map((c) => c.trim());
  if (cols.length < 5) continue;
  feeds.push({
    vendor: cols[vendorIdx] ?? '',
    description: cols[descIdx] ?? '',
    category: cols[catIdx] ?? '',
    url: cols[urlIdx] ?? '',
    feedStatus: cols[statusIdx] ?? 'Unknown',
  });
}

const byCategory = {};
const byStatus = {};

for (const feed of feeds) {
  const cat = feed.category || 'Other';
  if (!byCategory[cat]) byCategory[cat] = [];
  byCategory[cat].push(feed);
  byStatus[feed.feedStatus] = (byStatus[feed.feedStatus] || 0) + 1;
}

// Write per-category JSON files
const categoryIndex = Object.entries(byCategory).map(([category, entries]) => {
  const body = { category, count: entries.length, feeds: entries };
  const safe = category.toLowerCase().replace(/[^a-z0-9]/g, '-');
  writeFileSync(join(OUT, 'categories', `${safe}.json`), JSON.stringify(body));
  return { category, count: entries.length, slug: safe };
});

// Write slim index (without full feed bodies to keep it small)
const feedIndex = feeds.map((f) => ({
  vendor: f.vendor,
  description: f.description.length > 120 ? f.description.slice(0, 117) + '…' : f.description,
  category: f.category,
  feedStatus: f.feedStatus,
}));

const index = {
  source: 'Bert-JanP/Open-Source-Threat-Intel-Feeds',
  sourceUrl: 'https://github.com/Bert-JanP/Open-Source-Threat-Intel-Feeds',
  license: 'BSD-3-Clause',
  replicatedAt: new Date().toISOString().slice(0, 10),
  lastSyncedAt: new Date().toISOString(),
  counts: {
    total: feeds.length,
    byCategory: Object.fromEntries(Object.entries(byCategory).map(([k, v]) => [k, v.length])),
    byStatus,
  },
  categories: categoryIndex,
  feedIndex,
};

writeFileSync(join(OUT, 'index.json'), JSON.stringify(index));

console.log('✔ Built:');
console.log(`    ${feeds.length} feeds       (public/data/oss-feed-registry/)`);
console.log(`    ${categoryIndex.length} categories  (public/data/oss-feed-registry/categories/)`);
console.log(`    1 slim index             (public/data/oss-feed-registry/index.json)`);
