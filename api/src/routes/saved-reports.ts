/**
 * /api/v1/saved-reports — CRUD for saved report analyzer results.
 *
 * GET  /api/v1/saved-reports          — list saved reports (newest first)
 * GET  /api/v1/saved-reports/:id      — get a single saved report
 * POST /api/v1/saved-reports          — save a new report
 * DELETE /api/v1/saved-reports/:id    — delete a saved report
 */

import type { Context } from 'hono';
import type { Env } from '../env';

function uuid(): string {
  return crypto.randomUUID();
}

function now(): string {
  return new Date().toISOString();
}

/** List saved reports. */
export async function listSavedReports(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB!;
  const { results } = await db
    .prepare('SELECT id, title, source_url, text_length, ioc_count, ttp_count, cve_count, created_at FROM saved_reports ORDER BY created_at DESC LIMIT 50')
    .all();
  return c.json({ reports: results });
}

/** Get a single saved report. */
export async function getSavedReport(c: Context<{ Bindings: Env }>): Promise<Response> {
  const id = c.req.param('id');
  const db = c.env.BRIEFINGS_DB!;
  const row = await db.prepare('SELECT * FROM saved_reports WHERE id = ?').bind(id).first();
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json(row);
}

/** Save a new report. */
export async function saveReport(c: Context<{ Bindings: Env }>): Promise<Response> {
  let body: { title?: string; sourceUrl?: string; sourceText?: string; reportJson: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'bad_request', message: 'invalid JSON' }, 400);
  }
  if (!body.reportJson) {
    return c.json({ error: 'bad_request', message: 'reportJson required' }, 400);
  }

  let report: Record<string, unknown>;
  try {
    report = JSON.parse(body.reportJson);
  } catch {
    return c.json({ error: 'bad_request', message: 'reportJson is not valid JSON' }, 400);
  }

  const id = uuid();
  const title = body.title ?? (report.title as string) ?? 'Untitled';
  const sourceUrl = body.sourceUrl ?? (report.url as string) ?? null;
  const sourceText = body.sourceText ?? (report.sourceText as string) ?? null;
  const textLength = (report.textLength as number) ?? 0;
  const elapsedMs = (report.elapsed_ms as number) ?? 0;
  const iocCount = Array.isArray(report.iocs) ? (report.iocs as unknown[]).length : 0;
  const ttpCount = Array.isArray(report.ttp) ? (report.ttp as unknown[]).length : 0;
  const cveCount = Array.isArray(report.cves) ? (report.cves as unknown[]).length : 0;

  const db = c.env.BRIEFINGS_DB!;
  await db
    .prepare(
      'INSERT INTO saved_reports (id, title, source_url, source_text, report_json, text_length, elapsed_ms, ioc_count, ttp_count, cve_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(id, title, sourceUrl, sourceText, body.reportJson, textLength, elapsedMs, iocCount, ttpCount, cveCount, now())
    .run();

  return c.json({ id, title, created_at: now() }, 201);
}

/** Delete a saved report. */
export async function deleteSavedReport(c: Context<{ Bindings: Env }>): Promise<Response> {
  const id = c.req.param('id');
  const db = c.env.BRIEFINGS_DB!;
  await db.prepare('DELETE FROM saved_reports WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
}
