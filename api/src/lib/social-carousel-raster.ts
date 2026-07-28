/**
 * SVG → PNG rasterisation for 1080×1350 Instagram carousel slides.
 *
 * Mirrors og-raster.ts but at portrait width (1080 px) and with the Bricolage
 * Grotesque display font added alongside Hanken Grotesk. Uses the shared
 * ensureResvgWasm() so that og-raster and this module never double-init the
 * wasm module in the same isolate (initWasm throws on the second call).
 *
 * Brand fonts (all fetched from ASSETS at runtime, memoised per isolate):
 *   - bricolage-700.ttf  — display headings
 *   - hanken-700.ttf     — sub-headings / bold body
 *   - hanken-400.ttf     — body copy
 */
import { Resvg } from '@resvg/resvg-wasm';
import type { Env } from './env';
import { ensureResvgWasm } from './resvg-shared';

const ASSET_ORIGIN = 'https://og-assets.internal';

let fontBuffers: Uint8Array[] | null = null;

async function assetBytes(env: Env, path: string): Promise<Uint8Array> {
  const res = await env.ASSETS.fetch(new Request(`${ASSET_ORIGIN}${path}`));
  if (!res.ok) throw new Error(`carousel asset ${path} -> HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function ensureFonts(env: Env): Promise<Uint8Array[]> {
  if (!fontBuffers) {
    fontBuffers = await Promise.all([
      assetBytes(env, '/og/bricolage-700.ttf'),
      assetBytes(env, '/og/hanken-700.ttf'),
      assetBytes(env, '/og/hanken-400.ttf'),
    ]);
  }
  return fontBuffers;
}

/**
 * Rasterise a carousel SVG to a 1080-wide PNG.
 *
 * Text is rendered with the bundled fonts (Bricolage Grotesque 700 for display,
 * Hanken Grotesk 700/400 for body). Any unmatched font-family in the SVG falls
 * back to Hanken Grotesk via `defaultFontFamily`.
 */
export async function carouselSlideToPng(env: Env, svg: string): Promise<Uint8Array> {
  await ensureResvgWasm();
  const fonts = await ensureFonts(env);
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1080 },
    font: {
      fontBuffers: fonts,
      loadSystemFonts: false,
      defaultFontFamily: 'Hanken Grotesk',
    },
  });
  return resvg.render().asPng();
}
