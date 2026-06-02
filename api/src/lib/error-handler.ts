import type { Context } from 'hono';
import type { Env } from '../env';
import { internalError } from './api-error';
import { getRequestId } from './request-id';

/**
 * OnError middleware for Hono. Catches any unhandled exception thrown
 * by route handlers and returns a consistent JSON error shape via
 * the api-error helpers.
 *
 * Logs the error with request context so operators can diagnose failures
 * from Workers Logs / `wrangler tail` without needing to reproduce. The
 * `request_id` field is the same `x-request-id` returned in the response
 * header, so a single grep turns the operator's failed-request header
 * into the corresponding error log.
 */
export function errorHandler(err: Error, c: Context<{ Bindings: Env }>): Response {
  // Structured log — grep-friendly, doesn't leak upstream response bodies.
  console.error(
    JSON.stringify({
      level: 'error',
      request_id: getRequestId(c),
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      error: err.message,
      name: err.name,
      status: (err as Error & { status?: number }).status ?? 500,
    })
  );

  return internalError(c, err);
}
