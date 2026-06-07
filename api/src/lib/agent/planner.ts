/**
 * Agent planner — uses an LLM to decide which tools to call next given the
 * current investigation state. Returns a structured PlannerOutput.
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
  const toolDescriptions = describeTools(tools);
  const system = buildPlannerPrompt(toolDescriptions, maxSteps);
  const user = buildPlannerUserPrompt(query, queryType, steps, currentStep, maxSteps);

  // Force synthesis if we're at step maxSteps-1 or later with any data.
  // The planner sometimes keeps calling tools until the budget is exhausted,
  // leaving no room for the synthesis step. This guard ensures the agent
  // always produces a report if it has any investigation data.
  if (currentStep >= maxSteps - 1 && steps.some((s) => s.results.length > 0)) {
    return {
      reasoning: `Step ${currentStep} of ${maxSteps} — synthesizing to preserve context budget.`,
      toolCalls: [],
      shouldSynthesize: true,
    };
  }

  const input: CompletionInput = { system, user, maxTokens: 1500, temperature: 0.3 };

  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_PARSE_RETRIES; attempt++) {
    const { text } = await runCompletion(ai, input, { groqKey: opts.groqKey });
    try {
      const parsed = parsePlannerOutput(text, tools, steps);
      return parsed;
    } catch (err) {
      lastErr = err;
      // If JSON parse failed, retry with a more explicit instruction
      if (attempt < MAX_PARSE_RETRIES) {
        input.user = `${user}\n\nIMPORTANT: Your previous response was not valid JSON. Respond with ONLY the JSON object, no markdown fences, no prose.`;
      }
    }
  }
  // All retries exhausted — synthesize to avoid infinite loop
  console.warn('planner: failed to parse LLM output after retries, synthesizing', lastErr);
  return {
    reasoning: 'Failed to parse planner output — synthesizing with available data.',
    toolCalls: [],
    shouldSynthesize: true,
  };
}

/** Parse the LLM's raw output into a PlannerOutput. */
function parsePlannerOutput(raw: string, tools: AgentTool[], steps: AgentStep[]): PlannerOutput {
  // Strip markdown fences if the LLM wrapped its output
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }
  // Find the first { and last } for robust extraction
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1) throw new Error('No JSON object found in planner output');
  cleaned = cleaned.slice(firstBrace, lastBrace + 1);

  const parsed = JSON.parse(cleaned) as {
    reasoning?: string;
    toolCalls?: Array<{ tool: string; args?: Record<string, unknown>; reasoning?: string }>;
    shouldSynthesize?: boolean;
  };

  if (typeof parsed !== 'object' || parsed === null) throw new Error('Planner output is not an object');

  const toolNames = new Set(tools.map((t) => t.name));

  // Build a set of already-called (tool, args) pairs to prevent duplicates
  const called = new Set<string>();
  for (const s of steps) {
    for (const r of s.results) {
      called.add(`${r.tool}:${JSON.stringify(r.args)}`);
    }
  }

  const toolCalls = (parsed.toolCalls ?? [])
    .filter((tc) => tc.tool && toolNames.has(tc.tool))
    .filter((tc) => {
      const key = `${tc.tool}:${JSON.stringify(tc.args ?? {})}`;
      if (called.has(key)) return false; // skip duplicate
      called.add(key); // mark as called within this step too
      return true;
    })
    .map((tc) => ({
      tool: tc.tool,
      args: tc.args ?? {},
      reasoning: tc.reasoning ?? '',
    }));

  // If the LLM said synthesize or budget is exhausted, force it
  if (parsed.shouldSynthesize === true) {
    return { reasoning: parsed.reasoning ?? '', toolCalls: [], shouldSynthesize: true };
  }

  // If no valid tool calls AND not synthesizing, default to synthesize
  if (toolCalls.length === 0) {
    return {
      reasoning: parsed.reasoning ?? 'No valid tool calls — synthesizing.',
      toolCalls: [],
      shouldSynthesize: true,
    };
  }

  return {
    reasoning: parsed.reasoning ?? '',
    toolCalls,
    shouldSynthesize: false,
  };
}
