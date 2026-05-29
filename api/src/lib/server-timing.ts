/**
 * Server-Timing header middleware.
 *
 * Injects a `Server-Timing` header on every API response with:
 *   - total: wall-clock time from request start to response
 *   - cf-cache: "HIT" or "MISS" (from cf-cache-status header)
 *
 * Allows clients and devtools to monitor API performance.
 */

import type { MiddlewareHandler } from 'hono';
import type { Env } from '../env';

export const serverTiming: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const start = Date.now();
  try {
    await next();
  } finally {
    const elapsed = Date.now() - start;
    const timings: string[] = [`total;dur=${elapsed}`];
    const cacheStatus = c.res.headers.get('cf-cache-status');
    if (cacheStatus) timings.push(`cf-cache;desc="${cacheStatus}"`);
    c.res.headers.set('Server-Timing', timings.join(', '));
  }
};
