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
    .prepare(
      'SELECT id, title, source_url, text_length, ioc_count, ttp_count, cve_count, created_at FROM saved_reports ORDER BY created_at DESC LIMIT 50'
    )
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
  } catch (_catchErr) {
    console.error('saveReport failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return c.json({ error: 'bad_request', message: 'invalid JSON' }, 400, { 'Cache-Control': 'no-store' });
  }
  if (!body.reportJson) {
    return c.json({ error: 'bad_request', message: 'reportJson required' }, 400, { 'Cache-Control': 'no-store' });
  }

  let report: Record<string, unknown>;
  try {
    report = JSON.parse(body.reportJson);
  } catch (_catchErr) {
    console.error('saveReport failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return c.json({ error: 'bad_request', message: 'reportJson is not valid JSON' }, 400, {
      'Cache-Control': 'no-store',
    });
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

/** Cross-report correlation — find IOCs that appear in multiple reports. */
export async function correlateIocs(c: Context<{ Bindings: Env }>): Promise<Response> {
  const body = await c.req.json<{ iocs: string[] }>();
  if (!body.iocs || !Array.isArray(body.iocs) || body.iocs.length === 0) {
    return c.json({ error: 'bad_request', message: 'iocs array required' }, 400, { 'Cache-Control': 'no-store' });
  }

  const db = c.env.BRIEFINGS_DB!;
  const correlations: Record<
    string,
    { count: number; reports: Array<{ id: string; title: string; created_at: string }> }
  > = {};

  // Search for each IOC in saved reports (limit to avoid query explosion).
  for (const ioc of body.iocs.slice(0, 20)) {
    const { results } = await db
      .prepare(
        `SELECT id, title, created_at, report_json FROM saved_reports
         WHERE report_json LIKE ? ORDER BY created_at DESC LIMIT 10`
      )
      .bind(`%${ioc}%`)
      .all();

    if (results.length > 1) {
      // Verify the IOC actually appears in the report JSON (not just partial match).
      const matches = results.filter((r) => {
        const json = r.report_json as string;
        return json.includes(ioc);
      });
      if (matches.length > 1) {
        correlations[ioc] = {
          count: matches.length,
          reports: matches.map((m) => ({
            id: m.id as string,
            title: m.title as string,
            created_at: m.created_at as string,
          })),
        };
      }
    }
  }

  return c.json({ correlations, searched: body.iocs.length });
}

/** Timeline — get all saved reports with their IOCs/TTPs for temporal visualization. */
export async function getTimeline(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB!;
  const { results } = await db
    .prepare(
      `SELECT id, title, source_url, created_at, ioc_count, ttp_count, cve_count, report_json
       FROM saved_reports ORDER BY created_at ASC LIMIT 50`
    )
    .all();

  const timeline = results.map((r) => {
    let iocs: Array<{ value: string; kind: string }> = [];
    let ttps: Array<{ id: string; name: string; tactic: string }> = [];
    let cves: Array<{ id: string }> = [];
    try {
      const report = JSON.parse(r.report_json as string);
      iocs = (report.iocs ?? []).slice(0, 20).map((i: { value: string; kind: string }) => ({
        value: i.value,
        kind: i.kind,
      }));
      ttps = (report.ttp ?? []).slice(0, 15).map((t: { id: string; name: string; tactic: string }) => ({
        id: t.id,
        name: t.name,
        tactic: t.tactic,
      }));
      cves = (report.cves ?? []).slice(0, 10).map((c: { id: string }) => ({ id: c.id }));
    } catch (_catchErr) {
      console.error('getTimeline failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
      /* ignore parse errors */
    }

    return {
      id: r.id as string,
      title: r.title as string,
      source_url: r.source_url as string | null,
      created_at: r.created_at as string,
      ioc_count: r.ioc_count as number,
      ttp_count: r.ttp_count as number,
      cve_count: r.cve_count as number,
      iocs,
      ttps,
      cves,
    };
  });

  // Find shared IOCs across reports.
  const iocMap = new Map<string, string[]>();
  for (const report of timeline) {
    for (const ioc of report.iocs) {
      const key = ioc.value.toLowerCase();
      if (!iocMap.has(key)) iocMap.set(key, []);
      iocMap.get(key)!.push(report.id);
    }
  }
  const sharedIocs = Array.from(iocMap.entries())
    .filter(([, ids]) => ids.length > 1)
    .map(([value, ids]) => ({ value, reportIds: ids }));

  return c.json({ timeline, sharedIocs });
}
