/**
 * Observability dashboard — aggregates agent performance metrics
 * for monitoring and optimization. Stored in D1 for persistence.
 */

export interface AgentMetrics {
  totalInvestigations: number;
  successRate: number;
  avgQualityScore: number;
  avgStepsPerInvestigation: number;
  avgDurationMs: number;
  topTools: Array<{ tool: string; count: number; avgDurationMs: number }>;
  topModels: Array<{ model: string; count: number; avgScore: number }>;
  errorRate: number;
  recentErrors: Array<{ query: string; error: string; at: string }>;
}

/**
 * Record investigation completion metrics.
 */
export async function recordMetrics(
  db: D1Database,
  entry: {
    query: string;
    status: string;
    totalSteps: number;
    durationMs: number;
    qualityScore: number;
    modelUsed: string;
    toolsUsed: string[];
    error?: string;
    completedAt: string;
  }
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO agent_metrics (id, query, status, total_steps, duration_ms, quality_score, model_used, tools_used, error, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        crypto.randomUUID(),
        entry.query,
        entry.status,
        entry.totalSteps,
        entry.durationMs,
        entry.qualityScore,
        entry.modelUsed,
        JSON.stringify(entry.toolsUsed),
        entry.error ?? null,
        entry.completedAt
      )
      .run();
  } catch (err) {
    console.error('recordMetrics failed:', err);
  }
}

/**
 * Get aggregated agent metrics for the dashboard.
 */
export async function getAgentMetrics(db: D1Database): Promise<AgentMetrics> {
  try {
    // Total investigations
    const totalResult = await db.prepare(`SELECT COUNT(*) as cnt FROM agent_metrics`).first<{ cnt: number }>();
    const totalInvestigations = totalResult?.cnt ?? 0;

    // Success rate
    const successResult = await db
      .prepare(`SELECT COUNT(*) as cnt FROM agent_metrics WHERE status = 'done'`)
      .first<{ cnt: number }>();
    const successRate =
      totalInvestigations > 0 ? Math.round(((successResult?.cnt ?? 0) / totalInvestigations) * 100) : 0;

    // Average quality score
    const scoreResult = await db
      .prepare(`SELECT AVG(quality_score) as avg_score FROM agent_metrics WHERE status = 'done' AND quality_score > 0`)
      .first<{ avg_score: number }>();
    const avgQualityScore = Math.round(scoreResult?.avg_score ?? 0);

    // Average steps
    const stepsResult = await db
      .prepare(`SELECT AVG(total_steps) as avg_steps FROM agent_metrics`)
      .first<{ avg_steps: number }>();
    const avgStepsPerInvestigation = Math.round(stepsResult?.avg_steps ?? 0);

    // Average duration
    const durationResult = await db
      .prepare(`SELECT AVG(duration_ms) as avg_dur FROM agent_metrics WHERE status = 'done'`)
      .first<{ avg_dur: number }>();
    const avgDurationMs = Math.round(durationResult?.avg_dur ?? 0);

    // Top tools
    const { results: toolRows } = await db
      .prepare(`SELECT tools_used FROM agent_metrics WHERE status = 'done'`)
      .all<{ tools_used: string }>();
    const toolCounts = new Map<string, { count: number; totalDuration: number }>();
    for (const row of toolRows) {
      try {
        const tools = JSON.parse(row.tools_used) as string[];
        for (const t of tools) {
          const existing = toolCounts.get(t) ?? { count: 0, totalDuration: 0 };
          existing.count++;
          toolCounts.set(t, existing);
        }
      } catch {
        /* skip */
      }
    }
    const topTools = [...toolCounts.entries()]
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 10)
      .map(([tool, { count }]) => ({ tool, count, avgDurationMs: 0 }));

    // Top models
    const { results: modelRows } = await db
      .prepare(`SELECT model_used, quality_score FROM agent_metrics WHERE status = 'done' AND model_used != ''`)
      .all<{ model_used: string; quality_score: number }>();
    const modelStats = new Map<string, { count: number; totalScore: number }>();
    for (const row of modelRows) {
      const models = row.model_used.split(' → ');
      for (const m of models) {
        const key = m.split(':')[0] ?? m;
        const existing = modelStats.get(key) ?? { count: 0, totalScore: 0 };
        existing.count++;
        existing.totalScore += row.quality_score;
        modelStats.set(key, existing);
      }
    }
    const topModels = [...modelStats.entries()]
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 5)
      .map(([model, { count, totalScore }]) => ({
        model,
        count,
        avgScore: Math.round(totalScore / count),
      }));

    // Error rate
    const errorResult = await db
      .prepare(`SELECT COUNT(*) as cnt FROM agent_metrics WHERE status = 'error'`)
      .first<{ cnt: number }>();
    const errorRate = totalInvestigations > 0 ? Math.round(((errorResult?.cnt ?? 0) / totalInvestigations) * 100) : 0;

    // Recent errors
    const { results: errorRows } = await db
      .prepare(
        `SELECT query, error, completed_at FROM agent_metrics WHERE status = 'error' AND error IS NOT NULL ORDER BY completed_at DESC LIMIT 10`
      )
      .all<{ query: string; error: string; completed_at: string }>();
    const recentErrors = errorRows.map((r) => ({ query: r.query, error: r.error, at: r.completed_at }));

    return {
      totalInvestigations,
      successRate,
      avgQualityScore,
      avgStepsPerInvestigation,
      avgDurationMs,
      topTools,
      topModels,
      errorRate,
      recentErrors,
    };
  } catch (err) {
    console.error('getAgentMetrics failed:', err);
    return {
      totalInvestigations: 0,
      successRate: 0,
      avgQualityScore: 0,
      avgStepsPerInvestigation: 0,
      avgDurationMs: 0,
      topTools: [],
      topModels: [],
      errorRate: 0,
      recentErrors: [],
    };
  }
}
