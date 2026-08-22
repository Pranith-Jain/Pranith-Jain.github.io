/**
 * Deterministic observable extraction — REST surface for the fast
 * regex-based extractor in lib/ioc-extract-fast.ts.
 *
 * Endpoints (all under /api/v1/observables/):
 *   POST /observables/extract       — extract observables from { text }
 *   GET  /observables/extract/meta  — supported types + default limits
 *
 * Complements the AI-based IOC extraction route (ioc-extraction.ts): this
 * one is deterministic, free, and safe to call on untrusted-size inputs up
 * to MAX_TEXT_CHARS.
 */
import { Hono } from 'hono';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { badRequest, internalError, payloadTooLarge } from '../lib/api-error';
import {
  OBSERVABLE_TYPES,
  extractObservables,
  refangDefanged,
} from '../lib/ioc-extract-fast';

const MAX_TEXT_CHARS = 500_000;
const DEFAULT_MAX_HITS = 2000;
const DEFAULT_CONTEXT_CHARS = 40;
const HARD_MAX_HITS = 50_000;

interface ObservableExtractRequest {
  text?: string;
  maxHits?: number;
  contextChars?: number;
  /** Skip extraction — return only the refanged text. */
  refangOnly?: boolean;
}

export const observableExtractRouter = new Hono<{ Bindings: Env }>();

// ─── Extract ─────────────────────────────────────────────────────────────
observableExtractRouter.post('/observables/extract', async (c) => {
  try {
    const body = await c.req.json<ObservableExtractRequest>();
    if (!body.text?.trim()) return badRequest(c, 'missing text');
    if (body.text.length > MAX_TEXT_CHARS) {
      return payloadTooLarge(c, `text exceeds ${MAX_TEXT_CHARS} character limit`);
    }

    const started = Date.now();

    if (body.refangOnly) {
      const refanged = refangDefanged(body.text);
      return c.json({
        refangedText: refanged.text,
        refangedCount: refanged.count,
        elapsedMs: Date.now() - started,
      });
    }

    const maxHits =
      typeof body.maxHits === 'number' && Number.isFinite(body.maxHits)
        ? Math.min(Math.max(Math.floor(body.maxHits), 1), HARD_MAX_HITS)
        : DEFAULT_MAX_HITS;
    const contextChars =
      typeof body.contextChars === 'number' && Number.isFinite(body.contextChars)
        ? Math.min(Math.max(Math.floor(body.contextChars), 0), 500)
        : DEFAULT_CONTEXT_CHARS;

    const result = extractObservables(body.text, { maxHits, contextChars });
    return c.json({
      ...result,
      textLength: body.text.length,
      elapsedMs: Date.now() - started,
    });
  } catch (e) {
    logError('observable-extract error:', e);
    return internalError(c, `observable_extract_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Meta ────────────────────────────────────────────────────────────────
observableExtractRouter.get('/observables/extract/meta', async (c) => {
  try {
    return c.json({
      engine: 'regex-deterministic',
      types: OBSERVABLE_TYPES,
      defaults: {
        maxHits: DEFAULT_MAX_HITS,
        contextChars: DEFAULT_CONTEXT_CHARS,
      },
      limits: {
        maxTextChars: MAX_TEXT_CHARS,
        hardMaxHits: HARD_MAX_HITS,
      },
    });
  } catch (e) {
    logError('observable-extract meta failed', e);
    return internalError(c, `observable_extract_meta_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});
