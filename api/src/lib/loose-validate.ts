/**
 * Loose validation middleware — cheap, route-agnostic input guards.
 *
 * The router has ~284 handlers. Wiring an explicit Zod schema into each
 * one is a multi-PR effort and would still miss the long tail of "client
 * sent something weird → 500 from JSON.parse deep inside a provider
 * call". `looseValidation` closes that gap in one place by enforcing
 * three hard upper bounds on every `/api/v1/*` request before the route
 * handler runs:
 *
 *   1. **Query-string sanity** — at most 50 keys, each at most 1 KB.
 *      Catches `?indicator=` pastes of full RFC documents, `?q=` blobs
 *      that should have been a body, and crafted request lines meant to
 *      bloat memory.
 *   2. **URL length cap** — total request line at most 8 KB. CF Workers
 *      does not impose a hard server-side limit, but a 200 KB URL is
 *      almost certainly abuse.
 *   3. **Body size + shape** — POST/PUT/PATCH bodies at most
 *      `DEFAULT_MAX_BODY` (256 KB), and must be a JSON object/array or
 *      a text body. Stops a 50 MB raw-text POST from blowing CPU time
 *      on a single Workers invocation.
 *
 * Handlers that need stricter rules still use `validate('json'|'query',
 * schema)` from `./validate` for typed Zod parsing — looseValidation
 * runs *before* them, so the deeper validation is layered defence, not
 * a replacement.
 *
 * Why not just use Zod for everything? The audit asked for it, and we
 * are adding explicit Zod schemas to ~15 high-impact POSTs separately.
 * This middleware is the safety net for the remaining ~270 routes, in
 * particular the GETs that accept many optional query params where a
 * strict Zod schema would force a refactor of every caller.
 */

import type { Context, MiddlewareHandler, Next } from 'hono';
import type { Env } from '../env';
import { validationError } from './api-error';

const MAX_QUERY_KEYS = 50;
const MAX_QUERY_VALUE_BYTES = 1024; // 1 KB per value
const MAX_URL_BYTES = 8 * 1024; // 8 KB total request line
const DEFAULT_MAX_BODY = 256 * 1024; // 256 KB
const MAX_BODY_DEPTH = 10;

const METHODS_WITH_BODY = new Set(['POST', 'PUT', 'PATCH']);

function byteLength(s: string): number {
  return new Blob([s]).size;
}

/**
 * Walk a parsed JSON value and bound its depth. Returns the depth that
 * would be needed to fully recurse, or `max + 1` if it exceeds `max`.
 * Cheap O(n) over the structure; works on objects + arrays uniformly.
 */
function jsonDepth(node: unknown, max: number, depth = 0): number {
  if (depth > max) return depth;
  if (node === null || typeof node !== 'object') return depth;
  let worst = depth;
  for (const v of Object.values(node as Record<string, unknown>)) {
    const d = jsonDepth(v, max, depth + 1);
    if (d > worst) worst = d;
    if (worst > max) return worst;
  }
  return worst;
}

/**
 * Cheap, route-agnostic input guard. Returns 400 with a stable error
 * shape `{ error, fields }` for any of the bounds above.
 */
export function looseValidation(options: { maxBodyBytes?: number } = {}): MiddlewareHandler<{ Bindings: Env }> {
  const maxBody = options.maxBodyBytes ?? DEFAULT_MAX_BODY;
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    // ── 1. URL/request-line length ─────────────────────────────────
    const urlBytes = byteLength(c.req.url);
    if (urlBytes > MAX_URL_BYTES) {
      return c.json(
        {
          error: 'request_uri_too_long',
          limit_bytes: MAX_URL_BYTES,
          observed_bytes: urlBytes,
        },
        414
      );
    }

    // ── 2. Query-string bounds ─────────────────────────────────────
    // `c.req.query()` returns a plain object — multi-value keys are
    // collapsed by Hono into an array, so iterate the raw entries
    // through `URLSearchParams` for a faithful count.
    const rawQs = c.req.url.includes('?') ? c.req.url.split('?').slice(1).join('?') : '';
    if (rawQs) {
      const params = new URLSearchParams(rawQs);
      if (params.size > MAX_QUERY_KEYS) {
        return c.json(
          {
            error: 'too_many_query_params',
            limit: MAX_QUERY_KEYS,
            observed: params.size,
          },
          400
        );
      }
      const fields: Record<string, string> = {};
      for (const [k, v] of params.entries()) {
        if (byteLength(v) > MAX_QUERY_VALUE_BYTES) {
          fields[k] = `value too long (max ${MAX_QUERY_VALUE_BYTES} bytes)`;
        }
        // Query keys are also bounded, since they're user-controlled
        // labels that flow into logs and error messages.
        if (byteLength(k) > 128) {
          fields[k || '<empty>'] = 'key too long (max 128 bytes)';
        }
      }
      if (Object.keys(fields).length > 0) {
        return validationError(c, fields);
      }
    }

    // ── 3. Body bounds for mutating methods ─────────────────────────
    if (METHODS_WITH_BODY.has(c.req.method)) {
      const contentType = (c.req.header('content-type') ?? '').toLowerCase();
      // Binary/multipart uploads (e.g. malware-vault, CAPE submit) are governed
      // by the per-route size cap in the handler — skip BOTH this Content-Length
      // pre-check and the body-text parse below, so a legitimate sample over the
      // 256 KB text cap isn't rejected here before the handler can enforce its
      // own (larger) limit.
      const isMultipart = contentType.includes('multipart/form-data');
      const contentLength = Number(c.req.header('content-length') ?? '0');
      // Reject early on a declared Content-Length over the cap without
      // buffering the body — `Number.isFinite` guards against bogus
      // values like '0' (zero-length body is allowed) or NaN.
      if (!isMultipart && Number.isFinite(contentLength) && contentLength > maxBody) {
        return c.json({ error: 'body_too_large', limit_bytes: maxBody, observed_bytes: contentLength }, 413);
      }
      // For JSON bodies, also parse and depth-check. We buffer the body
      // through `c.req.text()` so the actual handler can still re-parse
      // it (Hono caches the underlying request body, so this is one
      // read, not two). We only do this for `application/json` (and
      // missing content-type, which we treat permissively as text/json);
      // for binary uploads (e.g. malware-vault) we trust the per-route
      // size cap that runs in the handler.
      if (
        !isMultipart &&
        (contentType.includes('application/json') || contentType === '' || contentType.includes('text/'))
      ) {
        let raw: string;
        try {
          raw = await c.req.text();
        } catch {
          return c.json({ error: 'invalid_request_body' }, 400);
        }
        const bytes = byteLength(raw);
        if (bytes > maxBody) {
          return c.json({ error: 'body_too_large', limit_bytes: maxBody, observed_bytes: bytes }, 413);
        }
        if (contentType.includes('application/json') && raw.trim().length > 0) {
          let parsed: unknown;
          try {
            parsed = JSON.parse(raw);
          } catch {
            return c.json({ error: 'invalid_json' }, 400);
          }
          if (typeof parsed !== 'object' || parsed === null) {
            return c.json({ error: 'json_must_be_object_or_array' }, 400);
          }
          if (jsonDepth(parsed, MAX_BODY_DEPTH) > MAX_BODY_DEPTH) {
            return c.json({ error: 'json_too_deep', max_depth: MAX_BODY_DEPTH }, 400);
          }
        }
      }
    }

    await next();
  };
}
