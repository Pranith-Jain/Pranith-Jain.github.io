/**
 * SVG → PNG rasterisation for Security Investigator dashboards.
 *
 * Why this exists separately from `og-raster.ts`:
 *   - OG cards are fixed at 1200x630 and use a single bundled font
 *     (Hanken Grotesk). SI dashboards are configurable — the upstream
 *     svg-widgets.yaml declares a canvas width/height, and the renderer
 *     emits text in "Segoe UI, Roboto, sans-serif" by default.
 *   - We need a default font (Hanken Grotesk is fine — it's a free
 *     neo-grotesque with broad Unicode coverage) and a configurable
 *     output width so the same SVG can be rasterised at the canvas
 *     width, or scaled up for higher-DPI embeds.
 *   - The /api/v1/si/render?format=png route uses this so clients (e.g.
 *     readme thumbnails, GitHub social previews) can drop the PNG
 *     straight into a markdown card.
 *
 * Wasm loading mirrors `og-raster.ts` — the wasm is bundled, the font
 * is fetched from ASSETS at runtime and memoised per isolate.
 */
import { Resvg, initWasm } from '@resvg/resvg-wasm';
import resvgWasm from '@resvg/resvg-wasm/index_bg.wasm';
import type { Env } from '../env';

/** Internal origin for ASSETS lookups — only the pathname is significant. */
const ASSET_ORIGIN = 'https://si-png-assets.internal';

let wasmReady: Promise<void> | null = null;
let fontBuffers: Uint8Array[] | null = null;

async function assetBytes(env: Env, path: string): Promise<Uint8Array> {
  const res = await env.ASSETS.fetch(new Request(`${ASSET_ORIGIN}${path}`));
  if (!res.ok) throw new Error(`si-png asset ${path} -> HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

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
    // Reuse the OG-card font set. Both weights exist as TTF and have
    // broad Latin coverage; resvg's font matching falls back to the
    // first buffer for unmatched families.
    fontBuffers = await Promise.all([assetBytes(env, '/og/hanken-700.ttf'), assetBytes(env, '/og/hanken-400.ttf')]);
  }
  return fontBuffers;
}

export interface SvgToPngOptions {
  /** Output width in CSS pixels. The height is derived from the SVG's
   *  intrinsic viewBox / width-height ratio. Default: 1400 (matches the
   *  default canvas.width in upstream svg-widgets.yaml). */
  width?: number;
  /** Override the default font family resvg falls back to when the
   *  SVG references an unmatched family (e.g. "Segoe UI"). Default
   *  "Hanken Grotesk" — same as the OG rasteriser. */
  defaultFontFamily?: string;
  /** Background colour. resvg fills transparent regions with this.
   *  Default: "#0d1117" (matches the upstream canvas.background). */
  background?: string;
}

/**
 * Rasterise an SVG string to PNG bytes.
 *
 * Throws if the SVG is empty or if wasm / font loading fails. Callers
 * (the /api/v1/si/render route and the si_render_png MCP tool) should
 * wrap the call in try/catch and surface a structured error.
 */
export async function svgDashboardToPng(env: Env, svg: string, opts: SvgToPngOptions = {}): Promise<Uint8Array> {
  if (!svg || svg.length < 32) {
    throw new Error('svg_to_png: empty or too-short svg input');
  }
  await ensureWasm();
  const fonts = await ensureFonts(env);
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: opts.width ?? 1400 },
    font: {
      fontBuffers: fonts,
      loadSystemFonts: false,
      defaultFontFamily: opts.defaultFontFamily ?? 'Hanken Grotesk',
    },
    background: opts.background ?? '#0d1117',
  });
  return resvg.render().asPng();
}
