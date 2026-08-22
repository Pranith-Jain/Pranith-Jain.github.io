#!/usr/bin/env node
/**
 * Upload the build-time page OG PNGs (.og-cache/pages/*.png, from
 * scripts/generate-page-og.mjs) into the KV_CACHE namespace under
 * `ogpage:v1:<dot-id>.png`.
 *
 * The runtime handler (worker/og-route.ts) reads these keys FIRST — serving
 * a card costs one KV read instead of an in-Worker resvg rasterization,
 * which is what kept tripping X's crawler (10ms-CPU cold rasterizations +
 * per-colo cache misses → failed image fetch → X caches the failure for
 * days and renders the image-less fallback chip).
 *
 * Runs as part of `npm run deploy` (after build, before wrangler deploy)
 * so every deployment has its full set of cards in KV before going live.
 *
 * Requires CLOUDFLARE_API_TOKEN (same secret wrangler deploy uses).
 * Free-plan KV write budget: 1,000 writes/day — ~261 uploads/day fits.
 */
import { readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(root, '.og-cache', 'pages');
const CONCURRENCY = 6;

let files;
try {
  files = readdirSync(DIR).filter((f) => f.endsWith('.png'));
} catch {
  console.log('  no .og-cache/pages — run scripts/generate-page-og.mjs first');
  process.exit(0);
}
if (files.length === 0) {
  console.log('  no page OG cards to upload');
  process.exit(0);
}

console.log(`Uploading ${files.length} page OG cards to KV_CACHE…`);
let done = 0;
let failed = 0;
const failures = [];

async function upload(file) {
  const key = `ogpage:v1:${file}`;
  const path = join(DIR, file);
  try {
    execSync(`npx wrangler kv key put ${JSON.stringify(key)} --path ${JSON.stringify(path)} --binding KV_CACHE --remote`, {
      cwd: root,
      stdio: ['ignore', 'ignore', 'ignore'],
      timeout: 60_000,
    });
    done += 1;
    if (done % 25 === 0) console.log(`  ${done}/${files.length}`);
  } catch (e) {
    failed += 1;
    failures.push(file);
    console.warn(`  ✗ ${file}: ${e.message?.split('\n')[0] ?? e}`);
  }
}

// Simple concurrency pool.
let idx = 0;
async function worker() {
  while (idx < files.length) {
    const f = files[idx++];
    await upload(f);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

console.log(`Uploaded ${done}/${files.length} (${failed} failed)`);
if (failed > 0 && done === 0) {
  // Total failure = likely missing/invalid token; block the deploy so we
  // don't ship a version whose cards can't render.
  console.error('::error::all OG card uploads failed — aborting deploy');
  process.exit(1);
}
