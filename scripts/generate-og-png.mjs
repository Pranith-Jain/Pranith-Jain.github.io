#!/usr/bin/env node
/**
 * Convert every public/og-*.svg → matching public/og-*.png at 1200×630.
 *
 * Why: Twitter/X cards do not render SVG og:images. Discord, Slack, and
 * iMessage handle SVG fine, but for Twitter compatibility we ship the
 * PNG alongside and point og:image at it.
 *
 * Three OG variants ship: the portfolio default (og-image), the threat-
 * intel platform (og-threatintel), and the DFIR toolkit (og-dfir). The
 * worker swaps the og:image meta tag per route so a share-preview of
 * /threatintel doesn't show the portfolio card and vice versa.
 *
 * Sharp uses librsvg for SVG rasterization. Webfonts referenced inside
 * the SVG (Newsreader / Inter) fall back to system serif/sans if the
 * font files aren't installed locally — which is acceptable; the layout
 * still reads correctly, just with a system-typeface substitution.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

/**
 * SVG→PNG pairs. Each base name maps to the file pair (og-<base>.svg →
 * og-<base>.png). The portfolio default uses the legacy 'og-image' name
 * to stay compatible with the existing index.html meta tag and any
 * external services that have already cached the URL.
 */
const VARIANTS = [
  { slug: 'og-image', label: 'portfolio (default)' },
  { slug: 'og-threatintel', label: '/threatintel' },
  { slug: 'og-dfir', label: '/dfir' },
];

for (const { slug, label } of VARIANTS) {
  const svgPath = resolve(ROOT, `public/${slug}.svg`);
  const pngPath = resolve(ROOT, `public/${slug}.png`);

  const svgBuffer = await readFile(svgPath);
  const pngBuffer = await sharp(svgBuffer, { density: 144 })
    .resize(1200, 630, { fit: 'fill' })
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(pngPath, pngBuffer);

  const sizeKB = (pngBuffer.length / 1024).toFixed(1);
  console.log(`✓ ${slug}.png written (${sizeKB} KB)  · ${label}`);
}
