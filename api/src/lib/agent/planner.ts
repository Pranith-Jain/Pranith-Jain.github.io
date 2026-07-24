/**
 * CTI Analyst Agent — Multi-phase planner with agentic framework.
 *
 * Investigation follows the intelligence cycle:
 *   COLLECTION    — Get raw data from primary sources
 *   ENRICHMENT    — Cross-correlate, pivot, expand
 *   ANALYSIS      — Attribute, assess confidence, map kill chain
 *   PRODUCTION    — Generate rules, STIX, campaigns, hunt queries
 *   SYNTHESIS     — Final analyst-grade report
 *
 * The planner decides what to do next based on what data we have and what
 * we still need. It synthesizes when enough data is collected.
 *
 * Uses system/user prompt separation and working memory for better reasoning.
 */
import type { Ai } from '@cloudflare/workers-types';
import { runCompletion, type CompletionInput } from '../../case-study/generation/ai-client';
import type { AgentStep, AgentTool, PlannerOutput } from './types';
import { describeTools } from './tools';
import { PlannerOutputSchema, extractJsonObject } from './schemas';
import {
  buildPlannerSystemPrompt,
  buildPlannerUserPrompt,
  type WorkingMemory,
  memoryToPrompt,
} from './agent-framework';

const MAX_PARSE_RETRIES = 2;

export async function planNextStep(
  ai: Ai,
  query: string,
  queryType: string,
  steps: AgentStep[],
  currentStep: number,
  maxSteps: number,
  tools: AgentTool[],
  opts: {
    groqKey?: string;
    nvidiaKey?: string;
    googleKey?: string;
    specialistContext?: string;
    workingMemory?: WorkingMemory;
  }
): Promise<PlannerOutput> {
  const toolDescriptions = describeTools(tools);

  // Build working memory string from accumulated steps
  const memStr = opts.workingMemory ? memoryToPrompt(opts.workingMemory) : buildMemoryFromSteps(steps);

  // System prompt: agent identity, constraints, reasoning framework (stable)
  const system = buildPlannerSystemPrompt(tools.length, maxSteps, queryType);

  // User prompt: investigation context, working memory, tool list (dynamic)
  const user = buildPlannerUserPrompt(
    query,
    queryType,
    currentStep,
    maxSteps,
    memStr,
    toolDescriptions,
    opts.specialistContext
  );

  const input: CompletionInput = { system, user, maxTokens: 1200, temperature: 0.2 };

  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_PARSE_RETRIES; attempt++) {
    const { text } = await runCompletion(ai, input, {
      groqKey: opts.groqKey,
      nvidiaKey: opts.nvidiaKey,
      quality: queryType === 'actor' || queryType === 'ransomware' || queryType === 'campaign',
      role: 'planner',
    });
    try {
      return parsePlannerOutput(text);
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_PARSE_RETRIES) {
        input.user = `${user}\n\nIMPORTANT: Respond with ONLY valid JSON.`;
      }
    }
  }
  console.warn('planner: parse failure, synthesizing', lastErr);
  return { reasoning: 'Planner failure — synthesizing.', toolCalls: [], shouldSynthesize: true };
}

/**
 * Build a compact memory summary from raw steps when no WorkingMemory object
 * is available (backward compatibility).
 */
function buildMemoryFromSteps(steps: AgentStep[]): string {
  const allResults = steps.flatMap((s) => s.results.filter((r) => r.status === 'ok' && r.data));
  const toolsCalled = [...new Set(steps.flatMap((s) => s.results.map((r) => r.tool)))];
  const successCount = allResults.length;
  const failCount = steps.flatMap((s) => s.results.filter((r) => r.status === 'error')).length;
  const observations = steps.filter((s) => s.observation).map((s) => s.observation);

  const lines: string[] = [];
  lines.push(`Steps completed: ${steps.length}`);
  lines.push(`Tools called: ${toolsCalled.join(', ') || 'none'}`);
  lines.push(`Results: ${successCount} ok, ${failCount} error`);

  if (observations.length > 0) {
    lines.push('Observations:');
    for (const obs of observations.slice(-5)) {
      lines.push(`  • ${obs}`);
    }
  }

  return lines.join('\n');
}

function parsePlannerOutput(raw: string): PlannerOutput {
  const json = extractJsonObject(raw);
  const parsed = JSON.parse(json);
  const result = PlannerOutputSchema.safeParse(parsed);

  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Planner output validation failed: ${issues}`);
  }

  const data = result.data;

  // Normalize raw JSON into typed tool calls. Filtering (unknown tools, dedup
  // against prior steps, banned dump tools, per-step cap) is owned by the loop
  // engine's guardrails in InvestigatorAgentDO — here we only validate the shape
  // and fill defaults so downstream consumers get well-formed AgentToolCalls.
  const toolCalls = data.toolCalls
    .filter((tc) => tc.tool.length > 0)
    .map((tc) => ({ tool: tc.tool, args: tc.args ?? {}, reasoning: tc.reasoning }));

  if (data.shouldSynthesize) {
    return { reasoning: data.reasoning, toolCalls: [], shouldSynthesize: true };
  }

  if (toolCalls.length === 0) {
    return { reasoning: data.reasoning || 'No valid calls — synthesizing.', toolCalls: [], shouldSynthesize: true };
  }

  return { reasoning: data.reasoning, toolCalls, shouldSynthesize: false };
}
