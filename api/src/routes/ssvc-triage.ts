/**
 * SSVC-V triage route.
 *
 * Computes Stakeholder-Specific Vulnerability Categorization (SSVC-V)
 * decisions for CVEs and persists them to alert_feeds.
 *
 * Endpoints:
 *   POST /api/v1/ssvc/triage       — compute SSVC-V for one CVE or batch of alerts
 *   GET  /api/v1/ssvc/triage/:id   — get stored SSVC-V decision from alert_feeds
 *   GET  /api/v1/ssvc/stats         — aggregate statistics over stored decisions
 */

import type { Context } from 'hono';
import type { Env } from '../env';
import { badRequest, internalError, notFound, serviceUnavailable } from '../lib/api-error';
import { computeSsvcV, type SsvcResult, type SsvcDecision } from '../lib/ssvc-v';

// ── Helpers ────────────────────────────────────────────────────────────

interface EnrichedCve {
  cve_id: string;
  cvssScore: number | null;
  epssScore: number | null;
  cisaKev: boolean;
  kevDate: string | null;
  ransomwareUse: boolean;
  exploitStatus: 'active' | 'poc' | 'none' | null;
  isPublicFacing: boolean | null;
  title: string;
}

/**
 * Enrich a CVE ID with all the data needed for SSVC-V.
 * Fetches from the existing CVE lookup path (KV cache + NVD + EPSS + KEV).
 */
async function enrichCve(cveId: string, env: Env): Promise<EnrichedCve | null> {
  const CVE_ANYWHERE = /CVE-\d{4}-\d{4,}/i;
  if (!CVE_ANYWHERE.test(cveId)) return null;

  const id = cveId.toUpperCase();
  const kv = env.KV_CACHE;
  if (!kv) return null;

  function toEnriched(data: Record<string, unknown>): EnrichedCve {
    const cvssScore = ((data.cvss as Record<string, unknown>)?.score as number) ?? null;
    const epssScore = ((data.epss as Record<string, unknown>)?.score as number) ?? null;
    const kevData = data.kev as Record<string, unknown> | undefined;
    const cisaKev = kevData?.in_kev === true;
    const kevDate = cisaKev ? ((kevData?.date_added as string) ?? null) : null;
    const ransomwareUse =
      kevData?.known_ransomware === true || data.ransomware_use === 'Known' || data.ransomware_use === 'Suspected';
    const exploitStatusRaw = (data.exploit_status as string) ?? null;
    const exploitStatus: 'active' | 'poc' | 'none' | null =
      exploitStatusRaw === 'in-the-wild'
        ? 'active'
        : exploitStatusRaw === 'weaponized' || exploitStatusRaw === 'poc-public'
          ? 'poc'
          : cisaKev
            ? 'active'
            : null;
    const accessVector = (data.cvss as Record<string, unknown>)?.accessVector as string | undefined;
    const isPublicFacing: boolean | null = accessVector === 'NETWORK' ? true : accessVector ? true : null;
    const title = (data.description as string) ?? id;
    return { cve_id: id, cvssScore, epssScore, cisaKev, kevDate, ransomwareUse, exploitStatus, isPublicFacing, title };
  }

  try {
    // L1: Cache API (per-colo, free)
    const l1Key = `https://cve-lookup/${id}`;
    const l1Cached = await caches.default.match(new Request(l1Key));
    if (l1Cached) {
      const data = (await l1Cached.json()) as Record<string, unknown>;
      return toEnriched(data);
    }
    // L2: KV (global, metered)
    const cached = (await kv.get(`cve:${id}`, 'json').catch(() => null)) as Record<string, unknown> | null;
    const data = cached ?? {};
    const result = toEnriched(data);
    // Shadow-write Cache API from KV hit (best-effort, no waitUntil available here)
    if (cached) {
      caches.default.put(
        new Request(l1Key),
        new Response(JSON.stringify(data), {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=1800' },
        })
      );
    }
    return result;
  } catch (_catchErr) {
    console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return null;
  }
}

interface SsvcBatchResult {
  cve_id: string;
  title: string;
  ssvc: SsvcResult;
}

interface AlertFeedUpdate {
  alert_id: string;
  cve_id: string;
  ssvc: SsvcResult;
}

/**
 * POST /api/v1/ssvc/triage
 * Compute SSVC-V for one or more CVEs.
 *
 * Body: {
 *   cve_ids?: string[]   — CVEs to triage (max 50)
 *   alert_ids?: string[] — alert IDs to re-triage (reads CVE from alert_feeds)
 * }
 */
export async function ssvcTriageHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    let body: { cve_ids?: string[]; alert_ids?: string[] };
    try {
      body = await c.req.json();
    } catch (_catchErr) {
      console.error('ssvcTriageHandler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
      return badRequest(c, 'Invalid JSON body');
    }

    const cveIds = (body.cve_ids ?? []).slice(0, 50);
    const alertIds = (body.alert_ids ?? []).slice(0, 50);

    if (cveIds.length === 0 && alertIds.length === 0) {
      return badRequest(c, 'Provide cve_ids, alert_ids, or both');
    }

    const batch: SsvcBatchResult[] = [];
    const alertsToUpdate: AlertFeedUpdate[] = [];

    // If alert_ids provided, look up the CVE from each alert
    const db = c.env.BRIEFINGS_DB as D1Database | undefined;

    if (alertIds.length > 0 && db) {
      const placeholders = alertIds.map(() => '?').join(',');
      const rows = await db
        .prepare(`SELECT id, title, source_url FROM alert_feeds WHERE id IN (${placeholders})`)
        .bind(...alertIds)
        .all<{ id: string; title: string; source_url: string }>();

      for (const row of rows.results ?? []) {
        const extracted = extractCveFromText(row.title + ' ' + row.source_url);
        if (!extracted) continue;
        const enriched = await enrichCve(extracted, c.env);
        if (!enriched) continue;

        const result = computeSsvcV({
          cvssScore: enriched.cvssScore,
          epssScore: enriched.epssScore,
          cisaKev: enriched.cisaKev,
          ransomwareUse: enriched.ransomwareUse,
          exploitStatus: enriched.exploitStatus,
          isPublicFacing: enriched.isPublicFacing ?? undefined,
        });

        batch.push({ cve_id: extracted, title: row.title, ssvc: result });
        alertsToUpdate.push({ alert_id: row.id, cve_id: extracted, ssvc: result });
      }
    }

    // Pure CVE IDs
    for (const cveId of cveIds) {
      // Skip if already processed via alert_id
      if (alertsToUpdate.some((a) => a.cve_id === cveId)) continue;

      const enriched = await enrichCve(cveId, c.env);
      if (!enriched) {
        batch.push({
          cve_id: cveId.toUpperCase(),
          title: cveId,
          ssvc: {
            decision: 'watch',
            exploitation: 'none',
            automatable: 'no',
            exposure: 'small',
            missionImpact: 'degraded',
            missionWellbeing: 'degraded',
            rationale: 'No enrichment data available — watch for changes.',
          },
        });
        continue;
      }

      const result = computeSsvcV({
        cvssScore: enriched.cvssScore,
        epssScore: enriched.epssScore,
        cisaKev: enriched.cisaKev,
        ransomwareUse: enriched.ransomwareUse,
        exploitStatus: enriched.exploitStatus,
        isPublicFacing: enriched.isPublicFacing ?? undefined,
      });

      batch.push({ cve_id: enriched.cve_id, title: enriched.title, ssvc: result });
    }

    // Persist SSVC decisions back to alert_feeds
    if (alertsToUpdate.length > 0 && db) {
      const stmt = db.prepare(
        `UPDATE alert_feeds
         SET ssvc_json = ?,
             severity = ?,
             updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
         WHERE id = ?`
      );

      for (const a of alertsToUpdate) {
        await stmt.bind(JSON.stringify(a.ssvc), ssvcDecisionToSeverity(a.ssvc.decision), a.alert_id).run();
      }
    }

    return c.json({
      count: batch.length,
      decisions: batch.map((b) => ({
        cve_id: b.cve_id,
        title: b.title,
        decision: b.ssvc.decision,
        exploitation: b.ssvc.exploitation,
        automatable: b.ssvc.automatable,
        exposure: b.ssvc.exposure,
        missionImpact: b.ssvc.missionImpact,
        missionWellbeing: b.ssvc.missionWellbeing,
        rationale: b.ssvc.rationale,
      })),
    });
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, e);
  }
}

/**
 * GET /api/v1/ssvc/triage/:id — get a single CVE's SSVC-V decision from alert_feeds or compute fresh.
 */
export async function ssvcGetHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const id = (c.req.param('id') ?? '').toUpperCase();
  if (!id.startsWith('CVE-')) return badRequest(c, 'id must be a CVE identifier');

  const db = c.env.BRIEFINGS_DB as D1Database | undefined;

  // Check if already stored in an alert
  if (db) {
    const row = await db
      .prepare(
        `SELECT id, title, ssvc_json, severity
         FROM alert_feeds
         WHERE source_url LIKE ? AND ssvc_json != '{}'
         ORDER BY created_at DESC LIMIT 1`
      )
      .bind(`%${id}%`)
      .first<{ id: string; title: string; ssvc_json: string; severity: string }>();

    if (row && row.ssvc_json && row.ssvc_json !== '{}') {
      return c.json({
        cve_id: id,
        title: row.title,
        alert_id: row.id,
        ssvc: JSON.parse(row.ssvc_json),
        severity: row.severity,
      });
    }
  }

  // Compute fresh
  const enriched = await enrichCve(id, c.env);
  if (!enriched) {
    return notFound(c, 'CVE not found and no enrichment data available');
  }

  const ssvc = computeSsvcV({
    cvssScore: enriched.cvssScore,
    epssScore: enriched.epssScore,
    cisaKev: enriched.cisaKev,
    ransomwareUse: enriched.ransomwareUse,
    exploitStatus: enriched.exploitStatus,
    isPublicFacing: enriched.isPublicFacing ?? undefined,
  });

  return c.json({
    cve_id: id,
    title: enriched.title,
    ssvc,
    severity: ssvcDecisionToSeverity(ssvc.decision),
  });
}

/**
 * GET /api/v1/ssvc/stats — aggregate over stored decisions in alert_feeds.
 */
export async function ssvcStatsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB as D1Database | undefined;
  if (!db) return serviceUnavailable(c, 'database not configured');

  try {
    const [total, byDecision, bySeverity] = await Promise.all([
      db.prepare("SELECT COUNT(*) as c FROM alert_feeds WHERE ssvc_json != '{}'").first<{ c: number }>(),
      db
        .prepare(
          `SELECT
             CASE
               WHEN json_extract(ssvc_json, '$.decision') = 'act' THEN 'act'
               WHEN json_extract(ssvc_json, '$.decision') = 'prioritise' THEN 'prioritise'
               WHEN json_extract(ssvc_json, '$.decision') = 'track' THEN 'track'
               WHEN json_extract(ssvc_json, '$.decision') = 'watch' THEN 'watch'
               ELSE 'unknown'
             END as decision,
             COUNT(*) as c
           FROM alert_feeds
           WHERE ssvc_json != '{}'
           GROUP BY decision
           ORDER BY c DESC`
        )
        .all<{ decision: SsvcDecision; c: number }>(),
      db
        .prepare(
          "SELECT severity, COUNT(*) as c FROM alert_feeds WHERE ssvc_json != '{}' GROUP BY severity ORDER BY c DESC"
        )
        .all<{ severity: string; c: number }>(),
    ]);

    return c.json({
      total: total?.c ?? 0,
      by_decision: byDecision.results ?? [],
      by_severity: bySeverity.results ?? [],
    });
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, e);
  }
}

// ── Internal helpers ───────────────────────────────────────────────────

const CVE_PATTERN = /\b(CVE-\d{4}-\d{4,})\b/i;

function extractCveFromText(text: string): string | null {
  const m = CVE_PATTERN.exec(text);
  return m ? m[1]!.toUpperCase() : null;
}

function ssvcDecisionToSeverity(decision: SsvcDecision): string {
  switch (decision) {
    case 'act':
      return 'critical';
    case 'prioritise':
      return 'high';
    case 'track':
      return 'medium';
    case 'watch':
    default:
      return 'low';
  }
}
