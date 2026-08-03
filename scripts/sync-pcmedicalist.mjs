#!/usr/bin/env node
/**
 * Sync PCMedicalist Intelligence Feed digests from GitHub.
 *
 * Fetches the rolling digest manifest (index.json) and, for dates that are
 * new or changed since the last sync, the per-day feed.json + summary.json +
 * posts.json into pcmedicalist-staging/. The staging dir doubles as a cache:
 * a day is only re-downloaded when its pushed_at changes, so the routine
 * daily run only pulls the newest ~2 digests (~4.6 MB each) instead of the
 * whole 24-day archive every time.
 *
 * Source: https://github.com/PCMedicalist/pcmedicalist-intellegence-feed
 * License: CC BY 4.0 (attribution via in-data "source" field satisfies)
 *
 * After sync, run `node scripts/build-pcmedicalist.mjs`.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const STAGING = join(ROOT, 'pcmedicalist-staging');
const STAGING_META = join(STAGING, '_meta.json');

const REPO = 'PCMedicalist/pcmedicalist-intellegence-feed';
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/main`;
const API_BASE = `https://api.github.com/repos/${REPO}/contents`;

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'pranithjain-pcmedicalist-sync/1.0 (+https://pranithjain.qzz.io)',
      accept: 'application/vnd.github.v3+json',
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.json();
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': 'pranithjain-pcmedicalist-sync/1.0 (+https://pranithjain.qzz.io)' },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.text();
}

function loadMeta() {
  if (!existsSync(STAGING_META)) return {};
  try {
    return JSON.parse(readFileSync(STAGING_META, 'utf8'));
  } catch {
    return {};
  }
}

async function syncDate(entry, meta) {
  const { date, pushed_at } = entry;
  if (meta[date] === pushed_at) {
    console.log(`  ─ ${date} (unchanged)`);
    return { date, skipped: true };
  }
  const dayDir = join(STAGING, date);
  mkdirSync(dayDir, { recursive: true });
  const base = `${RAW_BASE}/${entry.path}`;
  console.log(`  → ${date}`);
  for (const [file, name] of [
    ['feed.json', 'feed.json'],
    ['summary.json', 'summary.json'],
    ['posts.json', 'posts.json'],
  ]) {
    try {
      const text = await fetchText(`${base}/${file}`);
      writeFileSync(join(dayDir, name), text);
      console.log(`    wrote ${file} (${text.length} bytes)`);
    } catch (err) {
      console.error(`    ⚠ ${file}: ${err instanceof Error ? err.message : err}`);
    }
  }
  return { date, skipped: false, pushed_at };
}

async function main() {
  console.log('PCMedicalist sync — staging into', STAGING);
  mkdirSync(STAGING, { recursive: true });

  const index = await fetchJson(`${RAW_BASE}/index.json`);
  console.log(`  index.json: ${index.length} digests (${index[0]?.date} → ${index[index.length - 1]?.date})`);

  const meta = loadMeta();
  const updated = { ...meta };
  let ok = 0;
  let skipped = 0;
  for (const entry of index) {
    const res = await syncDate(entry, meta);
    if (res.skipped) {
      skipped++;
      continue;
    }
    ok++;
    if (res.pushed_at) updated[res.date] = res.pushed_at;
  }

  writeFileSync(STAGING_META, JSON.stringify(updated, null, 2));
  console.log(`\n✔ Staged ${ok} new digest(s), ${skipped} unchanged. Next: node scripts/build-pcmedicalist.mjs`);
}

main().catch((err) => {
  console.error('✘ sync failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
