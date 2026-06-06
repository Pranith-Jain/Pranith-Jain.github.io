/**
 * Performance budget checker.
 *
 * Reads build output from dist/ and checks JS/CSS bundle sizes
 * against defined budgets. Exits with code 1 when a budget is
 * exceeded.
 *
 * Usage: node scripts/check-budgets.mjs
 */

import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, '..', 'dist');

const BUDGETS = {
  'vendor-react-*.js': { uncompressed: 80_000, gzip: 28_000 },
  'vendor-icons-*.js': { uncompressed: 130_000, gzip: 38_000 },
  'index-*.js': { uncompressed: 280_000, gzip: 92_000 },
  'index-*.css': { uncompressed: 168_000, gzip: 26_000 },
  'vendor-xyflow-*.js': { uncompressed: 180_000, gzip: 58_000 },
  'vendor-maps-*.js': { uncompressed: 110_000, gzip: 38_000 },
  'vendor-md-*.js': { uncompressed: 70_000, gzip: 24_000 },
};

function globMatch(pattern, name) {
  const reStr = '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.') + '$';
  return new RegExp(reStr).test(name);
}

function main() {
  const assetsDir = join(distDir, 'assets');
  let files;
  try {
    files = readdirSync(assetsDir);
  } catch {
    console.log('No dist/assets/ found — skipping budget check.');
    process.exit(0);
  }

  let failed = 0;
  for (const [pattern, limits] of Object.entries(BUDGETS)) {
    const matches = files.filter((f) => globMatch(pattern, f));
    if (matches.length === 0) {
      console.log(`  \u26a0  ${pattern} — no matching file`);
      continue;
    }
    for (const match of matches) {
      const buf = readFileSync(join(assetsDir, match));
      const raw = buf.length;
      const gz = gzipSync(buf).length;

      if (raw > limits.uncompressed) {
        console.log(`  \u2717  ${match}: ${(raw / 1000).toFixed(1)}KB raw (limit ${(limits.uncompressed / 1000).toFixed(1)}KB)`);
        failed++;
      }
      if (gz > limits.gzip) {
        console.log(`  \u2717  ${match}: ${(gz / 1000).toFixed(1)}KB gzip (limit ${(limits.gzip / 1000).toFixed(1)}KB)`);
        failed++;
      }
      if (raw <= limits.uncompressed && gz <= limits.gzip) {
        console.log(`  \u2713  ${match}: ${(raw / 1000).toFixed(1)}KB raw / ${(gz / 1000).toFixed(1)}KB gzip`);
      }
    }
  }

  if (failed > 0) {
    console.log(`\n\u2717 ${failed} budget(s) exceeded.`);
    process.exit(1);
  }
  console.log('\n\u2713 All budgets within limits.');
}

main();
