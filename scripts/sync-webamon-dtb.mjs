#!/usr/bin/env node
/**
 * Sync Webamon Daily Threat Briefs from GitHub.
 *
 * Fetches markdown briefs from webamon-org/Daily-Threat-Brief into
 * a local staging folder. After sync, run `node scripts/build-webamon-dtb.mjs`
 * to parse into structured JSON under public/data/webamon-dtb/.
 *
 * Source: https://github.com/webamon-org/Daily-Threat-Brief (Apache-2.0)
 */
import { existsSync, rmSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const STAGING = join(ROOT, 'webamon-dtb-staging');

const REPO = 'webamon-org/Daily-Threat-Brief';
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/main`;
const API_BASE = `https://api.github.com/repos/${REPO}/contents`;

function ensureStaging() {
  if (existsSync(STAGING)) rmSync(STAGING, { recursive: true });
  mkdirSync(STAGING, { recursive: true });
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'pranithjain-webamon-dtb-sync/1.0 (+https://pranithjain.qzz.io)',
      accept: 'application/vnd.github.v3+json',
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.json();
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': 'pranithjain-webamon-dtb-sync/1.0 (+https://pranithjain.qzz.io)' },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.text();
}

async function listDateFolders() {
  const entries = await fetchJson(API_BASE);
  return entries
    .filter((e) => e.type === 'dir' && /^\d{4}-\d{2}-\d{2}$/.test(e.name))
    .map((e) => e.name)
    .sort();
}

async function syncDate(date) {
  const mdUrl = `${RAW_BASE}/${date}/linkedin_dtb_${date}.md`;
  console.log(`  → ${date}`);
  const md = await fetchText(mdUrl);
  const dest = join(STAGING, `${date}.md`);
  writeFileSync(dest, md);
  console.log(`    wrote ${md.length} bytes`);
}

async function main() {
  console.log('Webamon DTB sync — staging into', STAGING);
  ensureStaging();

  const dates = await listDateFolders();
  console.log(`  Found ${dates.length} date folders: ${dates.join(', ')}`);

  let ok = 0;
  for (const date of dates) {
    try {
      await syncDate(date);
      ok++;
    } catch (err) {
      console.error(`  ⚠ Failed ${date}: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\n✔ Staged ${ok}/${dates.length} briefs. Next: node scripts/build-webamon-dtb.mjs`);
}

main().catch((err) => {
  console.error('✘ sync failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
