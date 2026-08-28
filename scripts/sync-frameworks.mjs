#!/usr/bin/env node
/**
 * Sync TID-CMM + UTIOM framework data into public/data/frameworks/
 *
 * TID-CMM exposes versioned static JSON at tid-cmm.com/api/*.json (CORS-open).
 * We vendor a snapshot into the static asset tree so the SPA pages + MCP tools
 * don't depend on a cross-origin fetch at runtime.
 *
 * UTIOM has no JSON API; we snapshot the key HTML pages into
 * threat-intel-staging/frameworks/ as a reference and build a small
 * hand-curated manifest (src/data/frameworks.ts) from the site copy.
 *
 * Usage:
 *   node scripts/sync-frameworks.mjs           # fetch + write
 *   node scripts/sync-frameworks.mjs --check   # verify local copy matches upstream
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const ENDPOINTS = {
  model: 'https://tid-cmm.com/api/model.json',
  techniques: 'https://tid-cmm.com/api/techniques.json',
  levels: 'https://tid-cmm.com/api/levels.json',
  constraints: 'https://tid-cmm.com/api/constraints.json',
  tiers: 'https://tid-cmm.com/api/tiers.json',
  profiles: 'https://tid-cmm.com/api/profiles.json',
};

const DEST_DIR = path.join(ROOT, 'public/data/frameworks/tid-cmm');
const STAGING_DIR = path.join(ROOT, 'threat-intel-staging/frameworks');

async function fetchJson(url) {
  const r = await fetch(url, { headers: { 'user-agent': 'pranithjain-framework-sync/1.0', accept: 'application/json' } });
  if (!r.ok) throw new Error(`${url} -> ${r.status} ${await r.text().catch(() => '')}`);
  return r.json();
}

async function fetchText(url) {
  const r = await fetch(url, { headers: { 'user-agent': 'pranithjain-framework-sync/1.0', accept: 'text/html' } });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.text();
}

async function main() {
  const check = process.argv.includes('--check');
  fs.mkdirSync(DEST_DIR, { recursive: true });
  fs.mkdirSync(STAGING_DIR, { recursive: true });

  let anyChange = false;

  for (const [name, url] of Object.entries(ENDPOINTS)) {
    const data = await fetchJson(url);
    const dest = path.join(DEST_DIR, `${name}.json`);
    const serialised = JSON.stringify(data, null, 2) + '\n';
    if (check) {
      const local = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : null;
      if (local !== serialised) {
        console.error(`mismatch: public/data/frameworks/tid-cmm/${name}.json`);
        anyChange = true;
      } else {
        console.log(`ok: ${name}.json`);
      }
    } else {
      fs.writeFileSync(dest, serialised);
      console.log(`wrote ${dest} (${serialised.length} bytes)`);
    }
  }

  // Also snapshot two UTIOM pages for provenance (non-blocking)
  try {
    const utiomHtml = await fetchText('https://utiom.de/');
    if (!check) fs.writeFileSync(path.join(STAGING_DIR, 'utiom-index.html'), utiomHtml);
    console.log(`utiom index: ${utiomHtml.length} bytes`);
  } catch (e) {
    console.warn('utiom index fetch failed:', e.message);
  }

  if (check && anyChange) {
    console.error('\nFramework snapshot is stale — run `node scripts/sync-frameworks.mjs` to refresh.');
    process.exit(1);
  }
  if (!check) {
    console.log('\nDone. Run `node scripts/build-frameworks.mjs` if a build step is added; otherwise static JSON is ready.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
