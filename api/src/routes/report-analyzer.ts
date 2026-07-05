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
import { runReportAnalyzer, type AnalyzerInput, type AnalyzerOutput } from '../lib/report-analyzer';

const CACHE_TTL = 0; // never cache — the point of this endpoint is fresh analysis

export async function reportAnalyzerHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  let body: AnalyzerInput;
  try {
    body = await c.req.json<AnalyzerInput>();
  } catch {
    return c.json({ error: 'bad_request', message: 'invalid JSON body' }, 400);
  }
  if (!body.text && !body.url) {
    return c.json({ error: 'bad_request', message: 'requires text or url' }, 400);
  }
  if (body.text && body.text.length > 80_000) {
    return c.json({ error: 'bad_request', message: 'text exceeds 80KB' }, 413);
  }
  if (body.imageUrls && body.imageUrls.length > 8) {
    return c.json({ error: 'bad_request', message: 'max 8 imageUrls' }, 400);
  }

  try {
    const out: AnalyzerOutput = await runReportAnalyzer(body, c.env);
    return c.json(out, 200, { 'cache-control': `no-store, max-age=${CACHE_TTL}` });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ error: 'analysis_failed', message: msg }, 502);
  }
}
