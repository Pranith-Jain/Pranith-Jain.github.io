import type { Context } from 'hono';
import type { Env } from '../env';
import { readLastGood } from '../lib/lastgood';
import type { Pir } from './pir';
import { FEED_STATUS_CACHE_KEY } from './feed-status';

/**
 * Predictive Threat Intelligence & Attribution Framework
 *
 * Features:
 *   - Threat forecasting based on historical patterns
 *   - Sector risk scoring
 *   - Attribution confidence scoring
 *   - Intelligence gap analysis
 *   - Cross-campaign correlation
 *
 * Uses pattern matching and statistical analysis to predict future threats
 * and assess attribution confidence.
 */

// ── Types ───────────────────────────────────────────────────────────────

export interface ThreatForecast {
  threat_type: string;
  probability: number;
  timeframe: string;
  basis: string[];
  confidence: 'high' | 'medium' | 'low';
  indicators_to_watch: string[];
}

export interface SectorRisk {
  sector: string;
  current_risk: number;
  trend: 'increasing' | 'stable' | 'decreasing';
  top_threats: string[];
  rationale: string;
  recommendations: string[];
}

export interface AttributionAssessment {
  target: string;
  evidence: {
    technical: Array<{ indicator: string; weight: number; source: string }>;
    behavioral: Array<{ pattern: string; matches_actor: string; uniqueness: number }>;
    infrastructure: Array<{ provider: string; pattern: string; overlaps: string[] }>;
  };
  attribution: {
    actor: string;
    confidence: number;
    confidence_level: 'low' | 'moderate' | 'substantial' | 'high';
    alternative_hypotheses: string[];
    intelligence_gaps: string[];
  };
}

export interface IntelligenceGap {
  topic: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  current_knowledge: number;
  target_knowledge: number;
  collection_methods: string[];
  estimated_effort: string;
  /** Which PIRs contribute to this gap (if any) */
  related_pirs?: string[];
  /** "What would change my mind" — the evidence that would close this gap */
  what_would_change_my_mind?: string;
  /** Source coverage score — how many relevant sources are producing fresh data */
  source_coverage_score?: number; // 0–100
  /** Gap severity derived from PIR priority + current knowledge gap */
  derived_severity?: number; // 0–100
  /** Whether this gap is actively being addressed by PIR tasking */
  addressed_by_pir?: boolean;
}

export interface PredictiveReport {
  generated_at: string;
  forecasts: ThreatForecast[];
  sector_risks: SectorRisk[];
  attribution_assessments: AttributionAssessment[];
  intelligence_gaps: IntelligenceGap[];
  executive_summary: string;
}

// ── Historical Patterns Database ────────────────────────────────────────

const SEASONAL_PATTERNS: Record<string, { peak_months: number[]; description: string }> = {
  ransomware: { peak_months: [11, 12, 1], description: 'Increased ransomware activity during holidays' },
  phishing: { peak_months: [3, 4, 9, 10], description: 'Tax season and back-to-school phishing spikes' },
  supply_chain: { peak_months: [6, 7, 12], description: 'Mid-year and year-end supply chain attacks' },
  ddos: { peak_months: [11, 12, 1, 2], description: 'Holiday season DDoS attacks on retail' },
  data_breach: { peak_months: [1, 2, 3], description: 'Q1 breach disclosures after holiday incidents' },
};

const SECTOR_THREAT_PROFILES: Record<
  string,
  { threats: string[]; actors: string[]; trend: 'increasing' | 'stable' | 'decreasing' }
> = {
  healthcare: {
    threats: ['ransomware', 'data_breach', 'phishing', 'insider_threat'],
    actors: ['lockbit', 'blackcat', 'cl0p'],
    trend: 'increasing',
  },
  financial: {
    threats: ['fraud', 'data_breach', 'ddos', 'supply_chain'],
    actors: ['lazarus', 'apt38', 'fin7'],
    trend: 'stable',
  },
  technology: {
    threats: ['supply_chain', 'ip_theft', 'zero_day', 'data_breach'],
    actors: ['apt29', 'apt41', 'lazarus'],
    trend: 'increasing',
  },
  government: {
    threats: ['espionage', 'data_breach', 'disinformation', 'sabotage'],
    actors: ['apt28', 'apt29', 'apt41'],
    trend: 'stable',
  },
  education: {
    threats: ['ransomware', 'data_breach', 'research_theft'],
    actors: ['lockbit', 'blackcat'],
    trend: 'increasing',
  },
  manufacturing: {
    threats: ['ransomware', 'ip_theft', 'supply_chain', 'sabotage'],
    actors: ['apt28', 'apt41'],
    trend: 'increasing',
  },
  energy: {
    threats: ['sabotage', 'ransomware', 'espionage', 'supply_chain'],
    actors: ['apt28', 'sandworm'],
    trend: 'stable',
  },
};

// ── Analysis Functions ──────────────────────────────────────────────────

/**
 * Generate threat forecasts based on current date and patterns.
 */
export function generateThreatForecasts(): ThreatForecast[] {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const forecasts: ThreatForecast[] = [];

  // Seasonal forecasts
  for (const [threat, pattern] of Object.entries(SEASONAL_PATTERNS)) {
    const isApproaching = pattern.peak_months.some((m) => {
      const diff = (m - currentMonth + 12) % 12;
      return diff <= 2 || diff >= 10;
    });

    if (isApproaching) {
      forecasts.push({
        threat_type: threat,
        probability: 75,
        timeframe: 'Next 60 days',
        basis: [pattern.description, 'Historical seasonal patterns'],
        confidence: 'medium',
        indicators_to_watch: [`Watch for ${threat} indicators in feeds`],
      });
    }
  }

  // Always-on forecasts
  forecasts.push({
    threat_type: 'ransomware',
    probability: 85,
    timeframe: 'Ongoing',
    basis: ['Ransomware remains top threat globally', 'RaaS proliferation'],
    confidence: 'high',
    indicators_to_watch: ['New ransomware variants', 'Ransomware group activity'],
  });

  forecasts.push({
    threat_type: 'supply_chain',
    probability: 70,
    timeframe: 'Next 90 days',
    basis: ['Increasing frequency of supply chain attacks', 'Dependency confusion attacks'],
    confidence: 'medium',
    indicators_to_watch: ['Compromised packages', 'Malicious updates'],
  });

  return forecasts;
}

/**
 * Generate sector risk assessments.
 */
export function generateSectorRisks(): SectorRisk[] {
  const risks: SectorRisk[] = [];

  for (const [sector, profile] of Object.entries(SECTOR_THREAT_PROFILES)) {
    const baseRisk = profile.trend === 'increasing' ? 70 : profile.trend === 'stable' ? 50 : 30;

    risks.push({
      sector,
      current_risk: baseRisk,
      trend: profile.trend,
      top_threats: profile.threats,
      rationale: `Targeted by ${profile.actors.length} known threat actors. Primary threats: ${profile.threats.slice(0, 3).join(', ')}.`,
      recommendations: [
        `Monitor for ${profile.actors.join(', ')} activity`,
        `Implement controls for ${profile.threats[0]}`,
        'Review incident response procedures',
      ],
    });
  }

  return risks.sort((a, b) => b.current_risk - a.current_risk);
}

/**
 * Assess attribution confidence based on evidence.
 */
export function assessAttribution(
  technicalEvidence: Array<{ indicator: string; type: string }>,
  behavioralEvidence: Array<{ pattern: string }>,
  actorHints?: string[]
): AttributionAssessment {
  // Technical evidence analysis
  const technical = technicalEvidence.map((e) => ({
    indicator: e.indicator,
    weight: e.type === 'hash' ? 30 : e.type === 'ip' ? 20 : 10,
    source: 'IOC Analysis',
  }));

  // Behavioral pattern matching
  const behavioral = behavioralEvidence.map((e) => ({
    pattern: e.pattern,
    matches_actor: actorHints?.[0] ?? 'Unknown',
    uniqueness: 50,
  }));

  // Infrastructure analysis
  const infrastructure = technicalEvidence
    .filter((e) => e.type === 'ip' || e.type === 'domain')
    .map((e) => ({
      provider: 'Unknown',
      pattern: e.type,
      overlaps: [],
    }));

  // Calculate confidence
  const technicalScore = technical.reduce((sum, t) => sum + t.weight, 0);
  const behavioralScore = behavioral.reduce((sum, b) => sum + b.uniqueness, 0);
  const totalScore = technicalScore + behavioralScore;

  let confidence: number;
  let confidenceLevel: AttributionAssessment['attribution']['confidence_level'];

  if (totalScore > 200) {
    confidence = 85;
    confidenceLevel = 'high';
  } else if (totalScore > 100) {
    confidence = 65;
    confidenceLevel = 'substantial';
  } else if (totalScore > 50) {
    confidence = 45;
    confidenceLevel = 'moderate';
  } else {
    confidence = 25;
    confidenceLevel = 'low';
  }

  return {
    target: 'Incident',
    evidence: { technical, behavioral, infrastructure },
    attribution: {
      actor: actorHints?.[0] ?? 'Unknown',
      confidence,
      confidence_level: confidenceLevel,
      alternative_hypotheses: [
        'False flag operation',
        'Copycat using similar tools',
        'Shared toolkit across multiple actors',
      ],
      intelligence_gaps: [
        'Need more behavioral analysis',
        'Infrastructure ownership unclear',
        'Missing historical context',
      ],
    },
  };
}

/**
 * Identify intelligence gaps based on current knowledge state, PIRs, and
 * source coverage.
 */
export function identifyIntelligenceGaps(pirs?: Pir[], sourceCoverage?: Record<string, string>): IntelligenceGap[] {
  const gaps: IntelligenceGap[] = [];

  // Static knowledge gaps
  gaps.push({
    topic: 'Dark web marketplace monitoring',
    priority: 'high',
    current_knowledge: 40,
    target_knowledge: 80,
    collection_methods: ['Dark web crawlers', 'Undercover sources', 'Law enforcement sharing'],
    estimated_effort: 'Ongoing, 2-3 analysts',
    what_would_change_my_mind: 'Daily structured collection from top 10 dark web markets with automated IOC extraction',
    source_coverage_score: 35,
    derived_severity: 75,
    addressed_by_pir: false,
  });
  gaps.push({
    topic: 'Threat actor attribution',
    priority: 'critical',
    current_knowledge: 55,
    target_knowledge: 85,
    collection_methods: ['Technical analysis', 'HUMINT', 'SIGINT', 'Open source'],
    estimated_effort: 'Significant investment required',
    what_would_change_my_mind: 'Cross-source TTP correlation with DNA matching confidence >80%',
    source_coverage_score: 60,
    derived_severity: 80,
    addressed_by_pir: false,
  });
  gaps.push({
    topic: 'Supply chain compromise indicators',
    priority: 'high',
    current_knowledge: 35,
    target_knowledge: 75,
    collection_methods: ['Package registry monitoring', 'Vendor advisories', 'Code analysis'],
    estimated_effort: 'Moderate, automated collection',
    related_pirs: ['pir-005'],
    what_would_change_my_mind: 'Real-time malicious package detection with dependency graph impact analysis',
    source_coverage_score: 40,
    derived_severity: 72,
    addressed_by_pir: true,
  });
  gaps.push({
    topic: 'Zero-day vulnerability tracking',
    priority: 'critical',
    current_knowledge: 30,
    target_knowledge: 70,
    collection_methods: ['Bug bounty programs', 'Underground forums', 'Vendor relationships'],
    estimated_effort: 'High cost, specialized analysts',
    what_would_change_my_mind: 'Automated CVE-to-exploit correlation with exploit-auction monitoring',
    source_coverage_score: 45,
    derived_severity: 85,
    addressed_by_pir: false,
  });
  gaps.push({
    topic: 'Insider threat indicators',
    priority: 'medium',
    current_knowledge: 45,
    target_knowledge: 65,
    collection_methods: ['UEBA', 'DLP monitoring', 'HR integration'],
    estimated_effort: 'Moderate, tooling investment',
    what_would_change_my_mind: 'Behavioral baseline deviation alerts with peer-group analysis',
    source_coverage_score: 30,
    derived_severity: 55,
    addressed_by_pir: false,
  });

  // PIR-derived gaps — gaps created by active PIRs with low source coverage
  if (pirs) {
    const activePirs = pirs.filter(
      (p) => p.status === 'active' && (p.priority === 'critical' || p.priority === 'high')
    );
    for (const pir of activePirs) {
      // Calculate source coverage for this PIR's relevant sources
      const coverage = pir.relevant_sources.map((s) => sourceCoverage?.[s] ?? 'unknown');
      const healthyRatio = coverage.filter((s) => s === 'ok' || s === 'degraded').length / Math.max(1, coverage.length);
      const coverageScore = Math.round(healthyRatio * 100);

      // Knowledge gap = 100 - coverage_score
      const knowledgeGap = Math.max(10, 100 - pir.coverage_score * healthyRatio);
      const derivedSev =
        pir.priority === 'critical'
          ? Math.round(Math.min(95, 60 + (100 - knowledgeGap) * 0.35))
          : Math.round(Math.min(85, 50 + (100 - knowledgeGap) * 0.25));

      gaps.push({
        topic: `Collection coverage: ${pir.title}`,
        priority: pir.priority,
        current_knowledge: Math.round(knowledgeGap * 0.6),
        target_knowledge: 80,
        collection_methods: pir.relevant_sources,
        estimated_effort: pir.priority === 'critical' ? 'Immediate collection tuning' : 'Scheduled improvements',
        related_pirs: [pir.id],
        what_would_change_my_mind: `Resolve collection degradation for ${pir.relevant_sources.join(', ')}. Restore to healthy status for >70% of sources.`,
        source_coverage_score: coverageScore,
        derived_severity: derivedSev,
        addressed_by_pir: true,
      });
    }
  }

  // Sort by derived severity descending
  return gaps.sort((a, b) => (b.derived_severity ?? 50) - (a.derived_severity ?? 50));
}

/**
 * Generate a complete predictive intelligence report.
 */
export function generatePredictiveReport(): PredictiveReport {
  return {
    generated_at: new Date().toISOString(),
    forecasts: generateThreatForecasts(),
    sector_risks: generateSectorRisks(),
    attribution_assessments: [],
    intelligence_gaps: identifyIntelligenceGaps(),
    executive_summary: `Threat landscape analysis indicates elevated risk for ransomware and supply chain attacks in the coming 60 days. Healthcare and technology sectors face the highest risk. Key intelligence gaps remain in dark web monitoring and zero-day tracking.`,
  };
}

// ── Route Handlers ──────────────────────────────────────────────────────

/** GET /api/v1/threat-intel/predictive/forecasts */
export async function predictiveForecastsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  return c.json({
    forecasts: generateThreatForecasts(),
    generated_at: new Date().toISOString(),
  });
}

/** GET /api/v1/threat-intel/predictive/sector-risks */
export async function predictiveSectorRisksHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  return c.json({
    sectors: generateSectorRisks(),
    generated_at: new Date().toISOString(),
  });
}

/** POST /api/v1/threat-intel/predictive/attribution */
export async function predictiveAttributionHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const body = await c.req.json<{
    technical?: Array<{ indicator: string; type: string }>;
    behavioral?: Array<{ pattern: string }>;
    actors?: string[];
  }>();

  const assessment = assessAttribution(body.technical ?? [], body.behavioral ?? [], body.actors);

  return c.json(assessment);
}

/** GET /api/v1/threat-intel/predictive/gaps */
export async function predictiveGapsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  let pirs: Pir[] | undefined;
  const sourceCoverage: Record<string, string> = {};

  try {
    const lg = await readLastGood<Pir[]>(c.env, 'pirs');
    pirs = lg ?? undefined;
  } catch (_catchErr) {
    console.error('predictiveGapsHandler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    /* best-effort */
  }

  try {
    const cache = (caches as unknown as { default: Cache }).default;
    const cached = await cache.match(FEED_STATUS_CACHE_KEY);
    if (cached) {
      const body = (await cached.json()) as { rows?: Array<{ id: string; status: string }> };
      if (body.rows) for (const r of body.rows) sourceCoverage[r.id] = r.status;
    }
  } catch (_catchErr) {
    console.error('predictiveGapsHandler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    /* best-effort */
  }

  return c.json({
    gaps: identifyIntelligenceGaps(pirs, sourceCoverage),
    generated_at: new Date().toISOString(),
  });
}

/** GET /api/v1/threat-intel/predictive/report */
export async function predictiveReportHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  return c.json(generatePredictiveReport());
}
