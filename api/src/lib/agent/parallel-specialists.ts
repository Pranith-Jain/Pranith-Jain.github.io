/**
 * Parallel specialist execution — runs multiple specialist agents
 * simultaneously when they don't depend on each other's results.
 * Reduces total investigation time for multi-domain queries.
 */

import type { Ai } from '@cloudflare/workers-types';
import type { AgentStep, AgentTool } from './types';
import type { SpecialistRole } from './specialist-types';
import { SPECIALIST_REGISTRY, getToolsForSpecialist } from './specialist-types';
import { planNextStep } from './planner';
import { observeStep } from './observer';

export interface ParallelSpecialistResult {
  role: SpecialistRole;
  steps: AgentStep[];
  error: string | null;
}

/**
 * Determine which specialists can run in parallel.
 * Specialists in different domains (e.g., IOC + actor) don't depend
 * on each other and can run simultaneously.
 */
export function getParallelGroups(specialistRoles: SpecialistRole[]): SpecialistRole[][] {
  // Group by independence — specialists that don't share tools can run in parallel
  const groups: SpecialistRole[][] = [];
  const used = new Set<SpecialistRole>();

  for (const role of specialistRoles) {
    if (used.has(role)) continue;
    const def = SPECIALIST_REGISTRY[role];
    const group: SpecialistRole[] = [role];
    used.add(role);

    // Find other specialists that don't share tools with this one
    const myTools = new Set(def.description.split(',').map((t) => t.trim()));
    for (const other of specialistRoles) {
      if (used.has(other)) continue;
      const otherDef = SPECIALIST_REGISTRY[other];
      const otherTools = new Set(otherDef.description.split(',').map((t) => t.trim()));
      // If no tool overlap, they can run in parallel
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

/**
 * Run a single specialist for a fixed number of steps.
 */
async function runSingleSpecialist(
  ai: Ai,
  role: SpecialistRole,
  query: string,
  queryType: string,
  tools: AgentTool[],
  maxSteps: number,
  opts: { groqKey?: string; googleKey?: string; nvidiaKey?: string }
): Promise<ParallelSpecialistResult> {
  const specialistTools = getToolsForSpecialist(role, tools);
  const steps: AgentStep[] = [];

  try {
    for (let stepNum = 1; stepNum <= maxSteps; stepNum++) {
      const plan = await planNextStep(ai, query, queryType, steps, stepNum, maxSteps, specialistTools, {
        groqKey: opts.groqKey,
        googleKey: opts.googleKey,
        nvidiaKey: opts.nvidiaKey,
      });

      if (plan.shouldSynthesize || plan.toolCalls.length === 0) break;

      const step: AgentStep = {
        stepNumber: stepNum,
        plan: `[${SPECIALIST_REGISTRY[role].label}] ${plan.reasoning}`,
        toolCalls: plan.toolCalls,
        results: [],
        status: 'running',
        startedAt: new Date().toISOString(),
      };

      // Execute tools (simplified — full execution logic is in the DO)
      const results = await Promise.allSettled(
        plan.toolCalls.map(async (tc) => {
          const tool = specialistTools.find((t) => t.name === tc.tool);
          if (!tool)
            return { tool: tc.tool, args: tc.args, status: 'error' as const, error: 'Unknown tool', durationMs: 0 };
          const start = Date.now();
          try {
            const data = await tool.execute(tc.args);
            return { tool: tc.tool, args: tc.args, status: 'ok' as const, data, durationMs: Date.now() - start };
          } catch (err) {
            return {
              tool: tc.tool,
              args: tc.args,
              status: 'error' as const,
              error: err instanceof Error ? err.message : String(err),
              durationMs: Date.now() - start,
            };
          }
        })
      );

      step.results = results.map((r) =>
        r.status === 'fulfilled'
          ? r.value
          : { tool: 'unknown', args: {}, status: 'error' as const, error: 'Promise rejected', durationMs: 0 }
      );
      step.completedAt = new Date().toISOString();

      const observation = await observeStep(ai, stepNum, plan.reasoning, step.results, opts);
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
 * Run multiple specialists in parallel.
 * Each specialist runs independently with its own tool subset.
 */
export async function runParallelSpecialists(
  ai: Ai,
  specialistRoles: SpecialistRole[],
  query: string,
  queryType: string,
  tools: AgentTool[],
  maxStepsPerSpecialist: number,
  opts: { groqKey?: string; googleKey?: string; nvidiaKey?: string }
): Promise<ParallelSpecialistResult[]> {
  // Run all specialists in parallel (each has its own tool subset)
  const promises = specialistRoles.map((role) =>
    runSingleSpecialist(ai, role, query, queryType, tools, maxStepsPerSpecialist, opts)
  );

  return Promise.all(promises);
}
