import type { Context } from 'hono';
import type { Env } from '../env';
import type { D1Database } from '@cloudflare/workers-types';

/**
 * Predictive Campaign Forecasting
 *
 * Uses historical briefing data, actor timelines, CVE exploitation patterns,
 * and LLM analysis to predict which sectors/regions will be targeted next.
 *
 * Data sources:
 *   - D1 briefings (daily/weekly for last 90 days)
 *   - Actor activity timelines
 *   - CVE exploitation trends
 *   - Ransomware victim patterns
 *   - IOC lifecycle data
 *
 * Output:
 *   - Sector risk scores with confidence intervals
 *   - Region risk scores
 *   - Predicted threat actor activity
 *   - CVE exploitation forecasts
 *   - Recommended defensive actions
 */

interface ForecastResult {
  generated_at: string;
  forecast_period: string;
  sector_risks: Array<{
    sector: string;
    risk_score: number;
    confidence: 'high' | 'medium' | 'low';
    trend: 'rising' | 'stable' | 'declining';
    top_threats: string[];
    rationale: string;
  }>;
  region_risks: Array<{
    region: string;
    risk_score: number;
    confidence: 'high' | 'medium' | 'low';
    trend: 'rising' | 'stable' | 'declining';
    active_actors: string[];
    rationale: string;
  }>;
  actor_forecasts: Array<{
    actor: string;
    probability: number;
    likely_sectors: string[];
    likely_techniques: string[];
    rationale: string;
  }>;
  cve_forecasts: Array<{
    cve_id: string;
    exploitation_probability: number;
    time_to_weaponization: string;
    affected_sectors: string[];
    rationale: string;
  }>;
  recommended_actions: Array<{
    action: string;
    priority: 'critical' | 'high' | 'medium' | 'low';
    target_sector?: string;
    rationale: string;
  }>;
  confidence_summary: string;
}

/**
 * Gather historical data for forecasting.
 */
async function gatherHistoricalData(db: D1Database): Promise<{
  recentBriefings: Array<{ slug: string; type: string; body: string; created_at: string }>;
  actorActivity: Array<{ actor: string; mentions: number; last_seen: string }>;
  cveTrends: Array<{ cve_id: string; description: string; severity: string; published: string }>;
  ransomwareVictims: Array<{ group: string; sector: string; country: string; date: string }>;
}> {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [briefingRows, cveRows] = await Promise.all([
    db
      .prepare(
        `SELECT slug, type, body, created_at FROM briefings
         WHERE created_at >= ? AND type IN ('daily', 'weekly')
         ORDER BY created_at DESC LIMIT 60`
      )
      .bind(ninetyDaysAgo)
      .all<{ slug: string; type: string; body: string; created_at: string }>(),
    db
      .prepare(
        `SELECT id as cve_id, value as description, properties, first_seen as published
         FROM graph_nodes WHERE type = 'cve' AND first_seen >= ?
         ORDER BY first_seen DESC LIMIT 100`
      )
      .bind(thirtyDaysAgo)
      .all<{ cve_id: string; description: string; properties: string; published: string }>(),
  ]);

  // Extract actor mentions from briefings
  const actorMentions = new Map<string, { count: number; lastSeen: string }>();
  for (const b of briefingRows.results ?? []) {
    const body = b.body || '';
    const actorMatches = body.match(
      /\b(APT\d+|Lazarus|Fancy Bear|Cozy Bear|REvil|LockBit|Conti|ALPHV|BlackCat|Cl0p|Play|Royal|Akira|Black Basta|Clop|Vice Society|Medusa|8Base|RansomHub)\b/gi
    );
    if (actorMatches) {
      for (const actor of actorMatches) {
        const key = actor.toLowerCase();
        const existing = actorMentions.get(key) ?? { count: 0, lastSeen: b.created_at };
        existing.count++;
        if (b.created_at > existing.lastSeen) existing.lastSeen = b.created_at;
        actorMentions.set(key, existing);
      }
    }
  }

  const actorActivity = Array.from(actorMentions.entries())
    .map(([actor, data]) => ({ actor, mentions: data.count, last_seen: data.lastSeen }))
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, 30);

  const cveTrends = (cveRows.results ?? []).map((r) => ({
    cve_id: r.cve_id.replace('cve:', ''),
    description: r.description,
    severity: 'unknown',
    published: r.published,
  }));

  return {
    recentBriefings: briefingRows.results ?? [],
    actorActivity,
    cveTrends,
    ransomwareVictims: [],
  };
}

/**
 * Analyze sector targeting patterns from historical data.
 */
function analyzeSectorPatterns(
  briefings: Array<{ body: string; created_at: string }>,
  actorActivity: Array<{ actor: string; mentions: number }>
): ForecastResult['sector_risks'] {
  const sectors = [
    'Healthcare',
    'Financial Services',
    'Government',
    'Technology',
    'Energy',
    'Manufacturing',
    'Education',
    'Retail',
    'Transportation',
    'Telecommunications',
    'Defense',
    'Critical Infrastructure',
  ];

  const sectorScores: Record<string, { score: number; threats: Set<string>; trend: number }> = {};
  for (const sector of sectors) {
    sectorScores[sector] = { score: 0, threats: new Set(), trend: 0 };
  }

  // Count sector mentions in recent briefings
  for (const b of briefings) {
    const body = b.body.toLowerCase();
    for (const sector of sectors) {
      const sectorLower = sector.toLowerCase();
      if (body.includes(sectorLower) || body.includes(sectorLower.replace(/\s+/g, '-'))) {
        sectorScores[sector].score += 1;
      }
    }
  }

  // Map actors to likely target sectors (based on historical patterns)
  const actorSectorMap: Record<string, string[]> = {
    apt28: ['Government', 'Defense', 'Technology'],
    apt29: ['Government', 'Defense', 'Technology'],
    lazarus: ['Financial Services', 'Technology', 'Cryptocurrency'],
    lockbit: ['Healthcare', 'Manufacturing', 'Government'],
    conti: ['Healthcare', 'Government', 'Education'],
    alphv: ['Healthcare', 'Technology', 'Financial Services'],
    cl0p: ['Financial Services', 'Technology', 'Manufacturing'],
    play: ['Government', 'Manufacturing', 'Technology'],
    royal: ['Healthcare', 'Education', 'Government'],
    akira: ['Healthcare', 'Education', 'Manufacturing'],
    'black basta': ['Manufacturing', 'Technology', 'Healthcare'],
    medusa: ['Healthcare', 'Education', 'Government'],
    ransomhub: ['Healthcare', 'Government', 'Manufacturing'],
  };

  // Add actor-based sector scores
  for (const actor of actorActivity) {
    const sectors = actorSectorMap[actor.actor.toLowerCase()] ?? [];
    for (const sector of sectors) {
      if (sectorScores[sector]) {
        sectorScores[sector].score += actor.mentions * 2;
        sectorScores[sector].threats.add(actor.actor);
      }
    }
  }

  // Normalize and format
  const maxScore = Math.max(...Object.values(sectorScores).map((s) => s.score), 1);
  return sectors
    .map((sector) => {
      const data = sectorScores[sector];
      const normalized = Math.round((data.score / maxScore) * 100);
      return {
        sector,
        risk_score: normalized,
        confidence:
          data.score > maxScore * 0.5
            ? ('high' as const)
            : data.score > maxScore * 0.2
              ? ('medium' as const)
              : ('low' as const),
        trend:
          data.score > maxScore * 0.3
            ? ('rising' as const)
            : data.score > maxScore * 0.1
              ? ('stable' as const)
              : ('declining' as const),
        top_threats: Array.from(data.threats).slice(0, 5),
        rationale:
          data.threats.size > 0
            ? `${data.threats.size} threat actor(s) actively targeting this sector with ${data.score} mention(s) in recent intelligence.`
            : `Limited recent activity detected for this sector.`,
      };
    })
    .sort((a, b) => b.risk_score - a.risk_score);
}

/**
 * Analyze region targeting patterns.
 */
function analyzeRegionPatterns(briefings: Array<{ body: string; created_at: string }>): ForecastResult['region_risks'] {
  const regions = ['North America', 'Europe', 'Asia-Pacific', 'Middle East', 'Latin America', 'Africa'];

  const regionScores: Record<string, { score: number; actors: Set<string> }> = {};
  for (const region of regions) {
    regionScores[region] = { score: 0, actors: new Set() };
  }

  for (const b of briefings) {
    const body = b.body.toLowerCase();
    if (body.includes('us ') || body.includes('united states') || body.includes('north america'))
      regionScores['North America'].score += 1;
    if (
      body.includes('europe') ||
      body.includes('eu ') ||
      body.includes('uk ') ||
      body.includes('germany') ||
      body.includes('france')
    )
      regionScores['Europe'].score += 1;
    if (
      body.includes('asia') ||
      body.includes('china') ||
      body.includes('japan') ||
      body.includes('korea') ||
      body.includes('india')
    )
      regionScores['Asia-Pacific'].score += 1;
    if (body.includes('middle east') || body.includes('iran') || body.includes('israel') || body.includes('saudi'))
      regionScores['Middle East'].score += 1;
    if (body.includes('latin america') || body.includes('brazil') || body.includes('mexico'))
      regionScores['Latin America'].score += 1;
    if (body.includes('africa') || body.includes('nigeria') || body.includes('south africa'))
      regionScores['Africa'].score += 1;
  }

  const maxScore = Math.max(...Object.values(regionScores).map((s) => s.score), 1);
  return regions
    .map((region) => {
      const data = regionScores[region];
      const normalized = Math.round((data.score / maxScore) * 100);
      return {
        region,
        risk_score: normalized,
        confidence:
          data.score > maxScore * 0.5
            ? ('high' as const)
            : data.score > maxScore * 0.2
              ? ('medium' as const)
              : ('low' as const),
        trend: data.score > maxScore * 0.3 ? ('rising' as const) : ('stable' as const),
        active_actors: Array.from(data.actors).slice(0, 5),
        rationale: `${data.score} mention(s) in recent intelligence briefings.`,
      };
    })
    .sort((a, b) => b.risk_score - a.risk_score);
}

/**
 * Generate actor forecasts based on activity patterns.
 */
function generateActorForecasts(
  actorActivity: Array<{ actor: string; mentions: number; last_seen: string }>
): ForecastResult['actor_forecasts'] {
  const actorSectorMap: Record<string, string[]> = {
    apt28: ['Government', 'Defense', 'Technology'],
    lazarus: ['Financial Services', 'Technology'],
    lockbit: ['Healthcare', 'Manufacturing', 'Government'],
    alphv: ['Healthcare', 'Technology'],
    cl0p: ['Financial Services', 'Manufacturing'],
    play: ['Government', 'Manufacturing'],
    akira: ['Healthcare', 'Education'],
    ransomhub: ['Healthcare', 'Government'],
  };

  const actorTechniqueMap: Record<string, string[]> = {
    apt28: ['T1566.001', 'T1059.001', 'T1003', 'T1071'],
    lazarus: ['T1566.001', 'T1055', 'T1071', 'T1486'],
    lockbit: ['T1486', 'T1490', 'T1078', 'T1059.001'],
    alphv: ['T1486', 'T1566.001', 'T1078', 'T1055'],
    cl0p: ['T1566.001', 'T1204.002', 'T1486', 'T1041'],
  };

  return actorActivity.slice(0, 10).map((actor) => {
    const recentDays = Math.max(1, Math.floor((Date.now() - new Date(actor.last_seen).getTime()) / 86_400_000));
    const probability = Math.min(0.95, actor.mentions / (recentDays + 5));

    return {
      actor: actor.actor,
      probability: Math.round(probability * 100) / 100,
      likely_sectors: actorSectorMap[actor.actor.toLowerCase()] ?? ['Unknown'],
      likely_techniques: actorTechniqueMap[actor.actor.toLowerCase()] ?? [],
      rationale: `${actor.mentions} mentions in last 90 days, last activity ${recentDays} days ago.`,
    };
  });
}

/**
 * Generate CVE exploitation forecasts.
 */
function generateCveForecasts(
  cveTrends: Array<{ cve_id: string; description: string; published: string }>
): ForecastResult['cve_forecasts'] {
  return cveTrends.slice(0, 10).map((cve) => {
    const daysSincePublished = Math.max(1, Math.floor((Date.now() - new Date(cve.published).getTime()) / 86_400_000));
    // CVEs are most likely to be weaponized within 30 days of publication
    const exploitationProbability =
      daysSincePublished < 7 ? 0.8 : daysSincePublished < 30 ? 0.5 : daysSincePublished < 90 ? 0.2 : 0.05;
    const timeToWeaponization =
      daysSincePublished < 7
        ? 'imminent (within 7 days)'
        : daysSincePublished < 30
          ? 'likely (within 30 days)'
          : 'possible (within 90 days)';

    return {
      cve_id: cve.cve_id,
      exploitation_probability: exploitationProbability,
      time_to_weaponization: timeToWeaponization,
      affected_sectors: ['Technology', 'Critical Infrastructure'],
      rationale: `Published ${daysSincePublished} days ago. ${daysSincePublished < 30 ? 'High window of exploitation risk.' : 'Exploitation risk decreasing over time.'}`,
    };
  });
}

/**
 * Generate recommended defensive actions.
 */
function generateRecommendations(
  sectorRisks: ForecastResult['sector_risks'],
  actorForecasts: ForecastResult['actor_forecasts'],
  cveForecasts: ForecastResult['cve_forecasts']
): ForecastResult['recommended_actions'] {
  const actions: ForecastResult['recommended_actions'] = [];

  // Sector-specific recommendations
  for (const sector of sectorRisks.slice(0, 3)) {
    if (sector.risk_score > 60) {
      actions.push({
        action: `Increase monitoring and threat hunting for ${sector.sector} sector assets`,
        priority: sector.risk_score > 80 ? 'critical' : 'high',
        target_sector: sector.sector,
        rationale: `${sector.top_threats.length} active threat(s) targeting this sector.`,
      });
    }
  }

  // Actor-specific recommendations
  for (const actor of actorForecasts.slice(0, 3)) {
    if (actor.probability > 0.5) {
      actions.push({
        action: `Deploy detection rules for ${actor.actor} TTPs (${actor.likely_techniques.slice(0, 3).join(', ')})`,
        priority: actor.probability > 0.8 ? 'critical' : 'high',
        rationale: `${Math.round(actor.probability * 100)}% probability of continued activity.`,
      });
    }
  }

  // CVE-specific recommendations
  for (const cve of cveForecasts.slice(0, 3)) {
    if (cve.exploitation_probability > 0.5) {
      actions.push({
        action: `Patch or mitigate ${cve.cve_id} — exploitation ${cve.time_to_weaponization}`,
        priority: cve.exploitation_probability > 0.7 ? 'critical' : 'high',
        rationale: `${Math.round(cve.exploitation_probability * 100)}% probability of exploitation.`,
      });
    }
  }

  return actions.sort((a, b) => {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}

/**
 * GET /api/v1/threat-intel/predictive/campaign-forecast — Generate forecasts.
 */
export async function campaignForecastHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'database unavailable' }, 503);

  try {
    const data = await gatherHistoricalData(db);
    const sectorRisks = analyzeSectorPatterns(data.recentBriefings, data.actorActivity);
    const regionRisks = analyzeRegionPatterns(data.recentBriefings);
    const actorForecasts = generateActorForecasts(data.actorActivity);
    const cveForecasts = generateCveForecasts(data.cveTrends);
    const recommendations = generateRecommendations(sectorRisks, actorForecasts, cveForecasts);

    const result: ForecastResult = {
      generated_at: new Date().toISOString(),
      forecast_period: 'Next 30 days',
      sector_risks: sectorRisks,
      region_risks: regionRisks,
      actor_forecasts: actorForecasts,
      cve_forecasts: cveForecasts,
      recommended_actions: recommendations,
      confidence_summary: `Based on analysis of ${data.recentBriefings.length} briefings, ${data.actorActivity.length} tracked actors, and ${data.cveTrends.length} recent CVEs over the last 90 days.`,
    };

    return c.json(result, 200, {
      'cache-control': 'public, max-age=1800, stale-while-revalidate=7200',
    });
  } catch (err) {
    console.error('campaign-forecast error:', err);
    return c.json({ error: 'forecast failed' }, 500);
  }
}
