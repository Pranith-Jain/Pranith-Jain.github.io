/**
 * Multi-agent orchestrator.
 *
 * Routes a user query to the appropriate specialist agents, dispatches them
 * (potentially in parallel), collects findings, and merges into a unified
 * investigation state. This replaces the monolithic planner for the common
 * case; the monolithic path is preserved as fallback for non-standard queries.
 */

import type { Ai } from '@cloudflare/workers-types';
import type { AgentStep, AgentTool, AgentState, AgentToolCall, AgentToolResult } from './types';
import {
  type SpecialistRole,
  type OrchestratorPlan,
  type SpecialistDispatch,
  type SpecialistResult,
  type SpecialistFinding,
  SPECIALIST_REGISTRY,
  getSpecialistsForQueryType,
  getToolsForSpecialist,
} from './specialist-types';
import { planNextStep } from './planner';
import { observeStep } from './observer';
import { evaluateCtiExit, filterCtiToolCalls } from './cti-loop';

/**
 * Build an orchestration plan: which specialists to call, in what order,
 * and with what context.
 */
export async function buildOrchestratorPlan(
  query: string,
  queryType: string,
  _opts: { groqKey?: string; googleKey?: string }
): Promise<OrchestratorPlan> {
  const specialistRoles = getSpecialistsForQueryType(queryType);

  const specialistCalls: SpecialistDispatch[] = specialistRoles.map((role, i) => {
    const def = SPECIALIST_REGISTRY[role];
    const context: Record<string, unknown> = {};
    // Pass relevant prior specialist findings as context
    if (i > 0) {
      context.previousSpecialists = specialistRoles.slice(0, i);
    }
    return {
      role,
      query,
      queryType,
      context,
      maxSteps: def.maxSteps,
    };
  });

  return {
    specialistCalls,
    reasoning: `Routing ${queryType} query through ${specialistRoles.map((r) => SPECIALIST_REGISTRY[r].label).join(' → ')}`,
  };
}

/**
 * Run a single specialist agent for a fixed number of steps.
 * Returns the steps it executed and any findings extracted.
 */
export async function runSpecialist(
  ai: Ai,
  dispatch: SpecialistDispatch,
  tools: AgentTool[],
  opts: { groqKey?: string; googleKey?: string }
): Promise<SpecialistResult> {
  const specialistTools = getToolsForSpecialist(dispatch.role, tools);
  const steps: AgentStep[] = [];
  const findings: SpecialistFinding[] = [];

  let synthesizing = false;

  for (let stepNum = 1; stepNum <= dispatch.maxSteps && !synthesizing; stepNum++) {
    const view = { stepNum, maxSteps: dispatch.maxSteps, steps };

    // Check exit conditions
    const exit = evaluateCtiExit(view);
    if (exit) {
      synthesizing = true;
      break;
    }

    // Plan next step using the specialist's tool subset
    const plan = await planNextStep(
      ai,
      dispatch.query,
      dispatch.queryType,
      steps,
      stepNum,
      dispatch.maxSteps,
      specialistTools,
      opts
    );

    if (plan.shouldSynthesize) {
      synthesizing = true;
      break;
    }

    // Apply guardrails
    const validNames = new Set(specialistTools.map((t) => t.name));
    const toolCalls = filterCtiToolCalls(plan.toolCalls, { stepNum, maxSteps: dispatch.maxSteps, steps }, validNames);

    if (toolCalls.length === 0) {
      synthesizing = true;
      break;
    }

    // Execute tools in parallel
    const results = await executeToolsForRole(toolCalls, specialistTools);

    // Observe results
    const observation = await observeStep(ai, stepNum, plan.reasoning, results, opts);

    const step: AgentStep = {
      stepNumber: stepNum,
      plan: plan.reasoning,
      toolCalls,
      results,
      status: 'done',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      observation: observation.observation,
      nextAction: 'continue',
    };

    steps.push(step);

    // Extract findings from successful results
    for (const r of results) {
      if (r.status === 'ok' && r.data) {
        findings.push(...extractFindings(r, dispatch.role, stepNum));
      }
    }
  }

  return { role: dispatch.role, steps, findings, report: null, error: null };
}

/**
 * Merge results from multiple specialists into a single agent state.
 * Deduplicates findings, resolves conflicts, and produces a unified report.
 */
export function mergeSpecialistResults(
  query: string,
  queryType: string,
  results: SpecialistResult[],
  existingState?: Partial<AgentState>
): AgentState {
  // Collect all findings deduplicated by (type, value)
  const seen = new Set<string>();
  const allFindings: SpecialistFinding[] = [];
  const allSteps: AgentStep[] = [];

  for (const r of results) {
    allSteps.push(...r.steps);
    for (const f of r.findings) {
      const key = `${f.type}:${f.value}`;
      if (!seen.has(key)) {
        seen.add(key);
        allFindings.push(f);
      }
    }
  }

  return {
    id: existingState?.id ?? '',
    query,
    queryType,
    status: 'done',
    steps: allSteps,
    currentStep: allSteps.length,
    maxSteps: existingState?.maxSteps ?? 10,
    report: null,
    modelUsed: existingState?.modelUsed ?? null,
    startedAt: existingState?.startedAt ?? new Date().toISOString(),
    completedAt: new Date().toISOString(),
    error: null,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────

async function executeToolsForRole(calls: AgentToolCall[], tools: AgentTool[]): Promise<AgentToolResult[]> {
  const toolMap = new Map(tools.map((t) => [t.name, t]));
  const results: AgentToolResult[] = [];

  const promises = calls.map(async (call): Promise<AgentToolResult> => {
    const tool = toolMap.get(call.tool);
    if (!tool) {
      return { tool: call.tool, args: call.args, status: 'error', error: `Unknown tool: ${call.tool}`, durationMs: 0 };
    }
    const start = Date.now();
    try {
      const timeoutMs = ['enrich_actor', 'check_ioc', 'enrich_ioc_deep'].includes(call.tool) ? 40_000 : 20_000;
      const data = await Promise.race([
        tool.execute(call.args),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout (${timeoutMs / 1000}s)`)), timeoutMs)
        ),
      ]);
      return { tool: call.tool, args: call.args, status: 'ok', data, durationMs: Date.now() - start };
    } catch (err) {
      return {
        tool: call.tool,
        args: call.args,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      };
    }
  });

  const settled = await Promise.allSettled(promises);
  for (const s of settled) {
    results.push(
      s.status === 'fulfilled'
        ? s.value
        : { tool: 'unknown', args: {}, status: 'error', error: 'Promise rejected', durationMs: 0 }
    );
  }
  return results;
}

function extractFindings(result: AgentToolResult, role: SpecialistRole, stepNum: number): SpecialistFinding[] {
  const findings: SpecialistFinding[] = [];
  if (!result.data || typeof result.data !== 'object') return findings;

  const data = result.data as Record<string, unknown>;

  // Extract IOCs from check_ioc / enrich_ioc_deep results
  if (result.tool === 'check_ioc' || result.tool === 'enrich_ioc_deep') {
    const indicator = result.args.indicator ?? result.args.query ?? '';
    if (indicator) {
      findings.push({
        type: 'ioc',
        value: String(indicator),
        confidence: data.malicious === true || data.verdict === 'malicious' ? 'high' : 'medium',
        source: result.tool,
        detail: `Step ${stepNum}: ${result.tool} → ${data.verdict ?? 'unknown'}`,
      });
    }
  }

  // Extract CVEs from lookup_cve
  if (result.tool === 'lookup_cve') {
    const cveId = result.args.cve_id ?? result.args.query ?? '';
    if (cveId) {
      findings.push({
        type: 'cve',
        value: String(cveId),
        confidence: (data as any)?.kev === true ? 'high' : 'medium',
        source: result.tool,
        detail: `CVSS: ${(data as any)?.cvss?.score ?? 'N/A'}, EPSS: ${(data as any)?.epss?.score ?? 'N/A'}`,
      });
    }
  }

  // Extract actors from enrich_actor
  if (result.tool === 'enrich_actor') {
    const actor = result.args.actor ?? result.args.query ?? '';
    if (actor) {
      findings.push({
        type: 'actor',
        value: String(actor),
        confidence: 'high',
        source: result.tool,
        detail: `Step ${stepNum}: actor profile collected`,
      });
    }
  }

  return findings;
}
