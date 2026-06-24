/**
 * Shim for worker/resvg-shared.ts in the api/ compilation unit.
 *
 * api/src/lib/social-carousel-raster.ts is a symlink to
 * worker/social-carousel-raster.ts. That file imports './resvg-shared',
 * which TypeScript resolves (from the symlink's perspective) to this file.
 *
 * At runtime the Worker bundle contains the real implementation from
 * worker/resvg-shared.ts. This file exists only to satisfy tsc under
 * api/tsconfig.json — it is never executed independently.
 */
export { ensureResvgWasm } from '../../../worker/resvg-shared';
