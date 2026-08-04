/**
 * /api/v1/report-analyzer — the unified per-report AI extraction endpoint
 * backing the /threatintel/report-analyzer page.
 *
 * Accepts a URL, raw text, or both. Optionally takes image URLs to OCR
 * for embedded IOCs. Runs the four heavy AI branches in parallel
 * (summary, TTP, 5W, image-OCR) with a per-branch timeout, then runs
 * the deterministic IOC/CVE/entity extraction synchronously, then
 * builds the STIX bundle last. Total budget is ~28s; per-branch
 * timeouts prevent one slow LLM from blocking the rest of the payload.
 *
 * Non-streaming for now (LLM tokens don't stream in this codebase's
 * `runCompletion` wrapper). The page just shows a loading state.
 */
import type { Context } from 'hono';
import type { Env } from '../env';
import { badRequest, notFound, internalError, badGateway, serviceUnavailable, unauthorized, conflict, payloadTooLarge } from '../lib/api-error';
import { runReportAnalyzer, type AnalyzerInput, type AnalyzerOutput } from '../lib/report-analyzer';

const CACHE_TTL = 0; // never cache — the point of this endpoint is fresh analysis

export async function reportAnalyzerHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  let body: AnalyzerInput;
  try {
    body = await c.req.json<AnalyzerInput>();
  } catch (_catchErr) {
    console.error('reportAnalyzerHandler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return badRequest(c, 'invalid JSON body');
  }
  if (!body.text && !body.url) {
    return badRequest(c, 'requires text or url');
  }
  if (body.text && body.text.length > 80_000) {
    return payloadTooLarge(c, 'text exceeds 80KB');
  }
  if (body.imageUrls && body.imageUrls.length > 8) {
    return badRequest(c, 'max 8 imageUrls');
  }

  try {
    const out: AnalyzerOutput = await runReportAnalyzer(body, c.env);
    return c.json(out, 200, { 'cache-control': `no-store, max-age=${CACHE_TTL}` });
  } catch (e) {
    console.error('reportAnalyzerHandler failed:', e instanceof Error ? e.message : String(e));
    const msg = e instanceof Error ? e.message : String(e);
    return badGateway(c, msg);
  }
}
