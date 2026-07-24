/**
 * CTI Agent QA Verifier — fact-checks the synthesized report against
 * collected tool data. Removes hallucinations, adds missing context,
 * and scores the report quality.
 *
 * Uses system/user prompt separation for more reliable verification.
 */
import type { Ai } from '@cloudflare/workers-types';
import { runCompletion, type CompletionInput, isRateLimited } from '../../case-study/generation/ai-client';
import type { AgentStep } from './types';
import { neutralizeUntrusted } from '../prompt-fence';
import { QaOutputSchema, parseWithErrors, type QaOutputValidated } from './schemas';
import { buildQaSystemPrompt } from './agent-framework';

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
  opts: { groqKey?: string; nvidiaKey?: string; googleKey?: string }
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
        groqKey: opts.groqKey,
        nvidiaKey: opts.nvidiaKey,
        googleKey: opts.googleKey,
        quality: true,
        role: 'qa-verifier',
        preferProvider: 'gemini', // Gemini has 1M context — best for long report verification
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
        console.warn(`qa-verifier: providers exhausted on attempt ${attempt + 1}, skipping`);
        break;
      }
    }
  }

  if (allProvidersExhausted) {
    console.warn('qa-verifier: all providers exhausted, returning unchanged report');
  } else {
    console.warn('qa-verifier: validation failed after retries, returning unchanged', lastErr);
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
  return joined.length > 3200 ? joined.slice(0, 3200) + '\n...(truncated)' : joined;
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

/** Apply QA corrections to the report. Assumes data is already validated. */
function applyCorrections(data: QaOutputValidated, originalReport: string, modelUsed: string): QaResult {
  const flaggedClaims = data.flagged_claims.map((f) => `[${f.reason}] ${f.claim}: ${f.evidence}`);
  const missingFacts = data.missing_facts.map((f) => `[${f.source}] ${f.fact}`);

  // Preserve the structured blocks (report-header, handoff, action-card).
  // These are machine-parseable, not free text — textual corrections would
  // munge them. We strip them, run QA on the prose only, then re-append.
  const REPORT_HEADER_RE = /^```report-header\s*\n[\s\S]*?\n```\s*\n?/;
  const HANDOFF_RE = /\n*\n:::handoff\s*\n[\s\S]*?\n:::\s*$/;
  const ACTION_CARD_RE = /\n*\n```action-card\s*\n[\s\S]*?\n```\s*$/;

  const headerMatch = originalReport.match(REPORT_HEADER_RE);
  let stripped = originalReport;
  let headerPrefix = '';
  if (headerMatch && headerMatch.index !== undefined) {
    headerPrefix = stripped.slice(0, headerMatch.index + headerMatch[0].length);
    stripped = stripped.slice(headerMatch.index + headerMatch[0].length);
  }

  let suffix = '';
  const cardMatch = stripped.match(ACTION_CARD_RE);
  if (cardMatch && cardMatch.index !== undefined) {
    suffix = stripped.slice(cardMatch.index) + suffix;
    stripped = stripped.slice(0, cardMatch.index);
  }
  const handoffMatch = stripped.match(HANDOFF_RE);
  let cardSuffix = '';
  if (handoffMatch && handoffMatch.index !== undefined) {
    cardSuffix = stripped.slice(handoffMatch.index) + suffix;
    stripped = stripped.slice(0, handoffMatch.index);
  } else {
    cardSuffix = suffix;
  }
  const proseOnly = stripped;

  // Apply corrections to the prose only (replaceAll for multi-occurrence fixes)
  let verifiedReport = proseOnly;
  if (data.corrections.length > 0) {
    for (const c of data.corrections) {
      if (c.original && c.corrected && c.original !== c.corrected) {
        verifiedReport = verifiedReport.replaceAll(c.original, c.corrected);
      }
    }
  }

  // If there are missing facts, append them as a "Additional Intelligence" section
  if (data.missing_facts.length > 0) {
    const highImportance = data.missing_facts.filter((f) => f.importance === 'high');
    if (highImportance.length > 0) {
      verifiedReport += '\n\n### Additional Intelligence (from QA verification)\n';
      for (const f of highImportance) {
        verifiedReport += `- ${f.fact} [Source: ${f.source}]\n`;
      }
    }
  }

  // If hallucinations were found, add inline markers and a summary disclaimer
  const hallucinations = data.flagged_claims.filter((f) => f.reason === 'hallucinated');
  if (hallucinations.length > 0) {
    for (const h of hallucinations) {
      if (h.claim && verifiedReport.includes(h.claim)) {
        verifiedReport = verifiedReport.replaceAll(h.claim, `[UNVERIFIED] ${h.claim}`);
      }
    }
    verifiedReport +=
      '\n\n---\n**QA Note:** ' +
      hallucinations.length +
      ' claim(s) marked `[UNVERIFIED]` could not be verified against collected data and may be based on general knowledge rather than investigation findings.';
  }

  // Re-prepend the structured header and re-append the action-card JSON block
  verifiedReport = headerPrefix + verifiedReport + cardSuffix;

  return {
    verifiedReport,
    flaggedClaims,
    missingFacts,
    qualityScore: Math.min(100, Math.max(0, data.quality_score)),
    modelUsed,
  };
}
