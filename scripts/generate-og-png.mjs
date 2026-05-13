#!/usr/bin/env node
/**
 * Convert public/og-image.svg → public/og-image.png at 1200×630.
 *
 * Why: Twitter/X cards do not render SVG og:images. Discord, Slack, and
 * iMessage handle SVG fine, but for Twitter compatibility we ship the
 * PNG alongside and point og:image at it.
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

const SVG_PATH = resolve(ROOT, 'public/og-image.svg');
const PNG_PATH = resolve(ROOT, 'public/og-image.png');

const svgBuffer = await readFile(SVG_PATH);

const pngBuffer = await sharp(svgBuffer, { density: 144 })
  .resize(1200, 630, { fit: 'fill' })
  .png({ compressionLevel: 9 })
  .toBuffer();

await writeFile(PNG_PATH, pngBuffer);

const sizeKB = (pngBuffer.length / 1024).toFixed(1);
console.log(`✓ og-image.png written (${sizeKB} KB)`);
