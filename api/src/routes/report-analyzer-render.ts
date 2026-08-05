/**
 * POST /api/v1/report-analyzer/render
 *
 * Takes an AnalyzerOutput (or raw report text) and returns a
 * TI Mindmap HUB-style rich markdown report.
 *
 * Body options:
 *   output  - An existing AnalyzerOutput object (required)
 *   severity - Optional severity override
 *   tags     - Optional tag array
 *   tlp      - Optional TLP classification
 */

import type { Context } from 'hono';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { badRequest, notFound, internalError, badGateway, serviceUnavailable, tooManyRequests, conflict, payloadTooLarge } from '../lib/api-error';
import type { AnalyzerOutput } from '../lib/report-analyzer';
import { renderReportMarkdown } from '../lib/report-analyzer-markdown';

export async function reportAnalyzerRenderHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  let body: {
    output?: AnalyzerOutput;
    severity?: string;
    tags?: string[];
    tlp?: string;
  };
  try {
    body = await c.req.json();
  } catch (_catchErr) {
    logError('reportAnalyzerRenderHandler failed', _catchErr);
    return badRequest(c, 'invalid JSON body');
  }

  if (!body.output) {
    return badRequest(c, 'requires output field');
  }

  try {
    const md = renderReportMarkdown(body.output, {
      severity: body.severity,
      tags: body.tags,
      tlp: body.tlp,
      author: 'Report Analyzer',
    });
    // Return JSON so MCP's apiFetch (which always calls res.json()) can
    // consume it. The SPA also calls this endpoint and reads res.text().
    // A raw text/markdown response would fail the MCP tool's json() parse.
    return c.json({ markdown: md }, 200);
  } catch (e) {
    logError('reportAnalyzerRenderHandler failed', e);
    const msg = e instanceof Error ? e.message : String(e);
    return internalError(c, msg);
  }
}
