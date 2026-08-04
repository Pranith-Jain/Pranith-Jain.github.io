#!/usr/bin/env node
/**
 * Build the darknetlist.is manifest under
 * public/data/threat-intel/darknet/.
 *
 * Reads from ./threat-intel-staging/darknetlist.json (created by
 * `node scripts/sync-darknetlist.mjs`) and emits:
 *   public/data/threat-intel/darknet/index.json       (slim — no bodies)
 *   public/data/threat-intel/darknet/categories/<id>.json (one per category, with sites)
 *   public/data/threat-intel/darknet/sites/<dwd-id>.json  (one per site)
 *
 * The manifest is read at runtime by worker/lib/threat-intel-manifest.ts
 * through env.ASSETS — no D1, no KV, no public fetch.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const STAGING_FILE = join(ROOT, 'threat-intel-staging', 'darknetlist.json');
const OUT = join(ROOT, 'public', 'data', 'threat-intel', 'darknet');

function safeFilename(slug) {
  return String(slug).replace(/\//g, '__').replace(/[^A-Za-z0-9._-]/g, '_');
}

function readJsonIfExists(p) {
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    console.warn(`  ⚠ invalid JSON in ${p} — ignoring`);
    return null;
  }
}

if (!existsSync(STAGING_FILE)) {
  console.error(`✘ Staging file missing: ${STAGING_FILE}`);
  console.error('  Run: node scripts/sync-darknetlist.mjs first.');
  process.exit(1);
}

const staged = JSON.parse(readFileSync(STAGING_FILE, 'utf8'));

// Wipe and rebuild the manifest tree.
if (existsSync(OUT)) rmSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'categories'), { recursive: true });
mkdirSync(join(OUT, 'sites'), { recursive: true });

// ─── Per-site bodies ──────────────────────────────────────────────────
const siteIndex = [];
for (const site of staged.sites) {
  const slug = site.dwdId ? site.dwdId.toLowerCase() : safeFilename(site.name.toLowerCase().replace(/\s+/g, '-'));
  const body = {
    slug,
    name: site.name,
    dwdId: site.dwdId,
    category: site.category,
    url: site.url,
    onion: site.onion,
    status: site.status,
    upMirrors: site.upMirrors,
    totalMirrors: site.totalMirrors,
    latencyMs: site.latencyMs,
    httpCode: site.httpCode,
    pageSize: site.pageSize,
    fingerprint: site.fingerprint,
    recommended: site.recommended,
    isOnion: site.url ? site.url.includes('.onion') : false,
  };
  writeFileSync(join(OUT, 'sites', `${safeFilename(slug)}.json`), JSON.stringify(body));
  siteIndex.push({
    slug,
    name: site.name,
    dwdId: site.dwdId,
    category: site.category,
    status: site.status,
    upMirrors: site.upMirrors,
    totalMirrors: site.totalMirrors,
    recommended: site.recommended,
    isOnion: body.isOnion,
  });
}

// Sort site index: recommended first, then online, then by name
siteIndex.sort((a, b) => {
  if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
  if (a.status !== b.status) return a.status === 'up' ? -1 : 1;
  return a.name.localeCompare(b.name);
});

// ─── Per-category bodies ──────────────────────────────────────────────
const categoryIndex = [];
for (const cat of staged.categories) {
  const body = {
    id: cat.id,
    title: cat.title,
    description: cat.description,
    siteCount: cat.siteCount,
    mirrorCount: cat.mirrorCount,
    upCount: cat.upCount,
    sites: cat.sites.map((s) => ({
      slug: s.dwdId ? s.dwdId.toLowerCase() : safeFilename(s.name.toLowerCase().replace(/\s+/g, '-')),
      name: s.name,
      dwdId: s.dwdId,
      status: s.status,
      upMirrors: s.upMirrors,
      totalMirrors: s.totalMirrors,
      recommended: s.recommended,
      isOnion: s.url ? s.url.includes('.onion') : false,
      url: s.url,
      onion: s.onion,
      latencyMs: s.latencyMs,
      httpCode: s.httpCode,
      pageSize: s.pageSize,
      fingerprint: s.fingerprint,
    })),
  };
  writeFileSync(join(OUT, 'categories', `${cat.id}.json`), JSON.stringify(body));
  categoryIndex.push({
    id: cat.id,
    title: cat.title,
    description: cat.description,
    siteCount: cat.siteCount,
    mirrorCount: cat.mirrorCount,
    upCount: cat.upCount,
  });
}

// ─── Index ────────────────────────────────────────────────────────────
const upCount = siteIndex.filter((s) => s.status === 'up').length;
const downCount = siteIndex.filter((s) => s.status === 'down').length;
const recommendedCount = siteIndex.filter((s) => s.recommended).length;
const onionCount = siteIndex.filter((s) => s.isOnion).length;

const index = {
  source: 'darknetlist.is',
  url: 'https://darknetlist.is/',
  description:
    'A free directory of Tor-accessible sites. A scanner walks the list through a fresh SOCKS circuit every 30 minutes and rewrites the page with whatever responded.',
  rebuiltAt: staged.rebuiltAt,
  syncedAt: staged.syncedAt,
  counts: {
    categories: categoryIndex.length,
    sites: siteIndex.length,
    up: upCount,
    down: downCount,
    recommended: recommendedCount,
    onion: onionCount,
  },
  categories: categoryIndex,
  sites: siteIndex,
};

writeFileSync(join(OUT, 'index.json'), JSON.stringify(index));

console.log('✔ Built darknetlist manifest:');
console.log(`    ${categoryIndex.length} categories  (public/data/threat-intel/darknet/categories/)`);
console.log(`    ${siteIndex.length} sites        (public/data/threat-intel/darknet/sites/)`);
console.log(`    ${upCount} up, ${downCount} down, ${recommendedCount} recommended, ${onionCount} .onion`);
console.log(`    1 slim index   (public/data/threat-intel/darknet/index.json)`);
console.log(`    rebuilt at:    ${staged.rebuiltAt}`);
