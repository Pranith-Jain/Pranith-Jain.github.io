/**
 * Shim for worker/env.ts in the api/ compilation unit.
 *
 * api/src/lib/social-carousel-raster.ts is a symlink to
 * worker/social-carousel-raster.ts. That file imports './env', which
 * TypeScript resolves (from the symlink's perspective) to this file.
 *
 * The worker Env adds ASSETS (required) on top of the api Env. The route
 * uses `c.env as Parameters<typeof carouselSlideToPng>[0]` to cast at the
 * call-site — safe because the Worker runtime always has ASSETS bound.
 *
 * This file is never executed independently; it exists only to satisfy tsc
 * under api/tsconfig.json.
 */
import type { Env as ApiEnv } from '../env';

/**
 * Env shape as seen by the carousel rasteriser — the api Env plus the ASSETS
 * binding that the Worker always has. The route casts `c.env` to this type;
 * safe because the Worker runtime always binds ASSETS.
 *
 * We use `& { ASSETS: Fetcher }` (intersection) rather than `extends` to avoid
 * the "incorrectly extends" error from the narrower fetch-only literal type.
 */
export type Env = ApiEnv & { ASSETS: Fetcher };
