import type { Context } from 'hono';
import type { Env } from '../env';
import { parseStixBundle } from '../lib/stix-parse';
import { safeErrorMessage } from '../lib/error';

const MAX_BODY_BYTES = 1024 * 1024; // 1MB

/**
 * Accepts a raw STIX 2.1 bundle as the request body (Content-Type: application/json
 * or text/plain). Returns extracted indicators, threat actors, and relationships.
 *
 * Example body:
 *   { "type": "bundle", "id": "bundle--<uuid>", "objects": [ { "type": "indicator", ... }, ... ] }
 */
export async function ctiParseHandler(c: Context<{ Bindings: Env }>) {
  const text = await c.req.text();
  if (!text || text.trim().length === 0) {
    return c.json(
      {
        error: 'empty body',
        hint: 'POST a raw STIX 2.1 bundle JSON as the request body — see https://docs.oasis-open.org/cti/stix/v2.1/',
      },
      400
    );
  }
  if (new Blob([text]).size > MAX_BODY_BYTES) {
    return c.json({ error: 'bundle too large (max 1MB)' }, 413);
  }
  let bundle: unknown;
  try {
    bundle = JSON.parse(text);
  } catch {
    return c.json({ error: 'invalid JSON', hint: 'request body must be a STIX 2.1 bundle in JSON form' }, 400);
  }
  // Quick shape check before handing to the parser, so users get a clear message.
  if (
    !bundle ||
    typeof bundle !== 'object' ||
    (bundle as { type?: unknown }).type !== 'bundle' ||
    !Array.isArray((bundle as { objects?: unknown }).objects)
  ) {
    return c.json(
      {
        error: 'not a STIX 2.1 bundle',
        hint: 'expected { "type": "bundle", "objects": [ ... ] } at the top level',
      },
      400
    );
  }
  try {
    const parsed = parseStixBundle(bundle as never);
    // no-store: the user pasted a STIX bundle that may contain IOCs / actor
    // attributions they consider sensitive; don't let an intermediary cache it.
    return c.json(parsed, 200, { 'Cache-Control': 'no-store' });
  } catch (err) {
    return c.json(
      {
        error: 'failed to parse STIX bundle',
        detail: safeErrorMessage(c.env as unknown as Record<string, unknown>, err),
      },
      400
    );
  }
}
