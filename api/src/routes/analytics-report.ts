/**
 * POST /api/v1/analytics-report — cross-source correlation analytics report.
 *
 * Takes multiple AnalyzerOutput objects and produces a TI Mindmap HUB-style
 * rich markdown analytics report with merged IOCs, deduplicated TTPs,
 * correlated CVEs, and cross-source statistics.
 *
 * Body:
 *   title    - Report title
 *   sources  - Array of { title, url?, date, iocCount, ttpCount, cveCount }
 *   analyses - Array of AnalyzerOutput objects
 *   severity - Optional severity override
 *   tags     - Optional tags array
 */

import type { Context } from 'hono';
import type { Env } from '../env';
import type { AnalyzerOutput } from '../lib/report-analyzer';
import { buildAnalyticsReport } from '../lib/analytics-report-builder';

interface AnalyticsReportBody {
  title: string;
  sources: Array<{
    title: string;
    url?: string;
    date: string;
    iocCount: number;
    ttpCount: number;
    cveCount: number;
  }>;
  analyses: AnalyzerOutput[];
  severity?: string;
  tags?: string[];
  classification?: string;
}

export async function analyticsReportHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  let body: AnalyticsReportBody;
  try {
    body = await c.req.json<AnalyticsReportBody>();
  } catch (_catchErr) {
    console.error('analyticsReportHandler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return c.json({ error: 'bad_request', message: 'invalid JSON body' }, 400);
  }

  if (!body.title || !body.analyses || body.analyses.length === 0) {
    return c.json({ error: 'bad_request', message: 'requires title and at least one analysis' }, 400);
  }

  if (body.analyses.length > 25) {
    return c.json({ error: 'bad_request', message: 'max 25 analyses per report' }, 413);
  }

  try {
    const md = buildAnalyticsReport({
      title: body.title,
      sources:
        body.sources ??
        body.analyses.map((a, i) => ({
          title: a.title || `Source ${i + 1}`,
          date: a.generatedAt.slice(0, 10),
          iocCount: a.iocs.length,
          ttpCount: a.ttp.length,
          cveCount: a.cves.length,
        })),
      analyses: body.analyses,
      severity: body.severity,
      tags: body.tags,
      classification: body.classification,
    });
    return c.json({ markdown: md }, 200);
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ error: 'build_failed', message: msg }, 500);
  }
}
