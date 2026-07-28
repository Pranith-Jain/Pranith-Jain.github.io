/**
 * Parallel specialist execution — runs multiple specialist agents
 * simultaneously when they don't depend on each other's results.
 * Reduces total investigation time for multi-domain queries.
 *
 * Planning, tool execution, and observation are injected by the caller (the
 * InvestigatorAgentDO supplies its cache/timeout/retry-aware executor) so the
 * parallel path never bypasses the production tool pipeline.
 */

import type { AgentStep, AgentTool, AgentToolCall, AgentToolResult, PlannerOutput } from './types';
import type { SpecialistRole } from './specialist-types';
import { SPECIALIST_REGISTRY, SPECIALIST_TOOLS, getToolsForSpecialist } from './specialist-types';

export interface ParallelSpecialistResult {
  role: SpecialistRole;
  steps: AgentStep[];
  error: string | null;
}

/**
 * Injectable per-specialist primitives. The DO builds these as closures over
 * its own `planNextStep` / `executeTools` / `observeStep` so the parallel path
 * reuses the exact same cache, timeout, retry, and guardrail behaviour as the
 * sequential path.
 */
export interface SpecialistExecutor {
  plan: (
    role: SpecialistRole,
    tools: AgentTool[],
    steps: AgentStep[],
    stepNum: number,
    maxSteps: number
  ) => Promise<PlannerOutput>;
  execute: (calls: AgentToolCall[], tools: AgentTool[]) => Promise<AgentToolResult[]>;
  observe: (stepNum: number, reasoning: string, results: AgentToolResult[]) => Promise<{ observation: string }>;
  /** Optional guardrail pass (dedup / banned tools / per-specialist filters). */
  guard?: (
    role: SpecialistRole,
    calls: AgentToolCall[],
    view: { stepNum: number; maxSteps: number; steps: AgentStep[] }
  ) => AgentToolCall[];
}

/**
 * Determine which specialists can run in parallel.
 * Specialists whose tool sets don't overlap can run simultaneously (they can't
 * race on the same enrichment sources). Tool sets come from SPECIALIST_TOOLS.
 */
export function getParallelGroups(specialistRoles: SpecialistRole[]): SpecialistRole[][] {
  const groups: SpecialistRole[][] = [];
  const used = new Set<SpecialistRole>();

  for (const role of specialistRoles) {
    if (used.has(role)) continue;
    const group: SpecialistRole[] = [role];
    used.add(role);
    const myTools = new Set(SPECIALIST_TOOLS[role]);

    for (const other of specialistRoles) {
      if (used.has(other)) continue;
      const otherTools = new Set(SPECIALIST_TOOLS[other]);
      const hasOverlap = [...myTools].some((t) => otherTools.has(t));
      if (!hasOverlap) {
        group.push(other);
        used.add(other);
      }
    }

    groups.push(group);
  }

  return groups;
}

/** Run a single specialist for up to `maxSteps` using the injected executor. */
async function runSingleSpecialist(
  role: SpecialistRole,
  allTools: AgentTool[],
  maxSteps: number,
  executor: SpecialistExecutor
): Promise<ParallelSpecialistResult> {
  const specialistTools = getToolsForSpecialist(role, allTools);
  const steps: AgentStep[] = [];

  try {
    for (let stepNum = 1; stepNum <= maxSteps; stepNum++) {
      const plan = await executor.plan(role, specialistTools, steps, stepNum, maxSteps);
      if (plan.shouldSynthesize || plan.toolCalls.length === 0) break;

      const calls = executor.guard
        ? executor.guard(role, plan.toolCalls, { stepNum, maxSteps, steps })
        : plan.toolCalls;
      if (calls.length === 0) break;

      const step: AgentStep = {
        stepNumber: stepNum,
        plan: `[${SPECIALIST_REGISTRY[role].label}] ${plan.reasoning}`,
        toolCalls: calls,
        results: [],
        status: 'running',
        startedAt: new Date().toISOString(),
      };

      step.results = await executor.execute(calls, specialistTools);
      step.completedAt = new Date().toISOString();

      const observation = await executor.observe(stepNum, plan.reasoning, step.results);
      step.observation = observation.observation;
      step.status = 'done';

      steps.push(step);
    }

    return { role, steps, error: null };
  } catch (err) {
    return { role, steps, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Run multiple specialists concurrently. Each runs independently with its own
 * tool subset; total wall-clock time is bounded by the slowest specialist
 * rather than the sum of all of them.
 */
export async function runParallelSpecialists(
  specialistRoles: SpecialistRole[],
  allTools: AgentTool[],
  maxStepsPerSpecialist: number,
  executor: SpecialistExecutor
): Promise<ParallelSpecialistResult[]> {
  return Promise.all(
    specialistRoles.map((role) => runSingleSpecialist(role, allTools, maxStepsPerSpecialist, executor))
  );
}
