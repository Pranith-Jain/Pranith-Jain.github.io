import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Env } from '../env';
import { safeErrorMessage } from './error';

export interface ApiError {
  error: string;
  detail?: string;
  code?: string;
}

export function errorResponse(
  c: Context<{ Bindings: Env }>,
  status: ContentfulStatusCode,
  error: string,
  detail?: string,
  code?: string
): Response {
  const body: ApiError = { error };
  if (detail !== undefined) body.detail = detail;
  if (code !== undefined) body.code = code;
  return c.json(body, status);
}

export function notFound(c: Context<{ Bindings: Env }>, resource: string): Response {
  return errorResponse(c, 404, 'not_found', `${resource} not found`);
}

export function badRequest(c: Context<{ Bindings: Env }>, detail: string, code?: string): Response {
  return errorResponse(c, 400, 'bad_request', detail, code);
}

export function serverError(c: Context<{ Bindings: Env }>, detail?: string): Response {
  const message = detail !== undefined ? detail : safeErrorMessage(c.env, 'server_error');
  return errorResponse(c, 500, 'server_error', message);
}
