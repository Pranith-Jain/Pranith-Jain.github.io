#!/usr/bin/env node
/**
 * Sync Threat Intel data from public upstream sources into a local
 * staging folder (threat-intel-staging/). Run by:
 *   1. GitHub Action (.github/workflows/threat-intel-sync.yml) — weekly
 *   2. Manual: `node scripts/sync-threat-intel.mjs`
 *
 * After sync, run `node scripts/build-threat-intel.mjs` to slice the
 * staged data into the per-slug JSON the Worker reads at runtime.
 *
 * Sources:
 *   - CISA Known Exploited Vulnerabilities catalog (KEV)
 *     https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json
 *   - NVD recent CVE feed (last 7 days, JSON 2.0)
 *     https://services.nvd.nist.gov/rest/json/cves/2.0?lastModStartDate=...&lastModEndDate=...
 *   - TheRavenFile/Daily-Hunt IOC families (sparse git clone)
 *     https://github.com/TheRavenFile/Daily-Hunt
 *   - mthcht/awesome-lists detection-list CSVs (raw download)
 *     https://github.com/mthcht/awesome-lists
 *
 * Note: OpenThreat (AGPL-3.0) is a design reference only — we re-derive
 * the priority scoring formula independently in the build script.
 * cyber_threat_intel (MIT) — the sector-briefing LLM logic is also
 * rewritten in our own TypeScript pipeline; no upstream code is vendored.
 */
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AWESOME_LISTS_RAW_BASE, DETECTION_LISTS } from './threat-intel-lists.config.mjs';

const ROOT = process.cwd();
const STAGING = join(ROOT, 'threat-intel-staging');
const KEVPATH = join(STAGING, 'kev.json');
const NVDPATH = join(STAGING, 'nvd-recent.json');
const DAILY_HUNT = join(STAGING, 'daily-hunt');
const AWESOME_LISTS = join(STAGING, 'awesome-lists');

const NVD_LOOKBACK_DAYS = 7;
const NVD_API = 'https://services.nvd.nist.gov/rest/json/cves/2.0';
const KEV_URL = 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';
const DAILY_HUNT_REPO = 'https://github.com/TheRavenFile/Daily-Hunt.git';
const ARGUS_TRENDING_URL = 'https://argus.rootxvishal.com/data/trending.json';

function ensureStaging() {
  if (existsSync(STAGING)) {
    rmSync(STAGING, { recursive: true });
  }
  mkdirSync(STAGING, { recursive: true });
}

async function fetchJson(url, dest, opts = {}) {
  console.log(`  → ${url}`);
  const { timeoutMs = 90_000, retries = 1 } = opts;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'user-agent': 'pranithjain-threat-intel-sync/1.0 (+https://pranithjain.qzz.io)',
          ...(process.env.NVD_API_KEY ? { apiKey: process.env.NVD_API_KEY } : {}),
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        throw new Error(`fetch failed: ${url} → ${res.status} ${res.statusText}`);
      }
      const text = await res.text();
      writeFileSync(dest, text);
      const parsed = JSON.parse(text);
      console.log(`    wrote ${text.length} bytes to ${dest}`);
      return parsed;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        const waitMs = 5_000 * (attempt + 1);
        console.warn(`  ⚠ attempt ${attempt + 1} failed (${err instanceof Error ? err.message : err}); retrying in ${waitMs}ms`);
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
  }
  throw lastErr;
}

async function fetchKev() {
  console.log('• CISA KEV');
  return await fetchJson(KEV_URL, KEVPATH);
}

async function fetchNvdRecent() {
  console.log(`• NVD recent CVEs (last ${NVD_LOOKBACK_DAYS} days)`);
  const end = new Date();
  const start = new Date(Date.now() - NVD_LOOKBACK_DAYS * 86_400_000);
  const fmt = (d) => d.toISOString().replace(/\.\d{3}Z$/, '.000Z');
  const url = `${NVD_API}?lastModStartDate=${encodeURIComponent(fmt(start))}&lastModEndDate=${encodeURIComponent(fmt(end))}&resultsPerPage=2000`;
  return await fetchJson(url, NVDPATH);
}

function fetchDailyHunt() {
  console.log('• TheRavenFile/Daily-Hunt (sparse git clone)');
  mkdirSync(DAILY_HUNT, { recursive: true });
  const r = spawnSync(
    'git',
    ['clone', '--depth=1', '--filter=blob:none', '--sparse', '--branch', 'main', DAILY_HUNT_REPO, DAILY_HUNT],
    { stdio: 'inherit' }
  );
  if (r.status !== 0) {
    throw new Error('git clone failed for TheRavenFile/Daily-Hunt');
  }
  // We want everything except the NPM Supply Chain nested folder (giant).
  execSync('git sparse-checkout set --skip-checks "NPM Supply Chain Attack - 2025 Sept"', {
    cwd: DAILY_HUNT,
    stdio: 'inherit',
  });
}

async function fetchAwesomeLists() {
  console.log(`• mthcht/awesome-lists detection CSVs (${DETECTION_LISTS.length} lists)`);
  mkdirSync(AWESOME_LISTS, { recursive: true });
  let ok = 0;
  let fail = 0;
  for (const { sourceFile } of DETECTION_LISTS) {
    const url = `${AWESOME_LISTS_RAW_BASE}/${sourceFile}`;
    const dest = join(AWESOME_LISTS, sourceFile);
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': 'pranithjain-threat-intel-sync/1.0 (+https://pranithjain.qzz.io)' },
      });
      if (!res.ok) {
        console.warn(`  ⚠ ${sourceFile} → ${res.status}`);
        fail += 1;
        continue;
      }
      const text = await res.text();
      writeFileSync(dest, text);
      ok += 1;
    } catch (err) {
      console.warn(`  ⚠ ${sourceFile} fetch failed: ${err instanceof Error ? err.message : err}`);
      fail += 1;
    }
  }
  console.log(`    ${ok} downloaded, ${fail} failed`);
}

async function fetchArgusTrending() {
  console.log('• Argus trending feed');
  // Optional — Argus may be unreachable; we continue with partial data.
  // Build script handles a missing argus-trending.json gracefully.
  const dest = join(STAGING, 'argus-trending.json');
  try {
    const res = await fetch(ARGUS_TRENDING_URL, {
      headers: { 'user-agent': 'pranithjain-threat-intel-sync/1.0 (+https://pranithjain.qzz.io)' },
    });
    if (!res.ok) {
      console.warn(`  ⚠ Argus returned ${res.status} — skipping trending data`);
      return;
    }
    const text = await res.text();
    writeFileSync(dest, text);
    console.log(`    wrote ${text.length} bytes to ${dest}`);
  } catch (err) {
    console.warn(`  ⚠ Argus fetch failed: ${err instanceof Error ? err.message : err}`);
  }
}

async function main() {
  console.log('Threat Intel sync — staging into', STAGING);
  ensureStaging();

  // Order: CISA KEV (small, fast) → NVD (rate-limited, slow) → Daily-Hunt (git)
  //        → awesome-lists CSVs → Argus trending.
  // If any fails, the user keeps the previous good data because the
  // build script reads from staging only when it exists.
  await fetchKev();
  await fetchNvdRecent();
  fetchDailyHunt();
  await fetchAwesomeLists();
  await fetchArgusTrending();

  console.log('\n✔ Staged. Next: node scripts/build-threat-intel.mjs');
}

main().catch((err) => {
  console.error('✘ sync failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
