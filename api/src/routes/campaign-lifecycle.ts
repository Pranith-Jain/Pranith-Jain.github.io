import type { Context } from 'hono';
import type { Env } from '../env';

/**
 * Campaign Lifecycle Intelligence — track campaigns from birth to death.
 *
 * Features:
 *   - Phase detection (preparation → delivery → exploitation → C2 → exfil → monetization)
 *   - Predictive modeling (next target, timing)
 *   - Cross-campaign correlation
 *   - Escalation detection
 *   - Kill chain mapping
 *
 * Turns flat IOC data into campaign-level intelligence.
 */

// ── Types ───────────────────────────────────────────────────────────────

export interface Campaign {
  campaign_id: string;
  name: string;
  status: 'active' | 'dormant' | 'concluded' | 'evolving';

  // Lifecycle phases
  phases: CampaignPhase[];
  current_phase: string;

  // Indicators
  indicators: {
    ips: string[];
    domains: string[];
    hashes: string[];
    urls: string[];
    emails: string[];
  };

  // Attribution
  attribution: {
    actor: string | null;
    confidence: number;
    evidence: string[];
  };

  // Predictions
  predictions: {
    next_target_sector: string | null;
    next_target_region: string | null;
    estimated_next_attack: string | null;
    escalation_probability: number;
    campaign_end_estimate: string | null;
  };

  // Connections
  related_campaigns: Array<{
    campaign_id: string;
    relationship: 'same_actor' | 'shared_infrastructure' | 'similar_ttps' | 'copycat';
    confidence: number;
  }>;

  // Metrics
  metrics: {
    total_indicators: number;
    unique_sectors_targeted: number;
    unique_regions_targeted: number;
    estimated_victims: number;
    duration_days: number;
    dwell_time_avg_days: number;
  };

  // Timeline
  timeline: Array<{
    timestamp: string;
    event: string;
    phase: string;
    indicators: string[];
  }>;

  // Metadata
  first_seen: string;
  last_seen: string;
  confidence: number;
  sources: string[];
}

export interface CampaignPhase {
  phase: 'preparation' | 'delivery' | 'exploitation' | 'c2' | 'exfil' | 'monetization';
  start_time: string;
  end_time: string | null;
  indicators: string[];
  techniques: string[];
  confidence: number;
}

export interface CampaignPrediction {
  campaign_id: string;
  predictions: {
    next_target: {
      sector: string;
      region: string;
      confidence: number;
      rationale: string;
    };
    timing: {
      estimated_days: number;
      confidence: number;
      basis: string;
    };
    escalation: {
      probability: number;
      indicators: string[];
    };
    conclusion: {
      estimated_days: number;
      likely_outcome: string;
    };
  };
}

// ── Analysis Functions ──────────────────────────────────────────────────

/**
 * Detect campaign phases from a set of IOCs with timestamps.
 */
export function detectCampaignPhases(
  indicators: Array<{ value: string; type: string; first_seen: string; score: number }>
): CampaignPhase[] {
  const phases: CampaignPhase[] = [];

  // Sort by time
  const sorted = [...indicators].sort((a, b) => new Date(a.first_seen).getTime() - new Date(b.first_seen).getTime());

  // Simple phase detection based on indicator types and timing
  let currentPhase: CampaignPhase | null = null;

  for (const indicator of sorted) {
    let detectedPhase: CampaignPhase['phase'] = 'preparation';

    // High score + certain types suggest later phases
    if (indicator.score > 70) {
      if (indicator.type === 'ip') detectedPhase = 'c2';
      else if (indicator.type === 'hash') detectedPhase = 'exploitation';
      else if (indicator.type === 'domain') detectedPhase = 'delivery';
    } else if (indicator.score > 40) {
      detectedPhase = 'delivery';
    }

    if (!currentPhase || currentPhase.phase !== detectedPhase) {
      if (currentPhase) {
        currentPhase.end_time = indicator.first_seen;
        phases.push(currentPhase);
      }
      currentPhase = {
        phase: detectedPhase,
        start_time: indicator.first_seen,
        end_time: null,
        indicators: [indicator.value],
        techniques: [],
        confidence: indicator.score,
      };
    } else {
      currentPhase.indicators.push(indicator.value);
      currentPhase.confidence = Math.max(currentPhase.confidence, indicator.score);
    }
  }

  if (currentPhase) {
    phases.push(currentPhase);
  }

  return phases;
}

/**
 * Predict next campaign moves based on patterns.
 */
export function predictCampaignMoves(campaign: Campaign): Campaign['predictions'] {
  const { attribution, phases, metrics } = campaign;

  // Sector targeting prediction based on history
  const sectorPredictions: Record<string, { sector: string; region: string }> = {
    // Russian-speaking APTs
    apt28: { sector: 'government', region: 'europe' },
    apt29: { sector: 'technology', region: 'global' },
    sandworm: { sector: 'energy', region: 'europe' },
    turla: { sector: 'government', region: 'europe' },
    // North Korean
    lazarus: { sector: 'cryptocurrency', region: 'global' },
    kimsuky: { sector: 'government', region: 'asia' },
    // Chinese
    apt41: { sector: 'technology', region: 'asia' },
    apt10: { sector: 'technology', region: 'global' },
    'volt-typhoon': { sector: 'critical_infrastructure', region: 'north_america' },
    hafnium: { sector: 'technology', region: 'global' },
    // Iranian
    apt33: { sector: 'energy', region: 'middle_east' },
    apt35: { sector: 'government', region: 'middle_east' },
    // Ransomware
    lockbit: { sector: 'healthcare', region: 'north_america' },
    'black-basta': { sector: 'manufacturing', region: 'north_america' },
    cl0p: { sector: 'technology', region: 'global' },
    akira: { sector: 'education', region: 'north_america' },
    medusa: { sector: 'healthcare', region: 'north_america' },
    play: { sector: 'government', region: 'south_america' },
    'blackcat-alphv': { sector: 'technology', region: 'global' },
    rhysida: { sector: 'healthcare', region: 'north_america' },
  };

  const actorKey = (attribution.actor ?? '').toLowerCase().replace(/\s+/g, '');
  const prediction = sectorPredictions[actorKey];

  // Timing prediction based on campaign tempo
  const avgPhaseDuration = metrics.duration_days / Math.max(phases.length, 1);
  const estimatedDays = Math.round(avgPhaseDuration * 1.5);

  // Escalation probability based on phase progression
  const phaseOrder = ['preparation', 'delivery', 'exploitation', 'c2', 'exfil', 'monetization'];
  const currentPhaseIndex = phaseOrder.indexOf(campaign.current_phase);
  const escalationProb = Math.min(95, (currentPhaseIndex / phaseOrder.length) * 100);

  return {
    next_target_sector: prediction?.sector ?? null,
    next_target_region: prediction?.region ?? null,
    estimated_next_attack: `${estimatedDays} days`,
    escalation_probability: Math.round(escalationProb),
    campaign_end_estimate: `${estimatedDays * 3} days`,
  };
}

/**
 * Find related campaigns based on shared indicators.
 */
export function findRelatedCampaigns(campaign: Campaign, allCampaigns: Campaign[]): Campaign['related_campaigns'] {
  const related: Campaign['related_campaigns'] = [];

  const campaignIndicators = new Set([
    ...campaign.indicators.ips,
    ...campaign.indicators.domains,
    ...campaign.indicators.hashes,
  ]);

  for (const other of allCampaigns) {
    if (other.campaign_id === campaign.campaign_id) continue;

    const otherIndicators = new Set([...other.indicators.ips, ...other.indicators.domains, ...other.indicators.hashes]);

    // Find shared indicators
    const shared = [...campaignIndicators].filter((i) => otherIndicators.has(i));

    if (shared.length > 0) {
      let relationship: Campaign['related_campaigns'][0]['relationship'] = 'shared_infrastructure';
      let confidence = Math.min(95, shared.length * 20);

      // Check if same actor
      if (
        campaign.attribution.actor &&
        other.attribution.actor &&
        campaign.attribution.actor === other.attribution.actor
      ) {
        relationship = 'same_actor';
        confidence = Math.min(95, confidence + 20);
      }

      related.push({
        campaign_id: other.campaign_id,
        relationship,
        confidence,
      });
    }
  }

  return related.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Calculate campaign metrics.
 */
export function calculateCampaignMetrics(campaign: Campaign): Campaign['metrics'] {
  const allIndicators = [
    ...campaign.indicators.ips,
    ...campaign.indicators.domains,
    ...campaign.indicators.hashes,
    ...campaign.indicators.urls,
    ...campaign.indicators.emails,
  ];

  const firstSeen = new Date(campaign.first_seen);
  const lastSeen = new Date(campaign.last_seen);
  const durationDays = Math.max(1, Math.round((lastSeen.getTime() - firstSeen.getTime()) / (1000 * 60 * 60 * 24)));

  return {
    total_indicators: allIndicators.length,
    unique_sectors_targeted: 0, // Would need victim data
    unique_regions_targeted: 0, // Would need geo data
    estimated_victims: Math.round(allIndicators.length * 0.3), // Rough estimate
    duration_days: durationDays,
    dwell_time_avg_days: Math.round(durationDays * 0.3), // Rough estimate
  };
}

// ── Route Handlers ──────────────────────────────────────────────────────

/** POST /api/v1/threat-intel/campaign/analyze */
export async function campaignAnalyzeHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const body = await c.req.json<{
    indicators: Array<{ value: string; type: string; first_seen: string; score: number }>;
    name?: string;
    actor?: string;
  }>();

  if (!body.indicators || body.indicators.length === 0) {
    return c.json({ error: 'indicators array required' }, 400);
  }

  const phases = detectCampaignPhases(body.indicators);
  const campaign: Campaign = {
    campaign_id: crypto.randomUUID(),
    name: body.name ?? `Campaign-${Date.now()}`,
    status: 'active',
    phases,
    current_phase: phases[phases.length - 1]?.phase ?? 'unknown',
    indicators: {
      ips: body.indicators.filter((i) => i.type === 'ip').map((i) => i.value),
      domains: body.indicators.filter((i) => i.type === 'domain').map((i) => i.value),
      hashes: body.indicators.filter((i) => i.type === 'hash').map((i) => i.value),
      urls: body.indicators.filter((i) => i.type === 'url').map((i) => i.value),
      emails: [],
    },
    attribution: {
      actor: body.actor ?? null,
      confidence: body.actor ? 60 : 0,
      evidence: [],
    },
    predictions: {
      next_target_sector: null,
      next_target_region: null,
      estimated_next_attack: null,
      escalation_probability: 0,
      campaign_end_estimate: null,
    },
    related_campaigns: [],
    metrics: {
      total_indicators: body.indicators.length,
      unique_sectors_targeted: 0,
      unique_regions_targeted: 0,
      estimated_victims: 0,
      duration_days: 0,
      dwell_time_avg_days: 0,
    },
    timeline: phases.map((p) => ({
      timestamp: p.start_time,
      event: `Phase: ${p.phase}`,
      phase: p.phase,
      indicators: p.indicators,
    })),
    first_seen: body.indicators[0]?.first_seen ?? new Date().toISOString(),
    last_seen: body.indicators[body.indicators.length - 1]?.first_seen ?? new Date().toISOString(),
    confidence: 70,
    sources: ['analysis'],
  };

  // Calculate predictions
  campaign.predictions = predictCampaignMoves(campaign);
  campaign.metrics = calculateCampaignMetrics(campaign);

  return c.json(campaign);
}

/** GET /api/v1/threat-intel/campaign/techniques */
export async function campaignTechniquesHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  return c.json({
    phases: [
      { id: 'preparation', name: 'Preparation', description: 'Infrastructure and tooling setup' },
      { id: 'delivery', name: 'Delivery', description: 'Initial access vector deployment' },
      { id: 'exploitation', name: 'Exploitation', description: 'Vulnerability exploitation or malware execution' },
      { id: 'c2', name: 'Command & Control', description: 'Establishing persistent communication' },
      { id: 'exfil', name: 'Exfiltration', description: 'Data theft and staging' },
      { id: 'monetization', name: 'Monetization', description: 'Ransomware deployment or data sale' },
    ],
  });
}
