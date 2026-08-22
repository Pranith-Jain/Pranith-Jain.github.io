/**
 * Agent observer — after each step's tools execute, the observer summarizes
 * what was found and decides whether to continue or synthesize.
 */
import type { Ai } from '@cloudflare/workers-types';
import { runCompletion, type CompletionInput } from '../../case-study/generation/ai-client';
import type { AgentToolResult } from './types';
import { buildObserverPrompt } from './prompts';
import { summarizeToolResult } from './tools';
import { neutralizeAttr, neutralizeUntrusted } from '../prompt-fence';
import { ObserverOutputSchema, parseWithErrors } from './schemas';

/**
 * Observation cache — when the same tool+args produce the same result (via
 * agent-cache), the observation is also identical. Cache the LLM observation
 * keyed on the tool+args hash so we skip the LLM call entirely on repeat.
 * Uses Cache-API (free, per-colo, no KV quota).
 */
const OBS_CACHE_PREFIX = 'https://agent-obs-cache.internal/v1';
function obsCacheKey(stepNumber: number, results: AgentToolResult[]): string {
  // Hash the tool names + args + status — if the same tools ran with the
  // same args and the same status, the observation is deterministic.
  const sig = results.map((r) => `${r.tool}:${JSON.stringify(r.args)}:${r.status}`).join('|');
  return `${OBS_CACHE_PREFIX}/${stepNumber}:${sig.length}:${sig.slice(0, 200)}`;
}
async function getCachedObservation(key: string): Promise<ObserverOutput | null> {
  try {
    const hit = await (caches as unknown as { default: Cache }).default.match(new Request(key));
    if (hit) return (await hit.json()) as ObserverOutput;
  } catch {
    /* best-effort */
  }
  return null;
}
async function setCachedObservation(key: string, obs: ObserverOutput): Promise<void> {
  try {
    await (caches as unknown as { default: Cache }).default.put(
      new Request(key),
      new Response(JSON.stringify(obs), {
        headers: { 'content-type': 'application/json', 'cache-control': 'max-age=3600' },
      })
    );
  } catch {
    /* best-effort */
  }
}

export interface ObserverOutput {
  observation: string;
  keyFacts: string[];
  iocs: string[];
  actors: string[];
  cves: string[];
  malware: string[];
  mitre: string[];
  confidence: 'high' | 'medium' | 'low';
  gaps: string[];
  /**
   * Hypothesis updates proposed by the observer (Fleet-style hypothesis
   * tracking). Empty from the deterministic fallback — only the LLM pass
   * reasons about hypotheses.
   */
  hypothesisUpdates: Array<{
    text: string;
    status: 'proposed' | 'testing' | 'supported' | 'refuted';
    evidence?: string;
  }>;
  /**
   * Provenance of this observation. 'llm' = produced by the observer LLM pass;
   * 'fallback' = produced by the deterministic heuristic stub (LLM unavailable,
   * all tools errored, or parse failure). Downstream consumers (working memory,
   * persistent memory) must NOT treat 'fallback' keyFacts as analyst-confirmed —
   * they are heuristic extractions (score/verdict/items.length) only.
   */
  provenance: 'llm' | 'fallback';
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
  opts: {
    infronKey?: string;
    groqKey?: string;
    nvidiaKey?: string;
    googleKey?: string;
    recordUsage?: (model: string, inputText: string, outputText: string, role: string) => void;
  }
): Promise<ObserverOutput> {
  // Deterministic fallback: summarize results without an LLM call
  const fallback = deterministicObserve(results);

  // Skip LLM call if all tools errored — nothing to analyze
  const allErrored = results.length > 0 && results.every((r) => r.status === 'error');
  if (allErrored) {
    return { ...fallback, provenance: 'fallback' };
  }

  // Observation cache: if the same tools ran with the same args and the same
  // status (e.g. a cached tool result from agent-cache), the observation is
  // deterministic — skip the LLM call entirely. This saves one LLM call per
  // repeat-tool step (common when the agent re-checks an indicator it already
  // investigated in a prior step).
  const cacheKey = obsCacheKey(stepNumber, results);
  const cached = await getCachedObservation(cacheKey);
  if (cached) return cached;
  if (allErrored) {
    return { ...fallback, provenance: 'fallback' };
  }

  try {
    const system = buildObserverPrompt();
    const resultBlock = results
      .map((r) => {
        const status = r.status === 'ok' ? 'OK' : `ERROR: ${r.error}`;
        // Tool data is untrusted — neutralize so it cannot forge the </step>
        // delimiter or inject observer instructions. Mirrors the QA verifier's
        // buildDataSummary and the ensemble-qa buildCompactSummary defenses.
        const data = r.data ? neutralizeUntrusted(summarizeToolResult(r.tool, r.data, 2000)) : '(no data)';
        const next = r.nextActions && r.nextActions.length > 0 ? `\n  next_actions: ${r.nextActions.join(', ')}` : '';
        return `- ${r.tool}(${JSON.stringify(r.args)}): ${status}\n  ${data}${next}`;
      })
      .join('\n');

    const user = `<step number="${stepNumber}" plan="${neutralizeAttr(plan)}">
Tool results:
${resultBlock}
</step>

Analyze these results. What was found? Extract exact values into keyFacts/iocs/actors/cves/malware/mitre. Which Diamond Model vertex did this populate? What report sections can now be written, and which gaps remain?

Hypothesis tracking: maintain the investigation's working hypotheses. If a result confirms one, return {text, status:"supported", evidence:"<which tool/data>"}. If it contradicts one, status:"refuted" with evidence. If results suggest a new testable explanation (e.g. "loader for known family X"), propose it with status:"proposed". Only include entries whose status changed or that are new — omit unchanged hypotheses.`;

    const input: CompletionInput = { system, user, maxTokens: 1200, temperature: 0.1 };

    const MAX_RETRIES = 2;
    let lastErrors = '';

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const { text } = await runCompletion(ai, input, {
        infronKey: opts.infronKey,
        groqKey: opts.groqKey,
        nvidiaKey: opts.nvidiaKey,
        quality: false,
        role: 'observer',
        recordUsage: opts.recordUsage,
      });

      const parsed = parseWithErrors(text, ObserverOutputSchema);
      if (parsed.ok) {
        // Track whether the LLM actually produced keyFacts/gaps or whether we
        // silently substituted the heuristic fallback. If either was empty and
        // we filled from the fallback, provenance is 'fallback' so downstream
        // memory persistence knows these facts are heuristic, not analyst-confirmed.
        const usedFallbackForKeyFacts = parsed.data.keyFacts.length === 0 && fallback.keyFacts.length > 0;
        const usedFallbackForGaps = parsed.data.gaps.length === 0 && fallback.gaps.length > 0;
        const provenance: 'llm' | 'fallback' = usedFallbackForKeyFacts || usedFallbackForGaps ? 'fallback' : 'llm';
        const output: ObserverOutput = {
          observation: parsed.data.observation || fallback.observation,
          keyFacts: parsed.data.keyFacts.length > 0 ? parsed.data.keyFacts : fallback.keyFacts,
          iocs: parsed.data.iocs,
          actors: parsed.data.actors,
          cves: parsed.data.cves,
          malware: parsed.data.malware,
          mitre: parsed.data.mitre,
          confidence: parsed.data.confidence,
          gaps: parsed.data.gaps.length > 0 ? parsed.data.gaps : fallback.gaps,
          hypothesisUpdates: parsed.data.hypothesis_updates ?? [],
          provenance,
        };
        // Cache the observation so a repeat of the same tool+args (via
        // agent-cache) skips the LLM call on the next investigation.
        if (provenance === 'llm') {
          await setCachedObservation(cacheKey, output);
        }
        return output;
      }

      lastErrors = parsed.errors;
      if (attempt < MAX_RETRIES) {
        // AUDIT FIX (2026-08): neutralize the Zod error string before
        // concatenating it into the prompt. The errors include field paths and
        // messages derived from the LLM's own malformed output; while the LLM
        // is echoing its own output (not untrusted third-party text), wrapping
        // it in neutralizeUntrusted is defense-in-depth against a field value
        // containing prompt-injection text that Zod surfaces in the error path.
        input.user = `${user}\n\nIMPORTANT: Respond with ONLY valid JSON matching the required schema. Errors to fix:\n${neutralizeUntrusted(lastErrors)}`;
      }
    }
    return { ...fallback, provenance: 'fallback' };
  } catch {
    return { ...fallback, provenance: 'fallback' };
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
    iocs: [],
    actors: [],
    cves: [],
    malware: [],
    mitre: [],
    // AUDIT FIX (2026-08): return 'low' (not 'medium') when the observer LLM
    // was unavailable. A hardcoded 'medium' propagated into the working
    // memory's confidenceHistory and the synthesizer's confidence estimate,
    // making a fully-degraded step look analyst-assessed. 'low' signals that
    // no LLM analysis was performed.
    confidence: 'low',
    gaps: [],
    hypothesisUpdates: [],
    provenance: 'fallback',
  };
}
