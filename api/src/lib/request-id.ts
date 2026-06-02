import type { Context, Next } from 'hono';
import type { Env } from '../env';

/**
 * Per-request correlation ID.
 *
 * The outer Worker (`worker/index.ts`) generates a 128-bit hex request ID
 * and sets the `x-request-id` response header. For /api/v1/* calls it
 * reads (or generates) the same header and surfaces it on the Hono
 * context so handlers can log it, include it in error responses, and
 * propagate it through to upstream API calls.
 *
 * Inbound requests without `x-request-id` get a freshly-minted one — the
 * Worker is the only mandatory source. The middleware respects an
 * inbound header (e.g. an operator's curl with `-H 'x-request-id: …'`)
 * so distributed traces survive hand-driven reproductions.
 *
 * Stored on `c.get('requestId')` and reflected on the response header
 * `x-request-id` regardless of which path took the request. Hono's
 * `c.var` typing is constrained, so we use a typed key getter below.
 */

const HEADER = 'x-request-id';

function newRequestId(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export type RequestIdVar = { requestId: string };

/**
 * Read-only accessor for handlers. Returns the request ID set by the
 * request-id middleware, or a fresh fallback if the middleware was
 * skipped (shouldn't happen on /api/v1/*, but safe in case the route
 * is registered on a different prefix).
 */
export function getRequestId(c: Context<{ Bindings: Env }>): string {
  return ((c as unknown as { get: (k: 'requestId') => string }).get('requestId') as string) || newRequestId();
}

export async function requestId(c: Context<{ Bindings: Env }>, next: Next): Promise<Response | void> {
  const inbound = c.req.header(HEADER);
  const id = inbound && /^[a-zA-Z0-9_-]{8,128}$/.test(inbound) ? inbound : newRequestId();
  (c as unknown as { set: (k: 'requestId', v: string) => void }).set('requestId', id);

  // Add to response. The Worker also sets it, but setting it on the
  // apiApp response means the header is present even if a future
  // refactor bypasses the outer worker (e.g. a local dev server
  // mounting apiApp directly). Idempotent — both writes produce the
  // same value.
  await next();
  c.res.headers.set(HEADER, id);
}
