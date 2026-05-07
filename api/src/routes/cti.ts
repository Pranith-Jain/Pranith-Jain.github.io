import type { Context } from 'hono';
import type { Env } from '../env';
import { parseStixBundle } from '../lib/stix-parse';

const MAX_BODY_BYTES = 1024 * 1024; // 1MB

export async function ctiParseHandler(c: Context<{ Bindings: Env }>) {
  const text = await c.req.text();
  if (!text || text.trim().length === 0) {
    return c.json({ error: 'empty body' }, 400);
  }
  if (new Blob([text]).size > MAX_BODY_BYTES) {
    return c.json({ error: 'bundle too large (max 1MB)' }, 413);
  }
  let bundle: unknown;
  try {
    bundle = JSON.parse(text);
  } catch {
    return c.json({ error: 'invalid JSON' }, 400);
  }
  try {
    const parsed = parseStixBundle(bundle as never);
    return c.json(parsed);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'parse failed' }, 400);
  }
}
