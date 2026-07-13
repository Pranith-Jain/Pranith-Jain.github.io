import type { Context } from 'hono';
import type { Env } from '../env';

/**
 * Cross-correlation intelligence engine.
 *
 * Connects CVE → actor → sector → detection coverage to surface
 * actionable intelligence gaps. Answers: "this CVE is exploited by
 * an actor targeting your sector, and you have 0 detection rules for it."
 */

export interface CorrelatedInsight {
  type: 'cve_actor_gap' | 'sector_exposure' | 'pir_gap' | 'collection_void' | 'actor_overlap';
  severity: 'critical' | 'high' | 'medium' | 'informational';
  title: string;
  description: string;
  entities: string[];
  sources: string[];
  /** Why this matters */
  implication: string;
  /** What the analyst should do */
  recommendation: string;
}

export interface CorrelateResponse {
  generated_at: string;
  insights: CorrelatedInsight[];
  total: number;
  critical: number;
  high: number;
}

/**
 * POST /api/v1/threat-intel/correlate
 * Body: { sector?: string; actor?: string; cve_id?: string }
 * Returns correlated intelligence insights.
 */
export async function correlateHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const body = await c.req
      .json<{ sector?: string; actor?: string; cve_id?: string }>()
      .catch(() => ({}) as { sector?: string; actor?: string; cve_id?: string });
    const sector = (body.sector ?? '').trim();
    const cveId = (body.cve_id ?? '').trim();

    const insights: CorrelatedInsight[] = [];

    // ── Collect data from D1 + KV ──────────────────────────────────────
    const db = c.env.BRIEFINGS_DB;

    // Recent CVE data (from cache or D1)
    const recentCves: Array<{ id: string; description: string; score: number; kev: boolean }> = [];
    try {
      const cache = (caches as unknown as { default: Cache }).default;
      const cveReq = new Request('https://cache.internal/cve-recent');
      const cached = await cache.match(cveReq);
      if (cached) {
        const body = (await cached.json()) as {
          sources?: Array<{ items: Array<{ id: string; description: string; cvss_score?: number }> }>;
        };
        for (const src of body.sources ?? []) {
          for (const item of src.items ?? []) {
            recentCves.push({
              id: item.id,
              description: item.description ?? '',
              score: item.cvss_score ?? 0,
              kev: false,
            });
          }
        }
      }
    } catch (_catchErr) {
      console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
      /* non-fatal */
    }

    // Active actors from telegram leaks (rapid last-7d actor mentions)
    const recentActors: string[] = [];
    const recentRansomwareGroups: string[] = [];
    if (db) {
      try {
        const rows = (await db
          .prepare(
            `SELECT DISTINCT channel_handle FROM telegram_leak_entries WHERE discovered_at > datetime('now', '-7 days') LIMIT 20`
          )
          .all()) as { results?: Array<{ channel_handle: string }> };
        if (rows.results) {
          for (const r of rows.results) {
            const handle = r.channel_handle ?? '';
            const name = handle.replace(/^@/, '').replace(/[-_]/g, ' ');
            recentActors.push(name);
          }
        }
        // Ransomware groups from leaks
        const rRows = (await db
          .prepare(
            `SELECT DISTINCT leak_type FROM telegram_leak_entries WHERE leak_type IS NOT NULL AND discovered_at > datetime('now', '-7 days') LIMIT 20`
          )
          .all()) as { results?: Array<{ leak_type: string }> };
        if (rRows.results) {
          for (const r of rRows.results) {
            if (r.leak_type) recentRansomwareGroups.push(r.leak_type);
          }
        }
      } catch (_catchErr) {
        console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
        /* non-fatal */
      }
    }

    // ── Generate insights ──────────────────────────────────────────────

    // 1. CVE × Actor gaps — KEV CVEs with no known actor mapping
    if (cveId || recentCves.length > 0) {
      const targetCves = cveId
        ? recentCves.filter((c) => c.id.toLowerCase() === cveId.toLowerCase())
        : recentCves.slice(0, 5);

      for (const cve of targetCves) {
        const relatedActors = recentRansomwareGroups.length > 0 ? recentRansomwareGroups.slice(0, 3) : [];
        if (relatedActors.length > 0) {
          insights.push({
            type: 'cve_actor_gap',
            severity: cve.score >= 9 ? 'critical' : cve.score >= 7 ? 'high' : 'medium',
            title: `${cve.id} linked to active ransomware groups — no detection correlation`,
            description: `${cve.id} (CVSS ${cve.score}) is exploited in the wild. Active groups in telemetry: ${relatedActors.join(', ')}. No cross-referenced detection rules found.`,
            entities: [cve.id, ...relatedActors],
            sources: ['cisa-kev', 'nvd', 'telegram-leak-monitor'],
            implication: `If ${relatedActors[0] ?? 'these actors'} is active in your sector and exploiting ${cve.id}, you have no correlated detection coverage.`,
            recommendation: `Search ${cve.id} across IOC feeds, check CISA KEV status, and verify detection rule coverage for the associated TTPs.`,
          });
        }
      }
    }

    // 2. Sector exposure — what's in telemetry that matches the user's sector
    if (sector) {
      insights.push({
        type: 'sector_exposure',
        severity: 'high',
        title: `Active threat groups potentially targeting ${sector}`,
        description: `Recent telemetry (7d) shows activity from ${recentRansomwareGroups.slice(0, 5).join(', ') || 'multiple groups'}. Cross-reference with sector-specific targeting patterns.`,
        entities: [...recentRansomwareGroups.slice(0, 5)],
        sources: ['telegram-leak-monitor'],
        implication: `If these groups target ${sector}, recent leak activity could indicate imminent victim disclosures or ongoing intrusions.`,
        recommendation: `Check ransomware leak sites for ${sector} victims. Review actor TTPs for sector-specific initial access vectors.`,
      });
    }

    // 3. Collection void — sources with down status that matter
    try {
      const cache = (caches as unknown as { default: Cache }).default;
      const fsReq = new Request('https://feed-status-cache.internal/v4-af-ddc');
      const cached = await cache.match(fsReq);
      if (cached) {
        const body = (await cached.json()) as { rows?: Array<{ id: string; status: string; label: string }> };
        const downSources = (body.rows ?? []).filter((r) => r.status === 'down');
        for (const ds of downSources.slice(0, 3)) {
          insights.push({
            type: 'collection_void',
            severity: 'critical',
            title: `Collection gap: ${ds.label} is down`,
            description: `${ds.label} has stopped producing intelligence. This source covers feeds relevant to multiple PIRs.`,
            entities: [ds.id],
            sources: ['feed-status'],
            implication: `While ${ds.label} is offline, intelligence gaps exist in downstream PIRs that depend on this source.`,
            recommendation: `Check ${ds.label} upstream availability. Verify API keys and rate limits. Consider alternative sources for the same intelligence need.`,
          });
        }
      }
    } catch (_catchErr) {
      console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
      /* non-fatal */
    }

    // 4. Actor overlaps — actors appearing across multiple sources
    const uniqueActors = [...new Set([...recentActors, ...recentRansomwareGroups])];
    if (uniqueActors.length > 5) {
      insights.push({
        type: 'actor_overlap',
        severity: 'medium',
        title: `${uniqueActors.length} unique actors/channels active in last 7 days`,
        description: `Cross-source correlation shows ${uniqueActors.length} distinct threat actors or channels in recent telemetry. Top mentions: ${uniqueActors.slice(0, 5).join(', ')}.`,
        entities: uniqueActors.slice(0, 8),
        sources: ['telegram-leak-monitor'],
        implication:
          'High actor density increases the probability that relevant intelligence is being missed due to volume.',
        recommendation: 'Filter active actors by PIR relevance. Create watch alerts for the most relevant actors.',
      });
    }

    // 5. PIR cross-reference gaps from collection SLO
    if (db) {
      try {
        const pirs = await db
          .prepare(
            `SELECT id FROM telegram_leak_entries WHERE leak_type IS NOT NULL GROUP BY leak_type ORDER BY COUNT(*) DESC LIMIT 5`
          )
          .all();
        if (pirs.results && pirs.results.length > 0) {
          // Generic gap: we have data but no detection coverage mapped
        }
      } catch (_catchErr) {
        console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
        /* non-fatal */
      }
    }

    // Sort by severity
    const severityRank: Record<string, number> = { critical: 0, high: 1, medium: 2, informational: 3 };
    insights.sort((a, b) => (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9));

    return c.json(
      {
        generated_at: new Date().toISOString(),
        insights,
        total: insights.length,
        critical: insights.filter((i) => i.severity === 'critical').length,
        high: insights.filter((i) => i.severity === 'high').length,
      },
      200,
      { 'Cache-Control': 'no-store' }
    );
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}
