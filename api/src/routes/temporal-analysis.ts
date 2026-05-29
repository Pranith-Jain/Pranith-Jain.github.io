import type { Context } from 'hono';
import type { Env } from '../env';
import type { D1Database } from '@cloudflare/workers-types';

/**
 * Temporal Analysis Engine — track how threats evolve over time.
 *
 * Features:
 *   - IOC lifecycle tracking (first seen → peak → decay)
 *   - Campaign detection (clusters of IOCs appearing together)
 *   - Threat velocity (how fast new IOCs appear)
 *   - Predictive scoring (when will an IOC go dormant?)
 *   - Kill chain phase detection
 *
 * This turns flat IOC data into temporal intelligence.
 */

// ── Types ───────────────────────────────────────────────────────────────

export interface TemporalIoc {
  indicator: string;
  type: string;
  timeline: Array<{
    timestamp: string;
    score: number;
    sources: string[];
    event: 'first_seen' | 'observed' | 'peak' | 'declining' | 'dormant';
  }>;
  velocity: {
    observations_per_day: number;
    trend: 'accelerating' | 'stable' | 'decelerating';
    predicted_dormancy: string | null; // ISO date
  };
  lifecycle_phase: 'emerging' | 'active' | 'declining' | 'dormant' | 'archived';
}

export interface Campaign {
  id: string;
  indicators: string[];
  first_seen: string;
  last_seen: string;
  duration_hours: number;
  phases: Array<{
    phase: string;
    start: string;
    end: string;
    indicators: string[];
  }>;
  confidence: number;
  attribution: {
    actors: string[];
    malware: string[];
    techniques: string[];
  };
}

export interface ThreatVelocity {
  period: string; // '1h', '24h', '7d', '30d'
  new_indicators: number;
  unique_types: Record<string, number>;
  top_sources: Array<{ source: string; count: number }>;
  acceleration: number; // Rate of change
}

export interface KillChainPhase {
  phase: string;
  description: string;
  indicators: string[];
  confidence: number;
  timestamp: string;
}

// ── Temporal Analysis Functions ──────────────────────────────────────────

/**
 * Build a timeline for a specific IOC.
 */
export async function buildIocTimeline(
  db: D1Database,
  indicator: string
): Promise<TemporalIoc | null> {
  const row = await db.prepare(
    'SELECT * FROM ioc_lifecycle WHERE indicator = ?'
  ).bind(indicator).first<{
    indicator: string;
    indicator_type: string;
    first_seen: string;
    last_seen: string;
    peak_score: number;
    current_score: number;
    observation_count: number;
    sources_seen: string;
    decay_rate: number;
  }>();

  if (!row) return null;

  const firstSeen = new Date(row.first_seen);
  const lastSeen = new Date(row.last_seen);
  const now = new Date();
  const ageHours = (now.getTime() - firstSeen.getTime()) / (1000 * 60 * 60);
  const inactiveHours = (now.getTime() - lastSeen.getTime()) / (1000 * 60 * 60);

  // Build timeline events
  const timeline: TemporalIoc['timeline'] = [
    {
      timestamp: row.first_seen,
      score: 0,
      sources: JSON.parse(row.sources_seen ?? '[]').slice(0, 3),
      event: 'first_seen',
    },
  ];

  // Add lifecycle events based on score changes
  if (row.peak_score > 50) {
    timeline.push({
      timestamp: row.last_seen, // Approximation
      score: row.peak_score,
      sources: JSON.parse(row.sources_seen ?? '[]'),
      event: 'peak',
    });
  }

  if (row.current_score < row.peak_score * 0.5) {
    timeline.push({
      timestamp: row.last_seen,
      score: row.current_score,
      sources: [],
      event: 'declining',
    });
  }

  if (inactiveHours > 168) { // 7 days
    timeline.push({
      timestamp: new Date(lastSeen.getTime() + 168 * 60 * 60 * 1000).toISOString(),
      score: 0,
      sources: [],
      event: 'dormant',
    });
  }

  // Calculate velocity
  const observationsPerDay = row.observation_count / Math.max(1, ageHours / 24);
  const trend: TemporalIoc['velocity']['trend'] =
    row.decay_rate > 5 ? 'accelerating' :
    row.decay_rate < -5 ? 'decelerating' : 'stable';

  // Predict dormancy
  let predictedDormancy: string | null = null;
  if (trend === 'decelerating' && row.current_score > 0) {
    const daysToDormancy = row.current_score / Math.abs(row.decay_rate);
    predictedDormancy = new Date(now.getTime() + daysToDormancy * 24 * 60 * 60 * 1000).toISOString();
  }

  // Determine lifecycle phase
  let lifecyclePhase: TemporalIoc['lifecycle_phase'];
  if (inactiveHours > 168) lifecyclePhase = 'dormant';
  else if (inactiveHours > 72) lifecyclePhase = 'archived';
  else if (row.decay_rate < -10) lifecyclePhase = 'declining';
  else if (ageHours < 24) lifecyclePhase = 'emerging';
  else lifecyclePhase = 'active';

  return {
    indicator: row.indicator,
    type: row.indicator_type,
    timeline,
    velocity: {
      observations_per_day: Math.round(observationsPerDay * 100) / 100,
      trend,
      predicted_dormancy: predictedDormancy,
    },
    lifecycle_phase: lifecyclePhase,
  };
}

/**
 * Detect campaigns — clusters of IOCs that appear together in time.
 */
export async function detectCampaigns(
  db: D1Database,
  windowHours: number = 24,
  minIndicators: number = 3
): Promise<Campaign[]> {
  // Get recent IOCs
  const rows = await db.prepare(`
    SELECT indicator, indicator_type, first_seen, last_seen, peak_score, sources_seen
    FROM ioc_lifecycle
    WHERE first_seen > datetime('now', '-30 days')
    ORDER BY first_seen
  `).all<{
    indicator: string;
    indicator_type: string;
    first_seen: string;
    last_seen: string;
    peak_score: number;
    sources_seen: string;
  }>();

  const iocs = rows.results ?? [];
  if (iocs.length < minIndicators) return [];

  // Temporal clustering: group IOCs that appear within windowHours of each other
  const campaigns: Campaign[] = [];
  const assigned = new Set<string>();

  for (let i = 0; i < iocs.length; i++) {
    const currentIoc = iocs[i];
    if (!currentIoc || assigned.has(currentIoc.indicator)) continue;

    const windowStart = new Date(currentIoc.first_seen);
    const windowEnd = new Date(windowStart.getTime() + windowHours * 60 * 60 * 1000);

    const cluster: typeof iocs = [currentIoc];
    assigned.add(currentIoc.indicator);

    for (let j = i + 1; j < iocs.length; j++) {
      const nextIoc = iocs[j];
      if (!nextIoc || assigned.has(nextIoc.indicator)) continue;

      const iocTime = new Date(nextIoc.first_seen);
      if (iocTime >= windowStart && iocTime <= windowEnd) {
        cluster.push(nextIoc);
        assigned.add(nextIoc.indicator);
      }
    }

    const firstItem = cluster[0];
    const lastItem = cluster[cluster.length - 1];
    if (cluster.length >= minIndicators && firstItem && lastItem) {
      const firstSeen = firstItem.first_seen;
      const lastSeen = lastItem.last_seen;
      const durationHours = (new Date(lastSeen).getTime() - new Date(firstSeen).getTime()) / (1000 * 60 * 60);

      // Detect kill chain phases
      const phases = detectKillChainPhases(cluster);

      campaigns.push({
        id: `campaign-${Date.now()}-${campaigns.length}`,
        indicators: cluster.map(c => c.indicator),
        first_seen: firstSeen,
        last_seen: lastSeen,
        duration_hours: Math.round(durationHours),
        phases,
        confidence: Math.min(100, cluster.length * 15),
        attribution: {
          actors: [],
          malware: [],
          techniques: [],
        },
      });
    }
  }

  return campaigns.sort((a, b) => b.indicators.length - a.indicators.length);
}

/**
 * Detect kill chain phases from IOC patterns.
 */
function detectKillChainPhases(
  iocs: Array<{ indicator: string; indicator_type: string; peak_score: number }>
): Campaign['phases'] {
  const phases: Campaign['phases'] = [];
  const now = new Date().toISOString();

  // Phase 1: Reconnaissance (domains, URLs)
  const reconIocs = iocs.filter(i => ['domain', 'url'].includes(i.indicator_type));
  if (reconIocs.length > 0) {
    phases.push({
      phase: 'Reconnaissance',
      start: now,
      end: now,
      indicators: reconIocs.map(i => i.indicator),
    });
  }

  // Phase 2: Weaponization (hashes appearing)
  const weaponIocs = iocs.filter(i => i.indicator_type === 'hash');
  if (weaponIocs.length > 0) {
    phases.push({
      phase: 'Weaponization',
      start: now,
      end: now,
      indicators: weaponIocs.map(i => i.indicator),
    });
  }

  // Phase 3: Delivery (phishing URLs, malicious domains)
  const deliveryIocs = iocs.filter(i =>
    i.indicator_type === 'url' && i.peak_score > 50
  );
  if (deliveryIocs.length > 0) {
    phases.push({
      phase: 'Delivery',
      start: now,
      end: now,
      indicators: deliveryIocs.map(i => i.indicator),
    });
  }

  // Phase 4: Command & Control (IPs, high-score domains)
  const c2Iocs = iocs.filter(i =>
    i.indicator_type === 'ipv4' || (i.indicator_type === 'domain' && i.peak_score > 70)
  );
  if (c2Iocs.length > 0) {
    phases.push({
      phase: 'Command & Control',
      start: now,
      end: now,
      indicators: c2Iocs.map(i => i.indicator),
    });
  }

  return phases;
}

/**
 * Calculate threat velocity — how fast threats are emerging.
 */
export async function calculateThreatVelocity(
  db: D1Database,
  period: '1h' | '24h' | '7d' | '30d'
): Promise<ThreatVelocity> {
  const periodMap = {
    '1h': '1 hour',
    '24h': '24 hours',
    '7d': '7 days',
    '30d': '30 days',
  };

  const periodHours: Record<string, string> = {
    '1h': '-1',
    '24h': '-24',
    '7d': '-168',
    '30d': '-720',
  };
  const hours = periodHours[period] ?? '-24';
  const rows = await db.prepare(`
    SELECT indicator_type, first_seen, sources_seen
    FROM ioc_lifecycle
    WHERE first_seen > datetime('now', ? || ' hours')
  `).bind(hours).all<{
    indicator_type: string;
    first_seen: string;
    sources_seen: string;
  }>();

  const iocs = rows.results ?? [];

  // Count by type
  const typeCounts: Record<string, number> = {};
  const sourceCounts: Record<string, number> = {};

  for (const ioc of iocs) {
    typeCounts[ioc.indicator_type] = (typeCounts[ioc.indicator_type] ?? 0) + 1;

    const sources: string[] = JSON.parse(ioc.sources_seen ?? '[]');
    for (const source of sources) {
      sourceCounts[source] = (sourceCounts[source] ?? 0) + 1;
    }
  }

  // Calculate acceleration (compare to previous period)
  const previousPeriodRows = await db.prepare(`
    SELECT COUNT(*) as count FROM ioc_lifecycle
    WHERE first_seen > datetime('now', '-${periodMap[period]}', '-${periodMap[period]}')
      AND first_seen <= datetime('now', '-${periodMap[period]}')
  `).first<{ count: number }>();

  const currentCount = iocs.length;
  const previousCount = previousPeriodRows?.count ?? 0;
  const acceleration = previousCount > 0
    ? ((currentCount - previousCount) / previousCount) * 100
    : 100;

  // Top sources
  const topSources = Object.entries(sourceCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([source, count]) => ({ source, count }));

  return {
    period,
    new_indicators: currentCount,
    unique_types: typeCounts,
    top_sources: topSources,
    acceleration: Math.round(acceleration * 100) / 100,
  };
}

/**
 * Predict when an IOC will become dormant based on historical patterns.
 */
export async function predictIocDormancy(
  db: D1Database,
  indicator: string
): Promise<{
  indicator: string;
  current_phase: string;
  predicted_dormancy: string | null;
  confidence: number;
  factors: string[];
} | null> {
  const row = await db.prepare(
    'SELECT * FROM ioc_lifecycle WHERE indicator = ?'
  ).bind(indicator).first<{
    indicator: string;
    indicator_type: string;
    first_seen: string;
    last_seen: string;
    peak_score: number;
    current_score: number;
    observation_count: number;
    decay_rate: number;
  }>();

  if (!row) return null;

  const now = new Date();
  const lastSeen = new Date(row.last_seen);
  const inactiveHours = (now.getTime() - lastSeen.getTime()) / (1000 * 60 * 60);

  const factors: string[] = [];
  let confidence = 50;

  // Factor 1: Decay rate
  if (row.decay_rate < -10) {
    factors.push('Rapidly declining score');
    confidence += 15;
  } else if (row.decay_rate < -5) {
    factors.push('Moderately declining score');
    confidence += 10;
  }

  // Factor 2: Observation frequency
  const ageDays = (now.getTime() - new Date(row.first_seen).getTime()) / (1000 * 60 * 60 * 24);
  const obsPerDay = row.observation_count / Math.max(1, ageDays);
  if (obsPerDay < 0.1) {
    factors.push('Low observation frequency');
    confidence += 10;
  }

  // Factor 3: Similar IOCs dormancy pattern
  const similarDormant = await db.prepare(`
    SELECT AVG(julianday(last_seen) - julianday(first_seen)) as avg_lifetime
    FROM ioc_lifecycle
    WHERE indicator_type = ?
      AND current_score < 10
      AND indicator != ?
  `).bind(row.indicator_type, indicator).first<{ avg_lifetime: number }>();

  if (similarDormant?.avg_lifetime) {
    factors.push(`Similar ${row.indicator_type} IOCs average ${Math.round(similarDormant.avg_lifetime)} day lifetime`);
    confidence += 10;
  }

  // Predict dormancy
  let predictedDormancy: string | null = null;
  if (row.decay_rate < 0 && row.current_score > 0) {
    const daysToDormancy = row.current_score / Math.abs(row.decay_rate);
    predictedDormancy = new Date(now.getTime() + daysToDormancy * 24 * 60 * 60 * 1000).toISOString();
  }

  // Current phase
  let currentPhase: string;
  if (inactiveHours > 168) currentPhase = 'dormant';
  else if (row.decay_rate < -10) currentPhase = 'declining';
  else if (ageDays < 1) currentPhase = 'emerging';
  else currentPhase = 'active';

  return {
    indicator: row.indicator,
    current_phase: currentPhase,
    predicted_dormancy: predictedDormancy,
    confidence: Math.min(95, confidence),
    factors,
  };
}

// ── Route Handlers ──────────────────────────────────────────────────────

/** GET /api/v1/temporal/timeline?indicator=... */
export async function temporalTimelineHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const indicator = c.req.query('indicator');
  if (!indicator) return c.json({ error: 'indicator required' }, 400);

  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'Database not configured' }, 503);

  const timeline = await buildIocTimeline(db, indicator);
  if (!timeline) {
    return c.json({ found: false, message: 'IOC not found in lifecycle database' });
  }

  return c.json({ found: true, timeline }, 200, { 'Cache-Control': 'public, max-age=60' });
}

/** GET /api/v1/temporal/campaigns */
export async function temporalCampaignsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'Database not configured' }, 503);

  const windowHours = parseInt(c.req.query('window') ?? '24');
  const minIndicators = parseInt(c.req.query('min') ?? '3');

  const campaigns = await detectCampaigns(db, windowHours, minIndicators);

  return c.json({
    campaigns,
    count: campaigns.length,
    window_hours: windowHours,
    min_indicators: minIndicators,
  }, 200, { 'Cache-Control': 'public, max-age=120' });
}

/** GET /api/v1/temporal/velocity */
export async function temporalVelocityHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'Database not configured' }, 503);

  const period = (c.req.query('period') ?? '24h') as '1h' | '24h' | '7d' | '30d';

  const velocity = await calculateThreatVelocity(db, period);

  return c.json(velocity, 200, { 'Cache-Control': 'public, max-age=60' });
}

/** GET /api/v1/temporal/predict?indicator=... */
export async function temporalPredictHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const indicator = c.req.query('indicator');
  if (!indicator) return c.json({ error: 'indicator required' }, 400);

  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'Database not configured' }, 503);

  const prediction = await predictIocDormancy(db, indicator);
  if (!prediction) {
    return c.json({ found: false, message: 'IOC not found' });
  }

  return c.json({ found: true, prediction }, 200, { 'Cache-Control': 'public, max-age=60' });
}
