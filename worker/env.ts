/**
 * Worker environment type.
 *
 * The canonical Env type lives in `api/src/env.ts` — it is the superset of
 * all bindings used by both the API routes and the Worker outer layer.
 * This file re-exports it for backward compatibility with worker/* imports.
 */
export type { Env } from '../api/src/env';
