#!/usr/bin/env node
/**
 * Preflight for the deploy pipeline: assert the Cloudflare credentials CI
 * depends on actually exist, BEFORE a push to `main` can report a green
 * "deploy" that shipped nothing.
 *
 * ## Why this exists
 *
 * `deploy.yml` used to skip the deploy with a `::warning::` when
 * `CLOUDFLARE_API_TOKEN` was absent. Every push to main then passed while the
 * Worker stayed on whatever version a local `wrangler deploy` had last
 * pushed. The failure was invisible in the checks list and only surfaced when
 * production stopped matching the repo.
 *
 * Two secrets were involved and BOTH were empty at the time:
 *
 *   CLOUDFLARE_API_TOKEN  — read by 12 workflows (deploy + the sync jobs)
 *   CF_API_TOKEN          — read by telegram-mtproto-sync only, never set
 *
 * GitHub will not let one secret read another, so the fix was to make
 * `CLOUDFLARE_API_TOKEN` the single canonical name (telegram-mtproto-sync now
 * maps from it). This script is the guard rail for that: run locally, or in
 * CI, and it fails loudly rather than letting a merge proceed on the
 * assumption that deployment works.
 *
 * ## Usage
 *
 *   node scripts/check-deploy-secrets.mjs            # check GitHub, exit 1 on failure
 *   node scripts/check-deploy-secrets.mjs --json     # machine-readable
 *
 * Skips (exit 0) when the `gh` CLI is unavailable or unauthenticated, so it is
 * safe to wire into a local pre-commit hook. Set REQUIRE_DEPLOY_SECRETS=1 to
 * make that case a failure instead.
 */
import { execFileSync } from 'node:child_process';

const REPO = process.env.GITHUB_REPOSITORY ?? 'Pranith-Jain/dfir-threat-intel-platform';
const CANONICAL = 'CLOUDFLARE_API_TOKEN';
const ALSO_NEEDED = ['CLOUDFLARE_ACCOUNT_ID'];
/** Legacy name that must NOT be relied on any more. */
const LEGACY = 'CF_API_TOKEN';

const asJson = process.argv.includes('--json');

function gh(args) {
  try {
    return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    return null;
  }
}

const authCheck = gh(['auth', 'status']);
if (authCheck === null) {
  const strict = process.env.REQUIRE_DEPLOY_SECRETS === '1';
  const msg = `Could not verify GitHub auth via the \`gh\` CLI — skipping secret check.`;
  if (asJson) console.log(JSON.stringify({ checked: false, reason: msg }));
  else console.log(`::notice::${msg}${strict ? '' : ' (set REQUIRE_DEPLOY_SECRETS=1 to fail)'}`);
  process.exit(strict ? 1 : 0);
}

const raw = gh(['secret', 'list', '-R', REPO]);
if (raw === null) {
  console.error(`::error::Could not list secrets for ${REPO}.`);
  process.exit(1);
}

const names = new Set(
  raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split(/\s+/)[0])
);

const present = (n) => names.has(n);
const missing = [CANONICAL, ...ALSO_NEEDED].filter((n) => !present(n));

if (asJson) {
  console.log(
    JSON.stringify({ checked: true, repo: REPO, secrets: [...names], missing, legacyPresent: present(LEGACY) })
  );
  process.exit(missing.length ? 1 : 0);
}

console.log(`Secrets on ${REPO}: ${[...names].sort().join(', ') || '(none)'}`);
console.log(`Canonical Cloudflare token (${CANONICAL}): ${present(CANONICAL) ? 'present' : 'MISSING'}`);

if (present(LEGACY)) {
  console.log(
    `::warning::${LEGACY} is also set. It is no longer read by any workflow ` +
      `(telegram-mtproto-sync now maps from ${CANONICAL}) and can be deleted.`
  );
}

if (missing.length) {
  console.error('');
  console.error(`::error::Missing required secret(s): ${missing.join(', ')}`);
  console.error('');
  console.error('A push to main will now FAIL at the deploy step (by design — a');
  console.error('green run that deploys nothing is worse than a red one). Until the');
  console.error('secret exists, deploy from a machine with wrangler credentials:');
  console.error('');
  console.error(`  gh secret set ${CANONICAL}   # needs Workers Scripts:Edit`);
  console.error('  npm run build && npx wrangler deploy');
  process.exit(1);
}

console.log('Deploy credentials look configured.');
