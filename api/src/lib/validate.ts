/**
 * Zod-based request validation middleware.
 *
 * Usage:
 *   import { z } from 'zod';
 *   import { validate } from '../lib/validate';
 *
 *   const schema = z.object({ email: z.string().email() });
 *   app.post('/api/v1/foo', validate('json', schema), handler);
 *
 *   // For raw-text bodies (email headers, STIX bundles, raw stealer logs):
 *   app.post('/api/v1/phishing/analyze',
 *     validateText(phishingEmailSchema, { maxBytes: 65536 }),
 *     phishingAnalyzeHandler);
 */

import type { Context, MiddlewareHandler, Next } from 'hono';
import type { Env } from '../env';
import type { ZodSchema } from 'zod';
import { validationError } from './api-error';
import { safeNullLog } from './safe-catch';

type Source = 'json' | 'query' | 'form';

/**
 * Returns a Hono middleware that validates the given source against the
 * supplied Zod schema. On failure, returns a 400 with per-field errors.
 */
export function validate<T>(source: Source, schema: ZodSchema<T>): MiddlewareHandler<{ Bindings: Env }> {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    let input: unknown;
    switch (source) {
      case 'json':
        input = await safeNullLog('parse-body-validate-json', c.req.json());
        break;
      case 'query':
        input = c.req.query();
        break;
      case 'form':
        input = await safeNullLog('parse-body-validate-form', c.req.parseBody());
        break;
    }

    const result = schema.safeParse(input);
    if (!result.success) {
      const fields: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const path = issue.path.join('.');
        if (!fields[path]) fields[path] = issue.message;
      }
      return validationError(c, fields);
    }

    // Attach parsed body so handlers don't re-parse.
    (c as Context & { parsed: T }).parsed = result.data;
    await next();
  };
}

export interface ValidateTextOptions {
  /** Max body size in bytes (default 1 MB). */
  maxBytes?: number;
  /** Min body size in bytes (default 1 — empty bodies are rejected). */
  minBytes?: number;
}

/**
 * Middleware for routes that read a raw text body (email headers, STIX
 * bundles, raw stealer logs, etc.) and want Zod-validated input attached
 * to `c.parsed` for the handler to consume.
 *
 * The schema is a Zod schema operating on a `string` (typically with
 * `.min/.max` length caps and `.refine` for content checks). On success
 * the validated string is attached as `c.parsed`; on failure a 400 with
 * per-field errors is returned (size caps surface as 413 instead).
 *
 * Sized in bytes, not characters — UTF-8 can encode one code point as
 * multiple bytes, and the worker's memory cost tracks bytes, not chars.
 *
 * Example:
 *   const emailSchema = z.string().min(1).max(65536);
 *   app.post('/api/v1/phishing/analyze',
 *     validateText(emailSchema, { maxBytes: 65536 }),
 *     (c) => {
 *       const text = (c as any).parsed as string;
 *       // …
 *     });
 */
export function validateText<T extends string>(
  schema: ZodSchema<T>,
  options: ValidateTextOptions = {}
): MiddlewareHandler<{ Bindings: Env }> {
  const maxBytes = options.maxBytes ?? 1024 * 1024;
  const minBytes = options.minBytes ?? 1;
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    let raw: string;
    try {
      raw = await c.req.text();
    } catch {
      return c.json({ error: 'invalid_request_body' }, 400);
    }
    const bytes = new Blob([raw]).size;
    if (bytes > maxBytes) {
      return c.json({ error: 'body_too_large', limit_bytes: maxBytes, observed_bytes: bytes }, 413);
    }
    if (bytes < minBytes) {
      return c.json({ error: 'body_too_small', min_bytes: minBytes, observed_bytes: bytes }, 400);
    }
    const result = schema.safeParse(raw);
    if (!result.success) {
      const fields: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const path = issue.path.join('.') || 'body';
        if (!fields[path]) fields[path] = issue.message;
      }
      return validationError(c, fields);
    }
    (c as Context & { parsed: T }).parsed = result.data;
    await next();
  };
}

/**
 * Read the validated body attached by `validate('json', ...)` or
 * `validateText(...)` middleware. Falls back to running the body through
 * the supplied fallback parser so handlers can still operate if the
 * middleware was skipped (e.g. in unit tests).
 */
export function getParsed<T>(c: Context<{ Bindings: Env }>, fallback: () => Promise<T> | T): Promise<T> {
  const fromMiddleware = (c as Context & { parsed?: T }).parsed;
  if (fromMiddleware !== undefined) return Promise.resolve(fromMiddleware);
  return Promise.resolve(fallback());
}
