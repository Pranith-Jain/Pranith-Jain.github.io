/**
 * Agent planner — identifies the target, picks the single most valuable
 * tool call, executes, then synthesizes. The goal is 2-3 steps max:
 *   Step 1: Primary lookup (check_ioc / lookup_cve / enrich_actor)
 *   Step 2: Enrichment if step 1 returned actionable leads
 *   Step 3: Synthesize
 */
import type { Ai } from '@cloudflare/workers-types';
import { runCompletion, type CompletionInput } from '../../case-study/generation/ai-client';
import type { AgentStep, AgentTool, PlannerOutput } from './types';
import { buildPlannerPrompt, buildPlannerUserPrompt } from './prompts';
import { describeTools } from './tools';

const MAX_PARSE_RETRIES = 2;

/**
 * Ask the LLM what to do next. Returns a PlannerOutput with tool calls
 * (if any) and a shouldSynthesize flag.
 */
export async function planNextStep(
  ai: Ai,
  query: string,
  queryType: string,
  steps: AgentStep[],
  currentStep: number,
  maxSteps: number,
  tools: AgentTool[],
  opts: { groqKey?: string }
): Promise<PlannerOutput> {
  // Force synthesis at step maxSteps or later with any data
  if (currentStep >= maxSteps && steps.some((s) => s.results.length > 0)) {
    return {
      reasoning: `Step ${currentStep} of ${maxSteps} — synthesizing report from collected data.`,
      toolCalls: [],
      shouldSynthesize: true,
    };
  }

  // Force synthesis at maxSteps-1 if we already have 2+ successful tool results
  const totalResults = steps.reduce((n, s) => n + s.results.filter((r) => r.status === 'ok').length, 0);
  if (currentStep >= maxSteps - 1 && totalResults >= 2) {
    return {
      reasoning: `Have ${totalResults} successful tool results — synthesizing now.`,
      toolCalls: [],
      shouldSynthesize: true,
    };
  }

  const toolDescriptions = describeTools(tools);
  const system = buildPlannerPrompt(toolDescriptions, maxSteps);
  const user = buildPlannerUserPrompt(query, queryType, steps, currentStep, maxSteps);
  const input: CompletionInput = { system, user, maxTokens: 1000, temperature: 0.2 };

  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_PARSE_RETRIES; attempt++) {
    const { text } = await runCompletion(ai, input, { groqKey: opts.groqKey });
    try {
      return parsePlannerOutput(text, tools, steps);
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_PARSE_RETRIES) {
        input.user = `${user}\n\nIMPORTANT: Your previous response was not valid JSON. Respond with ONLY the JSON object.`;
      }
    }
  }
  console.warn('planner: failed to parse LLM output, synthesizing', lastErr);
  return {
    reasoning: 'Planner parse failure — synthesizing with available data.',
    toolCalls: [],
    shouldSynthesize: true,
  };
}

/** Parse the LLM's raw output into a PlannerOutput. */
function parsePlannerOutput(raw: string, tools: AgentTool[], steps: AgentStep[]): PlannerOutput {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1) throw new Error('No JSON object found');
  cleaned = cleaned.slice(firstBrace, lastBrace + 1);

  const parsed = JSON.parse(cleaned) as {
    reasoning?: string;
    toolCalls?: Array<{ tool: string; args?: Record<string, unknown>; reasoning?: string }>;
    shouldSynthesize?: boolean;
  };

  if (typeof parsed !== 'object' || parsed === null) throw new Error('Planner output is not an object');

  // Deduplicate: filter out tool calls already made in previous steps
  const called = new Set<string>();
  for (const s of steps) {
    for (const r of s.results) {
      called.add(`${r.tool}:${JSON.stringify(r.args)}`);
    }
  }

  const toolNames = new Set(tools.map((t) => t.name));
  const toolCalls = (parsed.toolCalls ?? [])
    .filter((tc) => tc.tool && toolNames.has(tc.tool))
    .filter((tc) => {
      const key = `${tc.tool}:${JSON.stringify(tc.args ?? {})}`;
      if (called.has(key)) return false;
      called.add(key);
      return true;
    })
    .map((tc) => ({
      tool: tc.tool,
      args: tc.args ?? {},
      reasoning: tc.reasoning ?? '',
    }));

  if (parsed.shouldSynthesize === true) {
    return { reasoning: parsed.reasoning ?? '', toolCalls: [], shouldSynthesize: true };
  }

  if (toolCalls.length === 0) {
    return {
      reasoning: parsed.reasoning ?? 'No valid tool calls — synthesizing.',
      toolCalls: [],
      shouldSynthesize: true,
    };
  }

  return { reasoning: parsed.reasoning ?? '', toolCalls, shouldSynthesize: false };
}
