/**
 * Shared resvg WASM initialisation.
 *
 * Both og-raster.ts and si-svg-png.ts call `initWasm` on the same
 * @resvg/resvg-wasm bundle. `initWasm` throws on the second call, so the
 * initialisation state is shared here — whichever module calls `ensureWasm`
 * first wins; the second gets the same memoised promise.
 */
import { initWasm } from '@resvg/resvg-wasm';
import resvgWasm from '@resvg/resvg-wasm/index_bg.wasm';

let wasmReady: Promise<void> | null = null;

export function ensureWasm(): Promise<void> {
  if (!wasmReady) {
    wasmReady = initWasm(resvgWasm).catch((err) => {
      wasmReady = null;
      throw err;
    });
  }
  return wasmReady;
}
