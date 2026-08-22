/**
 * Sample submission REST surface.
 *
 * GET  /sample-submission/providers            — configured providers
 * POST /sample-submission/upload               { dataBase64, filename?, providers? }
 * POST /sample-submission/status               { virustotalAnalysisId?, sha256? }
 */
import { Hono } from 'hono';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { badRequest, internalError, serviceUnavailable } from '../lib/api-error';
import { submitSample, getSubmissionStatus, submissionProviders } from '../lib/sample-submission';

export const sampleSubmissionRouter = new Hono<{ Bindings: Env }>();

sampleSubmissionRouter.get('/sample-submission/providers', (c) => {
  return c.json({ providers: submissionProviders(c.env) });
});

sampleSubmissionRouter.post('/sample-submission/upload', async (c) => {
  try {
    let body: { dataBase64?: unknown; filename?: unknown; providers?: unknown };
    try {
      body = (await c.req.json()) as typeof body;
    } catch {
      return badRequest(c, 'invalid JSON');
    }
    if (!body.dataBase64 || typeof body.dataBase64 !== 'string') return badRequest(c, 'dataBase64 required');
    if (!c.env.VT_API_KEY && !c.env.HYBRID_ANALYSIS_API_KEY) {
      return serviceUnavailable(c, 'no analysis provider configured — set VT_API_KEY and/or HYBRID_ANALYSIS_API_KEY');
    }
    const providers = Array.isArray(body.providers)
      ? body.providers.map(String).filter(Boolean).slice(0, 2)
      : undefined;
    const r = await submitSample(
      { VT_API_KEY: c.env.VT_API_KEY, HYBRID_ANALYSIS_API_KEY: c.env.HYBRID_ANALYSIS_API_KEY },
      { dataBase64: body.dataBase64, filename: typeof body.filename === 'string' ? body.filename : undefined },
      { ...(providers ? { providers } : {}) }
    );
    if (!r.ok) return badRequest(c, r.error);
    return c.json(r);
  } catch (e) {
    logError('sample upload failed', e);
    return internalError(c, `upload_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

sampleSubmissionRouter.post('/sample-submission/status', async (c) => {
  try {
    let body: { virustotalAnalysisId?: unknown; sha256?: unknown };
    try {
      body = (await c.req.json()) as typeof body;
    } catch {
      return badRequest(c, 'invalid JSON');
    }
    const vtId = typeof body.virustotalAnalysisId === 'string' ? body.virustotalAnalysisId.trim() : '';
    const sha = typeof body.sha256 === 'string' ? body.sha256.trim().toLowerCase() : '';
    if (!vtId && !sha) return badRequest(c, 'virustotalAnalysisId and/or sha256 required');
    if (sha && !/^[0-9a-f]{64}$/.test(sha)) return badRequest(c, 'sha256 must be 64 hex chars');
    const r = await getSubmissionStatus(
      { VT_API_KEY: c.env.VT_API_KEY, HYBRID_ANALYSIS_API_KEY: c.env.HYBRID_ANALYSIS_API_KEY },
      { ...(vtId ? { virustotalAnalysisId: vtId.slice(0, 120) } : {}), ...(sha ? { sha256: sha } : {}) }
    );
    if (!r.ok) return internalError(c, `status_failed: ${r.error}`);
    return c.json(r);
  } catch (e) {
    logError('sample status failed', e);
    return internalError(c, `status_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});
