/**
 * Shared resvg-wasm initialisation.
 *
 * `initWasm` from @resvg/resvg-wasm THROWS if called more than once per
 * isolate. Both og-raster.ts and social-carousel-raster.ts use the same wasm
 * module, so they must share a single memoised init promise — otherwise the
 * second module to initialise would throw "Already initialized" in production
 * when both are imported in the same isolate.
 *
 * Import `ensureResvgWasm()` from this module instead of calling `initWasm`
 * directly. Each rasteriser keeps its own font memoisation locally.
 */
import { initWasm } from '@resvg/resvg-wasm';
import resvgWasm from '@resvg/resvg-wasm/index_bg.wasm';

let wasmReady: Promise<void> | null = null;

/**
 * Initialise resvg from the pre-compiled wasm Module exactly once per isolate.
 * On transient failure the slot is cleared so a retry is possible.
 */
export function ensureResvgWasm(): Promise<void> {
  if (!wasmReady) {
    wasmReady = initWasm(resvgWasm).catch((err) => {
      wasmReady = null;
      throw err;
    });
  }
  return wasmReady;
}
