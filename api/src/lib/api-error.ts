/**
 * Standardized API error helpers. Every route should use these instead
 * of ad-hoc `c.json(...)` so clients always see the same shape:
 *
 *   { error: "error_code", message: "human readable" }
 *
 * Optionally with a `fields` map for validation errors:
 *
 *   { error: "validation_error", message: "...", fields: { email: "invalid" } }
 */

import type { Context } from 'hono';
import type { Env } from '../env';
import { safeErrorMessage } from './error';

// safeErrorMessage expects Record<string, unknown>; bridge the type gap.
function safeMsg(env: Env, err: unknown): string {
  return safeErrorMessage(env as unknown as Record<string, unknown>, err);
}

export interface ApiErrorBody {
  error: string;
  message: string;
  fields?: Record<string, string>;
}

function headers(extra?: Record<string, string>): Record<string, string> {
  return { 'Cache-Control': 'no-store, max-age=0', ...extra };
}

/** 400 Bad Request — malformed input */
export function badRequest(c: Context<{ Bindings: Env }>, message = 'bad request'): Response {
  return c.json({ error: 'bad_request', message } as ApiErrorBody, 400, headers());
}

/** 400 with per-field error map */
export function validationError(
  c: Context<{ Bindings: Env }>,
  fields: Record<string, string>,
  message = 'validation failed'
): Response {
  return c.json({ error: 'validation_error', message, fields } as ApiErrorBody, 400, headers());
}

/** 401 Unauthorized — missing or invalid credentials */
export function unauthorized(c: Context<{ Bindings: Env }>, message = 'unauthorized'): Response {
  return c.json({ error: 'unauthorized', message } as ApiErrorBody, 401, headers());
}

/** 403 Forbidden — authenticated but not permitted */
export function forbidden(c: Context<{ Bindings: Env }>, message = 'forbidden'): Response {
  return c.json({ error: 'forbidden', message } as ApiErrorBody, 403, headers());
}

/** 404 Not Found */
export function notFound(c: Context<{ Bindings: Env }>, message = 'not found'): Response {
  return c.json({ error: 'not_found', message } as ApiErrorBody, 404, headers());
}

/** 429 Too Many Requests */
export function tooManyRequests(
  c: Context<{ Bindings: Env }>,
  message = 'rate limited',
  meta?: { limit?: number; windowSeconds?: number }
): Response {
  return c.json(
    { error: 'rate_limited', message, ...meta } as ApiErrorBody & typeof meta,
    429,
    headers({ 'retry-after': String(meta?.windowSeconds ?? 60) })
  );
}

/** 500 Internal Server Error — masks real error in production */
export function internalError(c: Context<{ Bindings: Env }>, err: unknown): Response {
  const message = safeMsg(c.env, err);
  return c.json({ error: 'internal_error', message } as ApiErrorBody, 500, headers());
}

/** 503 Service Unavailable — upstream dependency failed */
export function serviceUnavailable(c: Context<{ Bindings: Env }>, message = 'service unavailable'): Response {
  return c.json({ error: 'service_unavailable', message } as ApiErrorBody, 503, headers());
}
