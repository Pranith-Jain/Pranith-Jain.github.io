// Rasterize the LinkedIn cover SVGs → PNGs at 1584×396, embedding the brand
// Hanken Grotesk fonts (same buffers the live OG cards use).
// Renders both themes: docs/linkedin-cover-{dark,light}.svg → .png
// Run: node scripts/render-cover.mjs
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

await initWasm(readFileSync(join(root, 'node_modules/@resvg/resvg-wasm/index_bg.wasm')));

const fontBuffers = [
  readFileSync(join(root, 'public/og/hanken-700.ttf')),
  readFileSync(join(root, 'public/og/hanken-400.ttf')),
];

for (const [theme, bg] of [['dark', '#0b1120'], ['light', '#ffffff']]) {
  const svg = readFileSync(join(root, `docs/linkedin-cover-${theme}.svg`), 'utf-8');
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1584 },
    font: { fontBuffers, defaultFontFamily: 'Hanken Grotesk', loadSystemFonts: true },
    background: bg,
  });
  const png = resvg.render().asPng();
  const out = join(root, `docs/linkedin-cover-${theme}.png`);
  writeFileSync(out, png);
  console.log(`✓ ${theme.padEnd(5)} → ${out} (${(png.length / 1024).toFixed(1)} KB, 1584×396)`);
}
