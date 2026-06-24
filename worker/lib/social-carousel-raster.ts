/**
 * Re-export from the parent worker module so this path (worker/lib/) has
 * the same relative-import resolution as the rest of the worker/lib/ files.
 *
 * The symlink api/src/lib/social-carousel-raster.ts → this file means the
 * api/ tsconfig resolves '../env' as api/src/env.ts (same as si-svg-png.ts
 * does for its '../env' import).
 */
export { carouselSlideToPng } from '../social-carousel-raster';
