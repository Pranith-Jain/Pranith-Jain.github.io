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
import { Resvg, initWasm } from '@resvg/resvg-wasm';
import resvgWasm from '@resvg/resvg-wasm/index_bg.wasm';
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
 * Initialise resvg from the pre-compiled wasm Module exactly once per isolate.
 * `initWasm` throws if called twice, so the in-flight promise is memoised; on
 * failure the slot is cleared so a transient error can be retried.
 */
function ensureWasm(): Promise<void> {
  if (!wasmReady) {
    wasmReady = initWasm(resvgWasm).catch((err) => {
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
  await ensureWasm();
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
