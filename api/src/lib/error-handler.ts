import type { Context } from 'hono';
import type { Env } from '../env';
import { safeErrorMessage } from './error';
import { internalError } from './api-error';

/**
 * OnError middleware for Hono. Catches any unhandled exception thrown
 * by route handlers and returns a consistent JSON error shape via
 * the api-error helpers.
 */
export function errorHandler(err: Error, c: Context<{ Bindings: Env }>): Response {
  return internalError(c, err);
}
