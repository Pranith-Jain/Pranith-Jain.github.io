/**
 * Agent observer — after each step's tools execute, the observer summarizes
 * what was found and decides whether to continue or synthesize.
 */
import type { Ai } from '@cloudflare/workers-types';
import { runCompletion, type CompletionInput } from '../../case-study/generation/ai-client';
import type { AgentToolResult } from './types';
import { buildObserverPrompt } from './prompts';
import { summarizeToolResult } from './tools';

export interface ObserverOutput {
  observation: string;
  keyFacts: string[];
  gaps: string[];
}

/**
 * Analyze the results of a step and produce a concise observation.
 * If the LLM is unavailable, falls back to a deterministic summary.
 */
export async function observeStep(
  ai: Ai,
  stepNumber: number,
  plan: string,
  results: AgentToolResult[],
  opts: { groqKey?: string; googleKey?: string }
): Promise<ObserverOutput> {
  // Deterministic fallback: summarize results without an LLM call
  const fallback = deterministicObserve(results);

  try {
    const system = buildObserverPrompt();
    const resultBlock = results
      .map((r) => {
        const status = r.status === 'ok' ? 'OK' : `ERROR: ${r.error}`;
        const data = r.data ? summarizeToolResult(r.tool, r.data, 1000) : '(no data)';
        return `- ${r.tool}(${JSON.stringify(r.args)}): ${status}\n  ${data}`;
      })
      .join('\n');

    const user = `<step number="${stepNumber}" plan="${plan}">
Tool results:
${resultBlock}
</step>

Analyze these results. What was found? What are the key facts? What gaps remain?`;

    const input: CompletionInput = { system, user, maxTokens: 800, temperature: 0.2 };
    const { text } = await runCompletion(ai, input, {
      googleKey: opts.googleKey,
      groqKey: opts.groqKey,
      preferGroq: true,
    });

    // Parse the JSON output
    let cleaned = text.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      const parsed = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as Partial<ObserverOutput>;
      return {
        observation: typeof parsed.observation === 'string' ? parsed.observation : fallback.observation,
        keyFacts: Array.isArray(parsed.keyFacts) ? parsed.keyFacts : fallback.keyFacts,
        gaps: Array.isArray(parsed.gaps) ? parsed.gaps : fallback.gaps,
      };
    }
    return fallback;
  } catch (err) {
    console.warn('observer: LLM call failed, using deterministic summary', err);
    return fallback;
  }
}

/** Deterministic summary when LLM is unavailable. */
function deterministicObserve(results: AgentToolResult[]): ObserverOutput {
  const ok = results.filter((r) => r.status === 'ok');
  const errors = results.filter((r) => r.status === 'error');
  const parts: string[] = [];

  if (ok.length > 0) {
    parts.push(`Successfully called ${ok.length} tool(s): ${ok.map((r) => r.tool).join(', ')}.`);
  }
  if (errors.length > 0) {
    parts.push(`${errors.length} tool(s) failed: ${errors.map((r) => `${r.tool} (${r.error})`).join(', ')}.`);
  }

  const keyFacts: string[] = [];
  for (const r of ok) {
    if (r.data && typeof r.data === 'object') {
      const data = r.data as Record<string, unknown>;
      // Extract some key fields if present
      if (typeof data.score === 'number') keyFacts.push(`${r.tool}: score ${data.score}`);
      if (typeof data.verdict === 'string') keyFacts.push(`${r.tool}: verdict ${data.verdict}`);
      if (Array.isArray(data.items)) keyFacts.push(`${r.tool}: ${data.items.length} items`);
      if (Array.isArray(data.results)) keyFacts.push(`${r.tool}: ${data.results.length} results`);
    }
  }

  return {
    observation: parts.join(' '),
    keyFacts: keyFacts.slice(0, 5),
    gaps: [],
  };
}
