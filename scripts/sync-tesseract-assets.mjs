#!/usr/bin/env node
/**
 * Copy the Tesseract runtime blobs out of node_modules into
 * `public/tesseract/`, which is where `src/pages/dfir/ScreenshotIntel.tsx`
 * points `workerPath` / `corePath` / `langPath`.
 *
 * ## Why this exists
 *
 * Those blobs used to be committed: ~7.9 MB of `*.wasm.js` plus
 * `worker.min.js`, all byte-identical copies of files that `tesseract.js` and
 * `tesseract.js-core` already ship. A vendored copy cannot drift-check
 * itself, and every `npm install` of a new tesseract left the committed copy
 * quietly stale — the page kept loading the old engine because the files were
 * right there in git.
 *
 * Copying at build time makes the npm version the single source of truth.
 *
 * ## What is NOT copied
 *
 * `eng.traineddata.gz` (~10.9 MB) is the English language model. No npm
 * package ships it — it comes from the upstream tessdata project — so it stays
 * committed. That is deliberate: `langPath` points at this directory, so the
 * model has to be present at build time without a network fetch.
 *
 * ## Failure is loud
 *
 * If the npm packages are missing or a file has been renamed upstream, this
 * exits non-zero rather than leaving a half-populated directory that produces
 * a site whose OCR silently 404s at runtime.
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const OUT = join(ROOT, 'public', 'tesseract');

/** [source path relative to node_modules, destination filename] */
const ASSETS = [
  ['tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js'],
  ['tesseract.js/dist/worker.min.js', 'worker.min.js'],
];

// The language model is intentionally absent — see the file header.
const VENDORED = ['eng.traineddata.gz'];

mkdirSync(OUT, { recursive: true });

let copied = 0;
let bytes = 0;

for (const [rel, name] of ASSETS) {
  const src = join(ROOT, 'node_modules', rel);

  if (!existsSync(src)) {
    console.error(
      `sync-tesseract-assets: missing ${rel}\n` +
        `  tesseract.js and tesseract.js-core are direct dependencies — run \`npm install\` first.`,
    );
    process.exit(1);
  }

  copyFileSync(src, join(OUT, name));
  const size = statSync(join(OUT, name)).size;
  copied += 1;
  bytes += size;
  console.log(`  ${name} (${(size / 1024 / 1024).toFixed(1)} MB)`);
}

for (const name of VENDORED) {
  if (!existsSync(join(OUT, name))) {
    console.error(
      `sync-tesseract-assets: ${name} is missing from ${OUT}.\n` +
        `  This language model is intentionally committed (no npm package ships it).` +
        ` Restore it with \`git checkout -- public/tesseract/${name}\`.`,
    );
    process.exit(1);
  }
}

console.log(
  `sync-tesseract-assets: ${copied} file(s), ${(bytes / 1024 / 1024).toFixed(1)} MB copied from node_modules`,
);