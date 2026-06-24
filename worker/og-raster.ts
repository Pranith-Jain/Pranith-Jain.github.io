/**
 * SVG → PNG rasterisation for OG cards, using @resvg/resvg-wasm.
 *
 * Why this exists: X (Twitter) and LinkedIn crawlers do NOT render an
 * `og:image` that points at an SVG — they need a raster format. The card
 * generator in `og-image.ts` emits SVG; this module turns it into a PNG so
 * the link-unfurl card actually shows, and so the same bytes can be uploaded
 * as post media.
 *
 * Wasm loading: resvg's wasm is imported as a build-time module (`index_bg.wasm`).
 * On Cloudflare Workers that is the ONLY allowed path — runtime
 * `WebAssembly.instantiate()` from fetched bytes is blocked ("Wasm code
 * generation disallowed by embedder"), so the earlier ASSETS-fetch approach
 * failed in prod (but passed dry-run + Node, which both allow it). The wasm
 * therefore counts toward the Worker bundle. The brand fonts are NOT wasm, so
 * they stay as static assets fetched at runtime and memoised per isolate.
 */
import { Resvg } from '@resvg/resvg-wasm';
import type { Env } from './env';
import { ensureResvgWasm } from './resvg-shared';

/** Internal origin for ASSETS lookups — only the pathname is significant. */
const ASSET_ORIGIN = 'https://og-assets.internal';

let fontBuffers: Uint8Array[] | null = null;

async function assetBytes(env: Env, path: string): Promise<Uint8Array> {
  const res = await env.ASSETS.fetch(new Request(`${ASSET_ORIGIN}${path}`));
  if (!res.ok) throw new Error(`og asset ${path} -> HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function ensureFonts(env: Env): Promise<Uint8Array[]> {
  if (!fontBuffers) {
    fontBuffers = await Promise.all([assetBytes(env, '/og/hanken-700.ttf'), assetBytes(env, '/og/hanken-400.ttf')]);
  }
  return fontBuffers;
}

/**
 * Rasterise an SVG string to a 1200-wide PNG. Text is rendered with the
 * bundled Hanken Grotesk; any unmatched font-family in the SVG falls back to
 * it via `defaultFontFamily`, so the card never renders blank glyphs.
 */
export async function svgToPng(env: Env, svg: string): Promise<Uint8Array> {
  await ensureResvgWasm();
  const fonts = await ensureFonts(env);
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1200 },
    font: {
      fontBuffers: fonts,
      loadSystemFonts: false,
      defaultFontFamily: 'Hanken Grotesk',
    },
  });
  return resvg.render().asPng();
}
