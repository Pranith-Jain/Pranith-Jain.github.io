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
  topTools: Array<{ tool: string; count: number; avgDurationMs: number; successRate: number }>;
  topModels: Array<{ model: string; count: number; avgScore: number }>;
  errorRate: number;
  recentErrors: Array<{ query: string; error: string; at: string }>;
  /** Telemetry for the agent upgrades (parallel burst, self-correction, etc.). */
  features: {
    parallelBurst: number;
    selfCorrection: number;
    avgScoreDelta: number;
    routingRefinements: number;
    avgFindings: number;
    avgCostUsd: number;
    convergenceIterations: number;
    avgSelfEvalScore: number;
    dataGapsCount: number;
  };
}

/** Per-tool execution sample recorded on investigation completion. */
export interface ToolTiming {
  name: string;
  ms: number;
  ok: boolean;
}

/** New-feature telemetry recorded alongside each investigation. */
export interface InvestigationMeta {
  parallelBurst?: boolean;
  selfCorrection?: boolean;
  /** QA score improvement from self-correction (to - from). */
  scoreDelta?: number;
  /** True when a generic query was refined to a specific route. */
  routingRefined?: boolean;
  findings?: number;
  graphNodes?: number;
  /** Estimated LLM cost (USD) for the investigation. */
  costUsd?: number;
  /** Total estimated tokens consumed. */
  tokens?: number;
  /** Number of LLM completion calls. */
  llmCalls?: number;
  /** GAN convergence: number of generator-evaluator iterations (0 = no retry). */
  convergenceIterations?: number;
  /** Self-eval overall score (1-5) if the self-eval ran. */
  selfEvalScore?: number;
  /** Number of tool failures captured by introspection. */
  dataGapsCount?: number;
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
    toolTimings?: ToolTiming[];
    meta?: InvestigationMeta;
    error?: string;
    completedAt: string;
  }
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO agent_metrics (id, query, status, total_steps, duration_ms, quality_score, model_used, tools_used, tool_timings, meta, error, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        JSON.stringify(entry.toolTimings ?? []),
        JSON.stringify(entry.meta ?? {}),
        entry.error ?? null,
        entry.completedAt
      )
      .run();
  } catch (err) {
    console.error('recordMetrics failed:', err);
  }
}

/**
 * Pure aggregation of per-investigation rows into top-tools (with real latency
 * + success rate) and feature telemetry. Prefers the per-tool `tool_timings`
 * blob (migration 0041); falls back to the legacy `tools_used` name list for
 * older rows. Extracted for unit testing.
 */
export function aggregateObservability(
  rows: Array<{ tools_used: string; tool_timings: string | null; meta?: string | null }>
): {
  topTools: Array<{ tool: string; count: number; avgDurationMs: number; successRate: number }>;
  features: AgentMetrics['features'];
} {
  const toolStats = new Map<string, { count: number; totalMs: number; ok: number }>();
  const bump = (name: string, ms: number, ok: boolean) => {
    const s = toolStats.get(name) ?? { count: 0, totalMs: 0, ok: 0 };
    s.count += 1;
    s.totalMs += ms;
    if (ok) s.ok += 1;
    toolStats.set(name, s);
  };
  let parallelBurst = 0;
  let selfCorrection = 0;
  let scoreDeltaSum = 0;
  let scoreDeltaCount = 0;
  let routingRefinements = 0;
  let findingsSum = 0;
  let findingsCount = 0;
  let costSum = 0;
  let costCount = 0;
  let convergenceIterations = 0;
  let selfEvalScoreSum = 0;
  let selfEvalScoreCount = 0;
  let dataGapsCount = 0;

  for (const row of rows) {
    let usedTimings = false;
    if (row.tool_timings) {
      try {
        const timings = JSON.parse(row.tool_timings) as ToolTiming[];
        if (Array.isArray(timings) && timings.length > 0) {
          for (const t of timings) {
            if (t && typeof t.name === 'string') bump(t.name, Number(t.ms) || 0, t.ok !== false);
          }
          usedTimings = true;
        }
      } catch {
        /* skip malformed */
      }
    }
    if (!usedTimings) {
      try {
        const tools = JSON.parse(row.tools_used) as unknown;
        if (Array.isArray(tools)) {
          for (const t of tools) if (typeof t === 'string') bump(t, 0, true);
        }
      } catch {
        /* skip malformed */
      }
    }
    if (row.meta) {
      try {
        const m = JSON.parse(row.meta) as InvestigationMeta;
        if (m.parallelBurst) parallelBurst++;
        if (m.selfCorrection) selfCorrection++;
        if (typeof m.scoreDelta === 'number') {
          scoreDeltaSum += m.scoreDelta;
          scoreDeltaCount++;
        }
        if (m.routingRefined) routingRefinements++;
        if (typeof m.findings === 'number') {
          findingsSum += m.findings;
          findingsCount++;
        }
        if (typeof m.costUsd === 'number') {
          costSum += m.costUsd;
          costCount++;
        }
        if (typeof m.convergenceIterations === 'number') {
          convergenceIterations += m.convergenceIterations;
        }
        if (typeof m.selfEvalScore === 'number') {
          selfEvalScoreSum += m.selfEvalScore;
          selfEvalScoreCount++;
        }
        if (typeof m.dataGapsCount === 'number') {
          dataGapsCount += m.dataGapsCount;
        }
      } catch {
        /* skip malformed */
      }
    }
  }

  const topTools = [...toolStats.entries()]
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 10)
    .map(([tool, s]) => ({
      tool,
      count: s.count,
      avgDurationMs: s.count > 0 ? Math.round(s.totalMs / s.count) : 0,
      successRate: s.count > 0 ? Math.round((s.ok / s.count) * 100) : 0,
    }));

  return {
    topTools,
    features: {
      parallelBurst,
      selfCorrection,
      avgScoreDelta: scoreDeltaCount > 0 ? Math.round(scoreDeltaSum / scoreDeltaCount) : 0,
      routingRefinements,
      avgFindings: findingsCount > 0 ? Math.round(findingsSum / findingsCount) : 0,
      avgCostUsd: costCount > 0 ? Math.round((costSum / costCount) * 10000) / 10000 : 0,
      convergenceIterations,
      avgSelfEvalScore: selfEvalScoreCount > 0 ? Math.round((selfEvalScoreSum / selfEvalScoreCount) * 10) / 10 : 0,
      dataGapsCount,
    },
  };
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

    // Top tools + feature telemetry (pure aggregation, unit-tested separately).
    const { results: toolRows } = await db
      .prepare(`SELECT tools_used, tool_timings, meta FROM agent_metrics WHERE status = 'done'`)
      .all<{ tools_used: string; tool_timings: string | null; meta: string | null }>();
    const { topTools, features } = aggregateObservability(toolRows);

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
      features,
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
      features: {
        parallelBurst: 0,
        selfCorrection: 0,
        avgScoreDelta: 0,
        routingRefinements: 0,
        avgFindings: 0,
        avgCostUsd: 0,
        convergenceIterations: 0,
        avgSelfEvalScore: 0,
        dataGapsCount: 0,
      },
    };
  }
}

/** Per-tool health derived from historical executions. */
export interface ToolHealth {
  count: number;
  successRate: number;
  avgDurationMs: number;
}

/**
 * Read per-tool health (success rate + avg latency) across all recorded
 * investigations. Used for adaptive tool selection.
 */
export async function getToolHealth(db: D1Database): Promise<Record<string, ToolHealth>> {
  try {
    const { results } = await db
      .prepare(`SELECT tools_used, tool_timings FROM agent_metrics WHERE status = 'done'`)
      .all<{ tools_used: string; tool_timings: string | null }>();
    const { topTools } = aggregateObservability(results);
    const out: Record<string, ToolHealth> = {};
    for (const t of topTools) {
      out[t.tool] = { count: t.count, successRate: t.successRate, avgDurationMs: t.avgDurationMs };
    }
    return out;
  } catch (err) {
    console.error('getToolHealth failed:', err);
    return {};
  }
}

/**
 * Pure selector: return the names of tools that should be deprioritized, based
 * on historical health. A tool is degraded when it has enough samples AND its
 * success rate is below `minSuccessRate`. Sorted worst-first.
 */
export function selectDegradedTools(
  health: Record<string, ToolHealth>,
  opts: { minSuccessRate?: number; minSamples?: number } = {}
): string[] {
  const minSuccessRate = opts.minSuccessRate ?? 50;
  const minSamples = opts.minSamples ?? 3;
  return Object.entries(health)
    .filter(([, h]) => h.count >= minSamples && h.successRate < minSuccessRate)
    .sort(([, a], [, b]) => a.successRate - b.successRate)
    .map(([tool]) => tool);
}
