/**
 * IOC Lifecycle Management System
 *
 * Tracks IOCs through their lifecycle stages:
 *   1. Discovery: First seen in a feed or manual submission
 *   2. Enrichment: Checked across multiple providers
 *   3. Classification: Assigned severity and confidence
 *   4. Action: Promoted to blocklist, watchlist, or archived
 *   5. Decay: Confidence decreases over time without re-observation
 *
 * Uses exponential moving average for decay scoring.
 * Integrates with the watch engine for automated promotion.
 */

import type { D1Database } from '@cloudflare/workers-types';

// ── Types ────────────────────────────────────────────────────────

export type IocStage = 'discovered' | 'enriched' | 'classified' | 'active' | 'archived';
export type IocConfidence = 'confirmed' | 'probable' | 'possible' | 'doubtful';

export interface IocLifecycleEntry {
  id: string;
  indicator: string;
  indicator_type: string;
  stage: IocStage;
  confidence: IocConfidence;
  score: number; // 0-100
  first_seen: string;
  last_seen: string;
  observation_count: number;
  source_count: number;
  sources: string[]; // JSON array
  tags: string[]; // JSON array
  decay_rate: number; // Exponential decay factor
  promoted_at?: string;
  archived_at?: string;
  created_at: string;
  updated_at: string;
}

export interface IocObservation {
  source: string;
  score: number;
  verdict: string;
  observed_at: string;
  raw_data?: Record<string, unknown>;
}

// ── Configuration ────────────────────────────────────────────────

const DECAY_HALF_LIFE_DAYS = 30; // Score halves every 30 days
const STAGE_THRESHOLDS: Record<IocStage, { minScore: number; minSources: number; minObservations: number }> = {
  discovered: { minScore: 0, minSources: 0, minObservations: 1 },
  enriched: { minScore: 20, minSources: 1, minObservations: 2 },
  classified: { minScore: 40, minSources: 2, minObservations: 5 },
  active: { minScore: 60, minSources: 3, minObservations: 10 },
  archived: { minScore: 0, minSources: 0, minObservations: 0 },
};

// ── Core Functions ───────────────────────────────────────────────

/**
 * Calculate exponential decay factor.
 * Returns a multiplier between 0 and 1 based on time since last observation.
 */
export function calculateDecay(lastSeen: string, now: Date = new Date()): number {
  const lastSeenDate = new Date(lastSeen);
  const daysSince = (now.getTime() - lastSeenDate.getTime()) / (1000 * 60 * 60 * 24);
  return Math.pow(0.5, daysSince / DECAY_HALF_LIFE_DAYS);
}

/**
 * Calculate IOC confidence based on source diversity and observation count.
 */
export function calculateConfidence(sourceCount: number, observationCount: number): IocConfidence {
  if (sourceCount >= 5 && observationCount >= 10) return 'confirmed';
  if (sourceCount >= 3 && observationCount >= 5) return 'probable';
  if (sourceCount >= 2 && observationCount >= 2) return 'possible';
  return 'doubtful';
}

/**
 * Determine IOC stage based on metrics.
 */
export function determineStage(
  score: number,
  sourceCount: number,
  observationCount: number,
  currentStage: IocStage
): IocStage {
  // Never demote from archived
  if (currentStage === 'archived') return 'archived';

  // Check promotion thresholds (highest to lowest)
  for (const stage of ['active', 'classified', 'enriched', 'discovered'] as IocStage[]) {
    const threshold = STAGE_THRESHOLDS[stage];
    if (score >= threshold.minScore && sourceCount >= threshold.minSources && observationCount >= threshold.minObservations) {
      return stage;
    }
  }

  return 'discovered';
}

/**
 * Record a new IOC observation and update lifecycle.
 */
export async function recordObservation(
  db: D1Database,
  indicator: string,
  indicatorType: string,
  observation: IocObservation
): Promise<IocLifecycleEntry> {
  const now = new Date().toISOString();
  const indicatorLower = indicator.toLowerCase();

  // Get or create lifecycle entry
  let entry = await db
    .prepare('SELECT * FROM ioc_lifecycle WHERE indicator = ?')
    .bind(indicatorLower)
    .first<IocLifecycleEntry>();

  if (!entry) {
    // Create new entry
    const id = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO ioc_lifecycle (id, indicator, indicator_type, stage, confidence, score, 
         first_seen, last_seen, observation_count, source_count, sources, tags, decay_rate, created_at, updated_at)
         VALUES (?, ?, ?, 'discovered', 'doubtful', ?, ?, ?, 1, 1, ?, '[]', 1.0, ?, ?)`
      )
      .bind(
        id,
        indicatorLower,
        indicatorType,
        observation.score,
        now,
        now,
        JSON.stringify([observation.source]),
        now,
        now
      )
      .run();

    entry = {
      id,
      indicator: indicatorLower,
      indicator_type: indicatorType,
      stage: 'discovered',
      confidence: 'doubtful',
      score: observation.score,
      first_seen: now,
      last_seen: now,
      observation_count: 1,
      source_count: 1,
      sources: [observation.source],
      tags: [],
      decay_rate: 1.0,
      created_at: now,
      updated_at: now,
    };
  } else {
    // Update existing entry
    const sources = new Set<string>(Array.isArray(entry.sources) ? entry.sources : JSON.parse(entry.sources as unknown as string || '[]'));
    sources.add(observation.source);

    // Calculate new score (weighted average with existing)
    const existingWeight = entry.observation_count;
    const newWeight = 1;
    const totalWeight = existingWeight + newWeight;
    const newScore = Math.round(
      (entry.score * existingWeight + observation.score * newWeight) / totalWeight
    );

    // Apply decay to score
    const decay = calculateDecay(entry.last_seen, new Date(now));
    const decayedScore = Math.round(newScore * decay);

    // Determine new stage and confidence
    const newStage = determineStage(decayedScore, sources.size, entry.observation_count + 1, entry.stage);
    const newConfidence = calculateConfidence(sources.size, entry.observation_count + 1);

    await db
      .prepare(
        `UPDATE ioc_lifecycle SET
         stage = ?, confidence = ?, score = ?, last_seen = ?,
         observation_count = observation_count + 1,
         source_count = ?, sources = ?, decay_rate = ?, updated_at = ?
         WHERE id = ?`
      )
      .bind(
        newStage,
        newConfidence,
        decayedScore,
        now,
        sources.size,
        JSON.stringify([...sources]),
        decay,
        now,
        entry.id
      )
      .run();

    entry = {
      ...entry,
      stage: newStage,
      confidence: newConfidence,
      score: decayedScore,
      last_seen: now,
      observation_count: entry.observation_count + 1,
      source_count: sources.size,
      sources: [...sources],
      decay_rate: decay,
      updated_at: now,
    };
  }

  // Record individual observation
  await db
    .prepare(
      `INSERT INTO ioc_observations (indicator, source, score, verdict, observed_at, raw_data)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(
      indicatorLower,
      observation.source,
      observation.score,
      observation.verdict,
      observation.observed_at,
      observation.raw_data ? JSON.stringify(observation.raw_data) : null
    )
    .run();

  return entry;
}

/**
 * Get IOC lifecycle with decay-adjusted score.
 */
export async function getIocLifecycle(
  db: D1Database,
  indicator: string
): Promise<IocLifecycleEntry | null> {
  const entry = await db
    .prepare('SELECT * FROM ioc_lifecycle WHERE indicator = ?')
    .bind(indicator.toLowerCase())
    .first<IocLifecycleEntry>();

  if (!entry) return null;

  // Apply real-time decay to score
  const decay = calculateDecay(entry.last_seen);
  const decayedScore = Math.round(entry.score * decay);

  return {
    ...entry,
    score: decayedScore,
    sources: Array.isArray(entry.sources) ? entry.sources : JSON.parse(entry.sources as unknown as string || '[]'),
    tags: Array.isArray(entry.tags) ? entry.tags : JSON.parse(entry.tags as unknown as string || '[]'),
  };
}

/**
 * Get trending IOCs (most active in last 24 hours).
 */
export async function getTrendingIocs(
  db: D1Database,
  limit: number = 50,
  indicatorType?: string
): Promise<IocLifecycleEntry[]> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  let query = `
    SELECT * FROM ioc_lifecycle 
    WHERE last_seen >= ? AND stage != 'archived'
    ORDER BY score DESC, observation_count DESC
    LIMIT ?
  `;
  const params: unknown[] = [twentyFourHoursAgo, limit];

  if (indicatorType) {
    query = `
      SELECT * FROM ioc_lifecycle 
      WHERE last_seen >= ? AND indicator_type = ? AND stage != 'archived'
      ORDER BY score DESC, observation_count DESC
      LIMIT ?
    `;
    params.splice(1, 0, indicatorType);
  }

  const results = await db.prepare(query).bind(...params).all<IocLifecycleEntry>();
  return (results.results ?? []).map((entry) => ({
    ...entry,
    sources: Array.isArray(entry.sources) ? entry.sources : JSON.parse(entry.sources as unknown as string || '[]'),
    tags: Array.isArray(entry.tags) ? entry.tags : JSON.parse(entry.tags as unknown as string || '[]'),
  }));
}

/**
 * Promote IOC to a higher stage.
 */
export async function promoteIoc(
  db: D1Database,
  indicator: string,
  targetStage: IocStage,
  reason: string
): Promise<boolean> {
  const entry = await getIocLifecycle(db, indicator);
  if (!entry) return false;

  const stageOrder: IocStage[] = ['discovered', 'enriched', 'classified', 'active', 'archived'];
  const currentIndex = stageOrder.indexOf(entry.stage);
  const targetIndex = stageOrder.indexOf(targetStage);

  if (targetIndex <= currentIndex) return false; // Can only promote forward

  await db
    .prepare(
      'UPDATE ioc_lifecycle SET stage = ?, promoted_at = ?, updated_at = ? WHERE indicator = ?'
    )
    .bind(targetStage, new Date().toISOString(), new Date().toISOString(), indicator.toLowerCase())
    .run();

  // Record promotion event
  await db
    .prepare(
      `INSERT INTO ioc_events (indicator, event_type, from_stage, to_stage, reason, created_at)
       VALUES (?, 'promotion', ?, ?, ?, ?)`
    )
    .bind(indicator.toLowerCase(), entry.stage, targetStage, reason, new Date().toISOString())
    .run();

  return true;
}

/**
 * Archive IOC (soft delete).
 */
export async function archiveIoc(
  db: D1Database,
  indicator: string,
  reason: string
): Promise<boolean> {
  await db
    .prepare(
      'UPDATE ioc_lifecycle SET stage = \'archived\', archived_at = ?, updated_at = ? WHERE indicator = ?'
    )
    .bind(new Date().toISOString(), new Date().toISOString(), indicator.toLowerCase())
    .run();

  await db
    .prepare(
      `INSERT INTO ioc_events (indicator, event_type, from_stage, to_stage, reason, created_at)
       VALUES (?, 'archive', ?, 'archived', ?, ?)`
    )
    .bind(indicator.toLowerCase(), 'active', reason, new Date().toISOString())
    .run();

  return true;
}

/**
 * Get IOC statistics.
 */
export async function getIocStats(db: D1Database): Promise<{
  total: number;
  byStage: Record<IocStage, number>;
  byConfidence: Record<IocConfidence, number>;
  trending: number;
}> {
  const total = await db.prepare('SELECT COUNT(*) as count FROM ioc_lifecycle').first<{ count: number }>();

  const byStage = await db
    .prepare('SELECT stage, COUNT(*) as count FROM ioc_lifecycle GROUP BY stage')
    .all<{ stage: string; count: number }>();

  const byConfidence = await db
    .prepare('SELECT confidence, COUNT(*) as count FROM ioc_lifecycle GROUP BY confidence')
    .all<{ confidence: string; count: number }>();

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const trending = await db
    .prepare('SELECT COUNT(*) as count FROM ioc_lifecycle WHERE last_seen >= ?')
    .bind(twentyFourHoursAgo)
    .first<{ count: number }>();

  const stageMap: Record<IocStage, number> = { discovered: 0, enriched: 0, classified: 0, active: 0, archived: 0 };
  for (const row of byStage.results ?? []) {
    stageMap[row.stage as IocStage] = row.count;
  }

  const confidenceMap: Record<IocConfidence, number> = { confirmed: 0, probable: 0, possible: 0, doubtful: 0 };
  for (const row of byConfidence.results ?? []) {
    confidenceMap[row.confidence as IocConfidence] = row.count;
  }

  return {
    total: total?.count ?? 0,
    byStage: stageMap,
    byConfidence: confidenceMap,
    trending: trending?.count ?? 0,
  };
}
