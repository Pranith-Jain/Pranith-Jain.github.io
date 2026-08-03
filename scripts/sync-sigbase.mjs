#!/usr/bin/env node
/**
 * Re-fetch the Neo23x0/signature-base content from the upstream GitHub repo
 * into ./signature-base-replication/.
 *
 * Source: github.com/Neo23x0/signature-base (DRL 1.1)
 * Replication folder: signature-base-replication/
 *
 * Run this when you want to pick up upstream changes, then run
 * `node scripts/build-sigbase-manifest.mjs` to rebuild the
 * public/data/sigbase/ manifest that the Worker's MCP tools read.
 *
 * Excludes: tests/, vendor/, misc/, scripts/, .github/, sig-base-rules.csv
 * and other non-rule content. We only need yara/ and iocs/.
 */
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const REPO = join(ROOT, 'signature-base-replication');
const UPSTREAM = 'https://github.com/Neo23x0/signature-base.git';
const REF = 'master';

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

console.log('Configuring sparse-checkout (yara + iocs only)...');
execSync('git sparse-checkout set yara iocs', { cwd: REPO, stdio: 'inherit' });

console.log('✔ Clone complete. Next: node scripts/build-sigbase-manifest.mjs');
