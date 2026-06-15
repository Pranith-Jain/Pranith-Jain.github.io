#!/usr/bin/env node
/**
 * Re-fetch the security-investigator content from the upstream GitHub repo
 * into ./security-investigator-replication/.
 *
 * Source: github.com/SCStelz/security-investigator (MIT)
 * Replication folder: security-investigator-replication/
 *
 * Run this when you want to pick up upstream changes, then run
 * `node scripts/build-si-manifest.mjs` to rebuild the public/data/si/
 * manifest that the Worker's MCP tools read.
 *
 * Excludes the heavyweight report_generator.py + mcp-apps/ + LICENSE +
 * README.md (we keep our own README + CATALOG inside the folder).
 */
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const REPO = join(ROOT, 'security-investigator-replication');
const UPSTREAM = 'https://github.com/SCStelz/security-investigator.git';
const REF = 'main';

if (existsSync(REPO)) {
  console.log(`Removing existing ${REPO}...`);
  rmSync(REPO, { recursive: true });
}

console.log(`Cloning ${UPSTREAM} (sparse, ${REF})...`);
const r = spawnSync('git', [
  'clone', '--depth=1', '--filter=blob:none', '--sparse', '--branch', REF, UPSTREAM, REPO,
], { stdio: 'inherit' });
if (r.status !== 0) {
  console.error('✘ git clone failed');
  process.exit(1);
}

console.log('Configuring sparse-checkout...');
execSync('git sparse-checkout set .github scripts queries reports automations docs', { cwd: REPO, stdio: 'inherit' });

console.log('✔ Clone complete. Next: node scripts/build-si-manifest.mjs');
