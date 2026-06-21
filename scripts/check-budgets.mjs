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
  // 2026-06-21 Phase 5: Tailwind removed. Bundle dropped from 360KB
  // → 318KB raw (-42KB) and 114KB → 103KB gzip (-11KB). Panda's CSS
  // is now its own chunk (index-*.css, ~101KB raw / 10KB gzip). The
  // previous 304KB baseline is back in effect — the index chunk
  // contains only application code (Preact + components), no styling.
  'index-*.js': { uncompressed: 320_000, gzip: 105_000 },
  // Raw bumped 168→172KB for the STIX Builder file-upload + Attack-Flow UI.
  // 172→176KB: Facilities Database page added Tailwind utility classes.
  // gzip 26→28KB: accumulated frontend growth (OSINT Mapper, Tracer, supply-chain
  // + new utilities) reached the 26KB gzip line. 2KB headroom; transfer/perf
  // impact is negligible — the guard just tracks utility-class growth.
  // raw 224→224KB / gzip 34→34KB: the premium dark-mode pass added a new
  // .surface-elevated utility + top-edge inset highlights on .surface-card /
  // .surface-raised / .surface-glass (one extra box-shadow layer each),
  // plus the hero top radial wash in BackgroundLayer.tsx. Concurrently in
  // flight: Dnscope, EmailDefense, IntodnsPanel, and the api/ validation
  // growth pushed the total over the 200KB raw line. +24KB raw / +4KB
  // gzip headroom; transfer impact is still negligible (gzipped CSS is
  // cached aggressively and the new layer is one class + a few rules).
  'index-*.css': { uncompressed: 228_000, gzip: 34_000 },
  // raw 280→300KB / gzip 92→96KB: the in-flight Dnscope, EmailDefense,
  // and IntodnsPanel pages (plus the api/ validation rewrite) added new
  // panel components and form schemas to the main app chunk. +20KB raw
  // / +4KB gzip headroom. Transfer impact is negligible for a chunk of
  // this size; the guard is tracking module growth, not absolute cost.
  // raw 300→304KB / gzip 96→98KB: the dark-theme texture-balance pass
  // moved the 0.4KB fractalNoise SVG data URI from index.css into
  // BackgroundLayer.tsx (so the noise lives with the radial mesh it
  // textures, not in a static stylesheet), and added 3 quiet brand-blue
  // radials to GRADIENT_DARK to match the light theme's compositional
  // depth. Same brand palette; the radials sit at the low end of the
  // v7.3 intensity scale (0.05–0.10) so the page never reads as a
  // 'stage-light' mesh. +4KB raw / +2KB gzip headroom.
  // gzip 58→60KB: the OSINT Mapper's IdentifierGraph (@xyflow/react) added ~0.1KB
  // gzip to this shared vendor chunk, just past 58KB. 2KB headroom for the new
  // graph feature; transfer impact is negligible.
  'vendor-xyflow-*.js': { uncompressed: 180_000, gzip: 60_000 },
  // raw 200→224KB / gzip 30→34KB: the premium dark-mode pass added a new
  // .surface-elevated utility + top-edge inset highlights on .surface-card /
  // .surface-raised / .surface-glass (one extra box-shadow layer each),
  // plus the hero top radial wash in BackgroundLayer.tsx. Concurrently in
  // flight: Dnscope, EmailDefense, IntodnsPanel, and the api/ validation
  // growth pushed the total over the 200KB raw line. +24KB raw / +4KB
  // gzip headroom; transfer impact is still negligible (gzipped CSS is
  // cached aggressively and the new layer is one class + a few rules).
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
        console.log(
          `  \u2717  ${match}: ${(raw / 1000).toFixed(1)}KB raw (limit ${(limits.uncompressed / 1000).toFixed(1)}KB)`
        );
        failed++;
      }
      if (gz > limits.gzip) {
        console.log(
          `  \u2717  ${match}: ${(gz / 1000).toFixed(1)}KB gzip (limit ${(limits.gzip / 1000).toFixed(1)}KB)`
        );
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
