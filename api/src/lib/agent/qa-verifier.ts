/**
 * CTI Agent QA Verifier — fact-checks the synthesized report against
 * collected tool data. Removes hallucinated claims, adds missing context,
 * and scores the report quality.
 */
import type { Ai } from '@cloudflare/workers-types';
import { runCompletion, type CompletionInput } from '../../case-study/generation/ai-client';
import type { AgentStep } from './types';

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
 */
export async function verifyReport(
  ai: Ai,
  query: string,
  queryType: string,
  originalReport: string,
  steps: AgentStep[],
  opts: { groqKey?: string }
): Promise<QaResult> {
  // Build a compact summary of all collected data for fact-checking
  const dataSummary = buildDataSummary(steps);

  const system = buildQaPrompt(queryType);
  const user = buildQaUserPrompt(query, originalReport, dataSummary);
  const input: CompletionInput = { system, user, maxTokens: 4000, temperature: 0.1 };

  const { text, modelUsed } = await runCompletion(ai, input, { groqKey: opts.groqKey });

  // Parse the QA output
  return parseQaOutput(text, originalReport, modelUsed);
}

/** Build a compact summary of all tool results for fact-checking. */
function buildDataSummary(steps: AgentStep[]): string {
  const lines: string[] = [];
  for (const step of steps) {
    for (const r of step.results) {
      if (r.status !== 'ok' || !r.data) continue;
      const json = JSON.stringify(r.data);
      // Truncate large results but keep enough for fact-checking
      const truncated = json.length > 1500 ? json.slice(0, 1500) + '...' : json;
      lines.push(`[${r.tool}] ${truncated}`);
    }
  }
  return lines.join('\n\n');
}

function buildQaPrompt(queryType: string): string {
  return `<role>You are a CTI report quality assurance analyst. Your job is to verify every claim in an intelligence report against the actual data collected during the investigation.</role>

<task>
You will receive:
1. An intelligence report to verify
2. The raw data collected from investigation tools

Your job:
1. FACT-CHECK every claim — does the data actually support it?
2. FLAG hallucinations — claims not supported by any data (invented CVEs, fake scores, fabricated IOCs)
3. FLAG misattributions — claims that attribute data to the wrong source or wrong entity
4. ADD missing facts — important data from the tools that the report omitted
5. CORRECT errors — wrong numbers, dates, names, or technical details
6. SCORE quality — 0-100 based on accuracy, completeness, and actionability
</task>

<verification_rules>
- A claim is SUPPORTED if it directly matches data from a tool result
- A claim is UNSUPPORTED if no tool result contains the information
- A claim is MISATTRIBUTED if the data exists but is attributed to wrong entity/source
- A claim is INCORRECT if it contradicts the tool data
- CVSS scores, EPSS values, CVE IDs must EXACTLY match the tool data — no rounding, no approximation
- Actor names, aliases, and MITRE IDs must match tool data exactly
- IOCs (IPs, domains, hashes) must appear in tool results — not invented
- If a tool returned 0 results or errored, the report MUST NOT cite findings from it
</verification_rules>

<output_format>
Respond with ONLY valid JSON:
{
  "flagged_claims": [
    {"claim": "exact claim text", "reason": "hallucinated|unsupported|misattributed|incorrect", "evidence": "why it's wrong"}
  ],
  "missing_facts": [
    {"fact": "important fact from data", "source": "which tool", "importance": "high|medium|low"}
  ],
  "corrections": [
    {"original": "wrong text", "corrected": "correct text", "reason": "why"}
  ],
  "quality_score": 85,
  "quality_notes": "Brief assessment of overall report quality"
}
</output_format>`;
}

function buildQaUserPrompt(query: string, report: string, dataSummary: string): string {
  return `<report_to_verify>
Query: ${query}
${report}
</report_to_verify>

<collected_data>
${dataSummary || 'No data collected — all tools failed or returned empty.'}
</collected_data>

Verify every claim in the report against the collected data. Flag hallucinations, add missing facts, correct errors.`;
}

/** Parse the QA output and apply corrections to the report. */
function parseQaOutput(raw: string, originalReport: string, modelUsed: string): QaResult {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1) {
    // QA parse failed — return original report unchanged
    return {
      verifiedReport: originalReport,
      flaggedClaims: [],
      missingFacts: [],
      qualityScore: 50,
      modelUsed,
    };
  }

  try {
    const parsed = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as {
      flagged_claims?: Array<{ claim: string; reason: string; evidence: string }>;
      missing_facts?: Array<{ fact: string; source: string; importance: string }>;
      corrections?: Array<{ original: string; corrected: string; reason: string }>;
      quality_score?: number;
      quality_notes?: string;
    };

    const flaggedClaims = (parsed.flagged_claims ?? []).map((f) => `[${f.reason}] ${f.claim}: ${f.evidence}`);
    const missingFacts = (parsed.missing_facts ?? []).map((f) => `[${f.source}] ${f.fact}`);

    // Apply corrections to the report
    let verifiedReport = originalReport;
    if (parsed.corrections && parsed.corrections.length > 0) {
      for (const c of parsed.corrections) {
        if (c.original && c.corrected && c.original !== c.corrected) {
          verifiedReport = verifiedReport.replace(c.original, c.corrected);
        }
      }
    }

    // If there are missing facts, append them as a "Additional Intelligence" section
    if (parsed.missing_facts && parsed.missing_facts.length > 0) {
      const highImportance = parsed.missing_facts.filter((f) => f.importance === 'high');
      if (highImportance.length > 0) {
        verifiedReport += '\n\n### Additional Intelligence (from QA verification)\n';
        for (const f of highImportance) {
          verifiedReport += `- ${f.fact} [Source: ${f.source}]\n`;
        }
      }
    }

    // If hallucinations were found, add a disclaimer
    const hallucinations = (parsed.flagged_claims ?? []).filter((f) => f.reason === 'hallucinated');
    if (hallucinations.length > 0) {
      verifiedReport +=
        '\n\n---\n**QA Note:** ' +
        hallucinations.length +
        ' claim(s) in this report could not be verified against collected data and may be based on general knowledge rather than investigation findings.';
    }

    return {
      verifiedReport,
      flaggedClaims,
      missingFacts,
      qualityScore: Math.min(100, Math.max(0, parsed.quality_score ?? 50)),
      modelUsed,
    };
  } catch {
    return {
      verifiedReport: originalReport,
      flaggedClaims: [],
      missingFacts: [],
      qualityScore: 50,
      modelUsed,
    };
  }
}
