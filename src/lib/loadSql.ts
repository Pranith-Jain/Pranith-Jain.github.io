/**
 * Lazy sql.js loader. The ~500 KB JS is dynamic-imported so it lands in
 * its own chunk — fetched only when a SQLite-backed tool page runs, never
 * in the main bundle. The wasm is emitted as a same-origin Vite asset
 * (URL only, not inlined into JS), so no CDN / connect-src change is
 * needed; the worker CSP only adds 'wasm-unsafe-eval' for WASM compile.
 */
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import type { SqlJsStatic } from 'sql.js';

let cached: Promise<SqlJsStatic> | null = null;

export function loadSql(): Promise<SqlJsStatic> {
  if (!cached) {
    cached = (async () => {
      const initSqlJs = (await import('sql.js')).default;
      return initSqlJs({ locateFile: () => wasmUrl as string });
    })();
  }
  return cached;
}
