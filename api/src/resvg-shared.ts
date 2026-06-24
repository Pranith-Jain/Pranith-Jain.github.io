/**
 * Shim for worker/resvg-shared.ts in the api/ compilation unit.
 *
 * worker/lib/si-svg-png.ts is symlinked to api/src/lib/si-svg-png.ts. That
 * file imports '../resvg-shared', which — from the symlink's perspective —
 * resolves to THIS file (api/src/resvg-shared.ts), the sibling of the
 * api/src/env.ts that satisfies its '../env' import the same way.
 *
 * At runtime the Worker bundle contains the real implementation from
 * worker/resvg-shared.ts (the single isolate-wide initWasm). This file
 * exists only to satisfy tsc under api/tsconfig.json — never executed here.
 *
 * NOTE: api/src/lib/resvg-shared.ts is a separate shim for the OTHER worker
 * rasteriser (worker/social-carousel-raster.ts, which sits at worker/ root
 * and imports './resvg-shared'). Two worker files at different depths import
 * the same shared module, so each needs an api-side shim at the matching
 * relative path. Both re-export from the one real worker/resvg-shared.ts.
 */
export { ensureResvgWasm } from '../../worker/resvg-shared';
