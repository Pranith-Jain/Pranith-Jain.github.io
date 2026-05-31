/**
 * API Versioning Middleware
 *
 * Supports two versioning strategies:
 *   1. URL path: /api/v1/..., /api/v2/...
 *   2. Accept header: Accept: application/vnd.pranithjain.v1+json
 *
 * The current version is v1. When a new version is introduced:
 *   - Old versions are supported for a deprecation period
 *   - Deprecation warnings are added to response headers
 *   - Clients can migrate at their own pace
 *
 * Usage:
 *   import { apiVersion, CURRENT_VERSION } from '../lib/api-version';
 *   app.use('/api/*', apiVersion);
 */

import type { Context, MiddlewareHandler, Next } from 'hono';
import type { Env } from '../env';

/** Current API version. */
export const CURRENT_VERSION = 1;

/** Minimum supported version. Versions below this return 410 Gone. */
export const MIN_SUPPORTED_VERSION = 1;

/** Version deprecation schedule: version → sunset date (ISO 8601). */
export const VERSION_SUNSET: Record<number, string> = {
  // Example: 1: '2027-01-01', — uncomment when v2 is released
};

/**
 * Extract API version from the request.
 *
 * Priority:
 *   1. URL path: /api/v2/...
 *   2. Accept header: Accept: application/vnd.pranithjain.v2+json
 *   3. X-API-Version header
 *   4. Default: CURRENT_VERSION
 */
function extractVersion(c: Context<{ Bindings: Env }>): number {
  // 1. URL path
  const pathMatch = /\/api\/v(\d+)\//.exec(c.req.url);
  if (pathMatch) return parseInt(pathMatch[1]!, 10);

  // 2. Accept header
  const accept = c.req.header('accept') ?? '';
  const acceptMatch = /application\/vnd\.pranithjain\.v(\d+)\+json/i.exec(accept);
  if (acceptMatch) return parseInt(acceptMatch[1]!, 10);

  // 3. X-API-Version header
  const headerVersion = c.req.header('x-api-version');
  if (headerVersion) {
    const v = parseInt(headerVersion, 10);
    if (!isNaN(v)) return v;
  }

  // 4. Default
  return CURRENT_VERSION;
}

/**
 * API versioning middleware.
 *
 * - Validates the requested version
 * - Adds version info to response headers
 * - Adds deprecation warnings for old versions
 * - Rejects unsupported versions
 */
export const apiVersion: MiddlewareHandler<{ Bindings: Env }> = async (c: Context<{ Bindings: Env }>, next: Next) => {
  const version = extractVersion(c);

  // Reject versions below minimum.
  if (version < MIN_SUPPORTED_VERSION) {
    return c.json(
      {
        error: 'gone',
        message: `API v${version} is no longer supported. Minimum supported version: v${MIN_SUPPORTED_VERSION}`,
        current_version: CURRENT_VERSION,
        min_supported: MIN_SUPPORTED_VERSION,
      },
      410
    );
  }

  // Reject future versions (client is ahead of server).
  if (version > CURRENT_VERSION) {
    return c.json(
      {
        error: 'bad_request',
        message: `API v${version} is not yet available. Current version: v${CURRENT_VERSION}`,
        current_version: CURRENT_VERSION,
      },
      400
    );
  }

  // Set version headers on response.
  await next();

  c.res.headers.set('X-API-Version', String(version));
  c.res.headers.set('X-API-Current-Version', String(CURRENT_VERSION));

  // Deprecation warning for old versions.
  const sunset = VERSION_SUNSET[version];
  if (sunset && version < CURRENT_VERSION) {
    const sunsetDate = new Date(sunset);
    const now = new Date();
    const daysUntilSunset = Math.ceil((sunsetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    c.res.headers.set('Deprecation', sunset);
    c.res.headers.set('Sunset', sunset);
    c.res.headers.set(
      'X-API-Deprecation-Notice',
      `API v${version} is deprecated and will be removed on ${sunset}. Please migrate to v${CURRENT_VERSION}.`
    );

    if (daysUntilSunset <= 0) {
      c.res.headers.set('Warning', '299 - "API version has passed sunset date"');
    }
  }
};
