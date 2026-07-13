import type { Context } from 'hono';
import type { Env } from '../env';

/**
 * GET /api/v1/threat-intel/cross-campaign/correlations
 * Find connections between campaigns: shared infrastructure, tooling, and TTPs.
 */

interface Correlation {
  campaign_a: string;
  campaign_b: string;
  shared_indicators: string[];
  shared_techniques: string[];
  confidence: number;
  relationship: string;
}

export async function crossCampaignCorrelationHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  // This endpoint queries D1 for campaigns that share IOCs or techniques.
  // For now, return a structured response from the intel bundles.
  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ correlations: [], generated_at: new Date().toISOString() });

  try {
    // Find campaigns that share indicators by querying intel bundles
    const { results } = await db
      .prepare(
        `SELECT id, title, view_json FROM intel_bundles
         WHERE ioc_count > 0
         ORDER BY updated_at DESC LIMIT 50`
      )
      .all<{ id: string; title: string; view_json: string }>();

    if (!results?.length) {
      return c.json({ correlations: [], generated_at: new Date().toISOString() });
    }

    // Parse views and find shared IOCs between bundles
    const views = results
      .map((r) => {
        try {
          const v = JSON.parse(r.view_json) as {
            title: string;
            iocs?: Array<{ value: string }>;
            attackPatterns?: Array<{ mitreId: string }>;
            threatActors?: Array<{ name: string }>;
          };
          return { id: r.id, ...v };
        } catch (_catchErr) {
          console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
          return null;
        }
      })
      .filter(Boolean);

    const correlations: Correlation[] = [];

    // Compare each pair of bundles for shared IOCs / techniques
    for (let i = 0; i < views.length; i++) {
      for (let j = i + 1; j < views.length; j++) {
        const a = views[i]!;
        const b = views[j]!;

        const aIocs = new Set((a.iocs ?? []).map((ioc) => ioc.value.toLowerCase()));
        const bIocs = new Set((b.iocs ?? []).map((ioc) => ioc.value.toLowerCase()));
        const sharedIocs = [...aIocs].filter((ioc) => bIocs.has(ioc));

        const aTechs = new Set((a.attackPatterns ?? []).map((ap) => ap.mitreId));
        const bTechs = new Set((b.attackPatterns ?? []).map((ap) => ap.mitreId));
        const sharedTechs = [...aTechs].filter((t) => bTechs.has(t));

        if (sharedIocs.length >= 2 || sharedTechs.length >= 2) {
          const confidence = Math.min(100, sharedIocs.length * 15 + sharedTechs.length * 10);
          const relationship =
            sharedIocs.length >= 3 && sharedTechs.length >= 2
              ? 'likely-same-actor'
              : sharedIocs.length >= 2
                ? 'shared-infrastructure'
                : 'shared-techniques';

          correlations.push({
            campaign_a: a.title,
            campaign_b: b.title,
            shared_indicators: sharedIocs.slice(0, 10),
            shared_techniques: sharedTechs.slice(0, 10),
            confidence,
            relationship,
          });
        }
      }
    }

    // Sort by confidence descending
    correlations.sort((a, b) => b.confidence - a.confidence);

    return c.json(
      { correlations: correlations.slice(0, 20), generated_at: new Date().toISOString() },
      200,
      { 'cache-control': 'public, max-age=300' }
    );
  } catch (err) {
    console.error(JSON.stringify({ job: 'cross-campaign-correlation', error: err instanceof Error ? err.message : String(err) }));
    return c.json({ correlations: [], generated_at: new Date().toISOString() });
  }
}
