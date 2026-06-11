/**
 * SVG → PNG rasterisation for OG cards, using @resvg/resvg-wasm.
 *
 * Why this exists: X (Twitter) and LinkedIn crawlers do NOT render an
 * `og:image` that points at an SVG — they need a raster format. The card
 * generator in `og-image.ts` emits SVG; this module turns it into a PNG so
 * the link-unfurl card actually shows, and so the same bytes can be uploaded
 * as post media.
 *
 * Bundle budget: the resvg wasm (~2.4 MB) and the brand fonts are served as
 * STATIC ASSETS (`/og/*` via the ASSETS binding) and fetched at runtime, NOT
 * imported into the Worker script. That keeps them off the Worker bundle-size
 * budget; they are loaded once per isolate and memoised below.
 */
import { Resvg, initWasm } from '@resvg/resvg-wasm';
import type { Env } from './env';

/** Internal origin for ASSETS lookups — only the pathname is significant. */
const ASSET_ORIGIN = 'https://og-assets.internal';

let wasmReady: Promise<void> | null = null;
let fontBuffers: Uint8Array[] | null = null;

async function assetBytes(env: Env, path: string): Promise<Uint8Array> {
  const res = await env.ASSETS.fetch(new Request(`${ASSET_ORIGIN}${path}`));
  if (!res.ok) throw new Error(`og asset ${path} -> HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Initialise the resvg wasm exactly once per isolate. `initWasm` throws if
 * called twice, so the in-flight promise is memoised; on failure the slot is
 * cleared so a transient ASSETS hiccup can be retried on the next request.
 */
function ensureWasm(env: Env): Promise<void> {
  if (!wasmReady) {
    wasmReady = initWasm(env.ASSETS.fetch(new Request(`${ASSET_ORIGIN}/og/resvg.wasm`))).catch((err) => {
      wasmReady = null;
      throw err;
    });
  }
  return wasmReady;
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
  await ensureWasm(env);
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
