/**
 * Confidence calibration tracking — records the agent's confidence
 * predictions and actual outcomes to improve future assessments.
 * Stored in D1 for persistence.
 */

export interface CalibrationEntry {
  id: string;
  query: string;
  predictedConfidence: 'high' | 'medium' | 'low';
  actualOutcome: 'correct' | 'partial' | 'incorrect';
  qualityScore: number;
  modelUsed: string;
  recordedAt: string;
}

/**
 * Record a calibration entry (after investigation completes).
 */
export async function recordCalibration(db: D1Database, entry: Omit<CalibrationEntry, 'id'>): Promise<void> {
  const id = crypto.randomUUID();
  try {
    await db
      .prepare(
        `INSERT INTO confidence_calibration (id, query, predicted_confidence, actual_outcome, quality_score, model_used, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        entry.query,
        entry.predictedConfidence,
        entry.actualOutcome,
        entry.qualityScore,
        entry.modelUsed,
        entry.recordedAt
      )
      .run();
  } catch (err) {
    console.error('recordCalibration failed:', err);
  }
}

/**
 * Get calibration statistics — accuracy per confidence level.
 */
export async function getCalibrationStats(
  db: D1Database
): Promise<Record<string, { total: number; correct: number; partial: number; incorrect: number; accuracy: number }>> {
  try {
    const { results } = await db
      .prepare(
        `SELECT predicted_confidence, actual_outcome, COUNT(*) as cnt FROM confidence_calibration GROUP BY predicted_confidence, actual_outcome`
      )
      .all<Record<string, unknown>>();

    const stats: Record<
      string,
      { total: number; correct: number; partial: number; incorrect: number; accuracy: number }
    > = {};

    for (const row of results) {
      const conf = String(row.predicted_confidence);
      const outcome = String(row.actual_outcome);
      const cnt = Number(row.cnt);

      if (!stats[conf]) stats[conf] = { total: 0, correct: 0, partial: 0, incorrect: 0, accuracy: 0 };
      stats[conf].total += cnt;
      if (outcome === 'correct') stats[conf].correct += cnt;
      else if (outcome === 'partial') stats[conf].partial += cnt;
      else stats[conf].incorrect += cnt;
    }

    // Calculate accuracy
    for (const conf of Object.keys(stats)) {
      const s = stats[conf]!;
      s.accuracy = s.total > 0 ? Math.round(((s.correct + s.partial * 0.5) / s.total) * 100) : 0;
    }

    return stats;
  } catch (err) {
    console.error('getCalibrationStats failed:', err);
    return {};
  }
}
