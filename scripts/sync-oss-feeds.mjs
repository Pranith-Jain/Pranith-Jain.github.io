#!/usr/bin/env node
/**
 * Sync OSS Feed Registry catalog from Bert-JanP/Open-Source-Threat-Intel-Feeds.
 *
 * Source:
 *   - ThreatIntelFeeds.csv — curated CSV of 145+ free open-source TI feeds
 *     https://raw.githubusercontent.com/Bert-JanP/Open-Source-Threat-Intel-Feeds/main/ThreatIntelFeeds.csv
 *
 * Run:
 *   node scripts/sync-oss-feeds.mjs
 *
 * Then:
 *   node scripts/build-oss-feeds.mjs
 */
import { existsSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const STAGING = join(ROOT, 'oss-feeds-staging');

const CSV_URL = 'https://raw.githubusercontent.com/Bert-JanP/Open-Source-Threat-Intel-Feeds/main/ThreatIntelFeeds.csv';
const LICENSE = 'BSD-3-Clause';

function ensureStaging() {
  if (existsSync(STAGING)) rmSync(STAGING, { recursive: true });
  mkdirSync(STAGING, { recursive: true });
}

async function main() {
  console.log('OSS Feed Registry sync — staging into', STAGING);
  ensureStaging();

  console.log(`  → ${CSV_URL}`);
  const res = await fetch(CSV_URL, {
    headers: { 'user-agent': 'pranithjain-oss-feeds-sync/1.0 (+https://pranithjain.qzz.io)' },
  });
  if (!res.ok) throw new Error(`fetch failed: ${CSV_URL} → ${res.status} ${res.statusText}`);
  const text = await res.text();
  writeFileSync(join(STAGING, 'feeds.csv'), text);
  console.log(`    wrote ${text.length} bytes to feeds.csv`);

  console.log('\n✔ Staged. Next: node scripts/build-oss-feeds.mjs');
}

main().catch((err) => {
  console.error('✘ sync failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
