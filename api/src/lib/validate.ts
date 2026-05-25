/**
 * Zod-based request validation middleware.
 *
 * Usage:
 *   import { z } from 'zod';
 *   import { validate } from '../lib/validate';
 *
 *   const schema = z.object({ email: z.string().email() });
 *   app.post('/api/v1/foo', validate('json', schema), handler);
 */

import type { Context, MiddlewareHandler, Next } from 'hono';
import type { Env } from '../env';
import type { ZodSchema } from 'zod';
import { validationError } from './api-error';

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
        input = await c.req.json().catch(() => null);
        break;
      case 'query':
        input = c.req.query();
        break;
      case 'form':
        input = await c.req.parseBody().catch(() => null);
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
