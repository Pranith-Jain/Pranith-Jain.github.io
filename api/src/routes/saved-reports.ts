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
import { logError } from '../lib/logger';
import { badRequest, notFound } from '../lib/api-error';

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
  const row = await db
    .prepare(
      'SELECT id, title, source_url, source_text, report_json, text_length, elapsed_ms, ioc_count, ttp_count, cve_count, created_at FROM saved_reports WHERE id = ?'
    )
    .bind(id)
    .first();
  if (!row) return notFound(c, 'not_found');
  return c.json(row);
}

/** Save a new report. */
export async function saveReport(c: Context<{ Bindings: Env }>): Promise<Response> {
  let body: { title?: string; sourceUrl?: string; sourceText?: string; reportJson: string };
  try {
    body = await c.req.json();
  } catch (_catchErr) {
    logError('saveReport failed', _catchErr);
    return badRequest(c, 'invalid JSON');
  }
  if (!body.reportJson) {
    return badRequest(c, 'reportJson required');
  }

  let report: Record<string, unknown>;
  try {
    report = JSON.parse(body.reportJson);
  } catch (_catchErr) {
    logError('saveReport failed', _catchErr);
    return badRequest(c, 'reportJson is not valid JSON');
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
    return badRequest(c, 'iocs array required');
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
      logError('getTimeline failed', _catchErr);
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

// ── Sharing + branding (Fleet-parity: branded reports, artifact sharing) ──

/** Normalize + validate a branding payload. Returns null when invalid. */
export function normalizeBranding(input: unknown): Record<string, string> | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;
  const out: Record<string, string> = {};
  const allowed: Array<[string, number]> = [
    ['orgName', 120],
    ['logoUrl', 500],
    ['accent', 40],
    ['footer', 300],
    ['classification', 60],
  ];
  for (const [key, max] of allowed) {
    const v = (input as Record<string, unknown>)[key];
    if (typeof v === 'string' && v.trim()) {
      // logoUrl/accent get light scheme validation; others are plain text
      if ((key === 'logoUrl' || key === 'accent') && /^javascript:/i.test(v.trim())) return null;
      out[key] = v.trim().slice(0, max);
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

function shareToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** POST /saved-reports/:id/branding { branding: {...} } — set/clear branding. */
export async function setBranding(c: Context<{ Bindings: Env }>): Promise<Response> {
  const id = c.req.param('id');
  let body: { branding?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return badRequest(c, 'invalid JSON');
  }
  const branding = body.branding === null ? {} : normalizeBranding(body.branding);
  if (branding === null) {
    return badRequest(
      c,
      'branding must be an object with optional keys: orgName, logoUrl, accent, footer, classification'
    );
  }
  const db = c.env.BRIEFINGS_DB!;
  const res = await db
    .prepare('UPDATE saved_reports SET branding_json = ? WHERE id = ?')
    .bind(Object.keys(branding).length ? JSON.stringify(branding) : null, id)
    .run();
  if (!res.success) return badRequest(c, 'update failed');
  return c.json({ ok: true, branding });
}

/** POST /saved-reports/:id/share — mint (or re-mint) a public share token. */
export async function shareSavedReport(c: Context<{ Bindings: Env }>): Promise<Response> {
  const id = c.req.param('id');
  const db = c.env.BRIEFINGS_DB!;
  const row = await db.prepare('SELECT id FROM saved_reports WHERE id = ?').bind(id).first();
  if (!row) return notFound(c, 'not_found');
  const token = shareToken();
  await db.prepare('UPDATE saved_reports SET share_token = ?, shared_at = ? WHERE id = ?').bind(token, now(), id).run();
  return c.json({ ok: true, token, url: `/share/report/${token}`, data_url: `/api/v1/public/report/${token}`, shared_at: now() });
}

/** DELETE /saved-reports/:id/share — revoke the share link. */
export async function unshareSavedReport(c: Context<{ Bindings: Env }>): Promise<Response> {
  const id = c.req.param('id');
  const db = c.env.BRIEFINGS_DB!;
  await db.prepare('UPDATE saved_reports SET share_token = NULL, shared_at = NULL WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
}

/**
 * GET /share/report/:token — PUBLIC read-only render payload. Auth is the
 * capability token itself (32 hex chars); mounted OUTSIDE /api/v1 so it
 * bypasses the API-key gate. Only shares rows with a non-null token.
 */
export async function getSharedReport(c: Context<{ Bindings: Env }>): Promise<Response> {
  const token = c.req.param('token') ?? '';
  if (!/^[0-9a-f]{32}$/.test(token)) return notFound(c, 'not_found');
  const db = c.env.BRIEFINGS_DB!;
  const row = await db
    .prepare(
      `SELECT id, title, source_url, report_json, text_length, ioc_count, ttp_count, cve_count,
              branding_json, created_at, shared_at
       FROM saved_reports WHERE share_token = ?`
    )
    .bind(token)
    .first();
  if (!row) return notFound(c, 'not_found');
  let report: unknown = null;
  try {
    report = JSON.parse((row.report_json as string) ?? 'null');
  } catch {
    report = null;
  }
  let branding: unknown = null;
  try {
    branding = row.branding_json ? JSON.parse(row.branding_json as string) : null;
  } catch {
    branding = null;
  }
  return c.json({
    title: row.title,
    source_url: row.source_url,
    report,
    branding,
    counts: {
      iocs: row.ioc_count ?? 0,
      ttps: row.ttp_count ?? 0,
      cves: row.cve_count ?? 0,
      textLength: row.text_length ?? 0,
    },
    created_at: row.created_at,
    shared_at: row.shared_at,
  });
}
