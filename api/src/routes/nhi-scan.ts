/**
 * NHI Scanner — REST surface for the ported nhi-scan engine
 * (github.com/rpmsft9/nhi-scan, MIT).
 *
 * Endpoints (all under /api/v1/nhi/):
 *   POST /nhi/scan      — scan an NHI inventory → tiering + OWASP NHI findings
 *   GET  /nhi/catalog   — OWASP NHI Top 10 catalog + tiering-rule reference
 *
 * The engine is pure, deterministic local computation (no LLM, no upstream
 * calls), so a scan is a stateless POST. The body may be either the inventory
 * itself (a list of NHI records, or `{ "identities": [...] }`) or
 * `{ "inventory": <list|object>, "format": "json"|"markdown" }`.
 *
 * All routes are automatically key-gated by the global /api/v1/* auth
 * middleware (authenticate('external-only')) in api/src/index.ts.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { badRequest, internalError } from '../lib/api-error';

const ScanRequestSchema = z.object({
  inventory: z.unknown().optional(),
  format: z.enum(['json', 'markdown']).optional(),
});

async function loadNhiMod() {
  return await import('../lib/nhi-scan');
}

export const nhiScanRouter = new Hono<{ Bindings: Env }>();

/**
 * Extract the raw inventory from a parsed request body. Accepts either the
 * inventory itself (list or `{identities:[...]}`) or `{inventory: ...}`.
 */
function extractInventory(body: unknown): unknown {
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const obj = body as { inventory?: unknown; format?: unknown };
    if ('inventory' in obj) return obj.inventory;
  }
  return body;
}

nhiScanRouter.post('/nhi/scan', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return badRequest(c, 'invalid_json_body');
  }
  let parsed: { inventory?: unknown; format?: 'json' | 'markdown' } = {};
  if (body && typeof body === 'object' && !Array.isArray(body) && 'inventory' in (body as object)) {
    const res = ScanRequestSchema.safeParse(body);
    if (!res.success) return badRequest(c, `invalid_body: ${res.error.message}`);
    parsed = res.data;
  }
  const rawInventory = extractInventory(body);
  try {
    const mod = await loadNhiMod();
    const fleet = mod.parseFleet(rawInventory);
    const result = mod.scan(fleet);
    if (parsed.format === 'markdown') {
      return c.json({ format: 'markdown', markdown: mod.reportToMarkdown(result) });
    }
    return c.json(mod.reportToJson(result));
  } catch (e) {
    logError('nhi/scan failed', e);
    return internalError(c, `scan_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

nhiScanRouter.get('/nhi/catalog', async (c) => {
  try {
    const mod = await loadNhiMod();
    return c.json(mod.catalogSummary());
  } catch (e) {
    logError('nhi/catalog failed', e);
    return internalError(c, `catalog_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});
