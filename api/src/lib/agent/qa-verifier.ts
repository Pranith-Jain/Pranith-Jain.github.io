/**
 * CTI Agent QA Verifier — fact-checks the synthesized report against
 * collected tool data. Removes hallucinations, adds missing context,
 * and scores the report quality.
 *
 * Uses system/user prompt separation for more reliable verification.
 * Supports ensemble mode: when multiple providers are available, runs
 * QA on multiple models and takes the consensus score.
 */
import type { Ai } from '@cloudflare/workers-types';
import { runCompletion, type CompletionInput, isRateLimited } from '../../case-study/generation/ai-client';
import type { AgentStep } from './types';
import { neutralizeUntrusted } from '../prompt-fence';
import { QaOutputSchema, parseWithErrors, type QaOutputValidated } from './schemas';
import { buildQaSystemPrompt, buildFactList } from './agent-framework';
import { ensembleVerifyReport } from './ensemble-qa';

export interface QaResult {
  /** The verified/corrected report (may differ from original) */
  verifiedReport: string;
  /** Claims that were flagged as unsupported by data */
  flaggedClaims: string[];
  /** Facts from data that were missing in the original report */
  missingFacts: string[];
  /** Quality score 0-100 */
  qualityScore: number;
  /** Model used for QA */
  modelUsed: string;
}

/**
 * Verify a synthesized report against the collected investigation data.
 * Returns a corrected report with hallucinations removed and missing
 * facts added.
 *
 * If all LLM providers are exhausted (rate-limited/timed out), skips
 * verification gracefully and returns the original report unchanged.
 */
export async function verifyReport(
  ai: Ai,
  query: string,
  queryType: string,
  originalReport: string,
  steps: AgentStep[],
  opts: {
    infronKey?: string;
    groqKey?: string;
    nvidiaKey?: string;
    googleKey?: string;
    recordUsage?: (model: string, inputText: string, outputText: string, role: string) => void;
    /**
     * Provider that GENERATED the report being verified. Excluded from the QA
     * provider chain so the judge is never the same model as the generator
     * (judge-independence: a model must not grade its own output).
     */
    excludeProvider?: 'infron' | 'groq' | 'gemini' | 'nvidia';
  }
): Promise<QaResult> {
  // Use ensemble mode when 2+ providers are available (any of Gemini/Groq/NVIDIA).
  // This runs QA on multiple models and takes the consensus for higher accuracy.
  const availableProviders = [opts.infronKey, opts.googleKey, opts.groqKey, opts.nvidiaKey].filter(Boolean).length;
  if (availableProviders >= 2) {
    try {
      const ensemble = await ensembleVerifyReport(ai, query, queryType, originalReport, steps, opts);
      return {
        verifiedReport: ensemble.verifiedReport,
        flaggedClaims: ensemble.flaggedClaims,
        missingFacts: ensemble.missingFacts,
        qualityScore: ensemble.qualityScore,
        modelUsed: ensemble.modelUsed,
      };
    } catch {
      // Ensemble failed — fall back to single-model QA
    }
  }

  // Single-model fallback (original logic)
  return singleModelVerifyReport(ai, query, queryType, originalReport, steps, opts);
}

async function singleModelVerifyReport(
  ai: Ai,
  query: string,
  queryType: string,
  originalReport: string,
  steps: AgentStep[],
  opts: {
    infronKey?: string;
    groqKey?: string;
    nvidiaKey?: string;
    googleKey?: string;
    recordUsage?: (model: string, inputText: string, outputText: string, role: string) => void;
    excludeProvider?: 'infron' | 'groq' | 'gemini' | 'nvidia';
  }
): Promise<QaResult> {
  // Build a compact summary of all collected data for fact-checking
  const dataSummary = buildDataSummary(steps);

  // System prompt: verification standards, scoring rubric (stable)
  // User prompt: report to verify, collected data (dynamic)
  const system = buildQaSystemPrompt();
  const user = buildQaUserPrompt(query, originalReport, dataSummary);
  const input: CompletionInput = { system, user, maxTokens: 4000, temperature: 0.1 };

  const MAX_RETRIES = 1;
  let lastErr = '';
  let modelUsed = '';
  let allProvidersExhausted = false;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await runCompletion(ai, input, {
        infronKey: opts.infronKey,
        groqKey: opts.groqKey,
        nvidiaKey: opts.nvidiaKey,
        googleKey: opts.googleKey,
        quality: true,
        role: 'qa-verifier',
        preferProvider: 'gemini', // Gemini has 1M context — best for long report verification
        excludeProvider: opts.excludeProvider, // judge-independence: never grade the generator
        recordUsage: opts.recordUsage,
      });
      modelUsed = result.modelUsed;

      const parsed = parseWithErrors(result.text, QaOutputSchema);
      if (parsed.ok) {
        return applyCorrections(parsed.data, originalReport, modelUsed);
      }

      lastErr = parsed.errors;
      if (attempt < MAX_RETRIES) {
        input.user = `${user}\n\nIMPORTANT: Respond with ONLY valid JSON matching the required schema. Errors to fix:\n${lastErr}`;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lastErr = msg;

      // If all providers are exhausted, don't retry — it won't help
      if (isRateLimited(err) || msg.includes('All LLM providers exhausted') || msg.includes('timeout')) {
        allProvidersExhausted = true;
        break;
      }
    }
  }

  if (allProvidersExhausted) {
    console.error('qa-verifier: all LLM providers exhausted, skipping verification');
  } else {
    console.error('qa-verifier: failed after retries, returning original report. Last error:', lastErr);
  }

  return {
    verifiedReport: originalReport,
    flaggedClaims: [],
    missingFacts: [],
    qualityScore: allProvidersExhausted ? -1 : 50,
    modelUsed,
  };
}

/** Build a compact summary of all tool results for fact-checking. */
function buildDataSummary(steps: AgentStep[]): string {
  const lines: string[] = [];
  for (const step of steps) {
    for (const r of step.results) {
      if (r.status !== 'ok' || !r.data) continue;
      const json = JSON.stringify(r.data);
      // Truncate large results to fit provider token limits.
      // 800 chars per tool keeps total prompt under ~4K tokens.
      const truncated = json.length > 800 ? json.slice(0, 800) + '...' : json;
      // Tool data is untrusted — neutralize so it cannot forge the
      // </collected_data> delimiter or inject QA instructions.
      lines.push(`[${r.tool}] ${neutralizeUntrusted(truncated)}`);
    }
  }
  // Cap total data summary at ~3200 chars to stay within provider limits
  const joined = lines.join('\n\n');
  const truncated = joined.length > 3200 ? joined.slice(0, 3200) + '\n...(truncated)' : joined;
  // Prepend the precise, truncation-proof fact list from observer findings so
  // QA verifies against confirmed facts even when raw JSON is capped.
  const factList = buildFactList(steps);
  return factList ? `${factList}\n\n--- raw tool data ---\n${truncated}` : truncated;
}

function buildQaUserPrompt(query: string, report: string, dataSummary: string): string {
  // Truncate report to fit within provider token limits.
  // Groq models have ~8K context; system prompt is ~800 tokens, data summary
  // is ~3200 chars (~800 tokens), leaving ~6400 tokens for the report (~4800 chars).
  // Cap at 4000 chars to leave room for the instruction tail.
  const MAX_REPORT_CHARS = 4000;
  const truncatedReport =
    report.length > MAX_REPORT_CHARS
      ? report.slice(0, MAX_REPORT_CHARS) + '\n...(truncated for QA verification)'
      : report;

  return `<report_to_verify>
Query: ${neutralizeUntrusted(query)}
${truncatedReport}
</report_to_verify>

<collected_data>
${dataSummary || 'No data collected — all tools failed or returned empty.'}
</collected_data>

Verify every claim in the report against the collected data. Flag hallucinations, add missing facts, correct errors.`;
}

/** Apply QA corrections to the report.
 *
 * JUDGE-INDEPENDENCE CONTRACT: QA must only FLAG, never REWRITE. The synthesizer's
 * self-correction prompt receives `flaggedClaims` / `missingFacts` and owns all
 * rewriting. Earlier versions of this function did `replaceAll(c.original,
 * c.corrected)` on the prose — that let the judge author report content (substring
 * collisions, structured-block corruption) and blurred the line between verify
 * and generate. The report is now returned UNCHANGED; callers consume the flags.
 */
function applyCorrections(data: QaOutputValidated, originalReport: string, modelUsed: string): QaResult {
  const flaggedClaims = data.flagged_claims.map((f) => `[${f.reason}] ${f.claim}: ${f.evidence}`);
  const missingFacts = data.missing_facts.map((f) => `[${f.source}] ${f.fact}`);
  return {
    verifiedReport: originalReport,
    flaggedClaims,
    missingFacts,
    qualityScore: Math.min(100, Math.max(0, data.quality_score)),
    modelUsed,
  };
}
