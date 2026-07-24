/**
 * Multi-model ensemble QA — runs verification on multiple models and
 * takes the consensus for higher accuracy. Reduces false positives/negatives.
 */

import type { Ai } from '@cloudflare/workers-types';
import { runCompletion, type CompletionInput } from '../../case-study/generation/ai-client';
import type { AgentStep } from './types';
import { QaOutputSchema, parseWithErrors, type QaOutputValidated } from './schemas';
import { buildQaSystemPrompt } from './agent-framework';
import { neutralizeUntrusted } from '../prompt-fence';

export interface EnsembleQaResult {
  verifiedReport: string;
  flaggedClaims: string[];
  missingFacts: string[];
  qualityScore: number;
  modelUsed: string;
  /** Number of models that agreed on the score (within 10 points). */
  consensusStrength: number;
}

/**
 * Run QA verification on multiple models and merge results.
 * Returns the consensus score and merged flagged claims/missing facts.
 */
export async function ensembleVerifyReport(
  ai: Ai,
  query: string,
  queryType: string,
  originalReport: string,
  steps: AgentStep[],
  opts: { groqKey?: string; nvidiaKey?: string; googleKey?: string }
): Promise<EnsembleQaResult> {
  const dataSummary = buildCompactSummary(steps);
  const system = buildQaSystemPrompt();
  const user = `<report_to_verify>
Query: ${neutralizeUntrusted(query)}
${originalReport}
</report_to_verify>

<collected_data>
${dataSummary || 'No data collected.'}
</collected_data>

Verify every claim in the report against the collected data. Flag hallucinations, add missing facts, correct errors.`;

  const input: CompletionInput = { system, user, maxTokens: 4000, temperature: 0.1 };

  // Run QA on multiple models in parallel
  const models: Array<{ provider: 'groq' | 'gemini' | 'nvidia'; label: string }> = [
    { provider: 'gemini', label: 'gemini' },
    { provider: 'groq', label: 'groq' },
  ];

  const results = await Promise.allSettled(
    models.map(async (m) => {
      const result = await runCompletion(ai, input, {
        groqKey: opts.groqKey,
        nvidiaKey: opts.nvidiaKey,
        googleKey: opts.googleKey,
        quality: true,
        preferProvider: m.provider,
      });
      const parsed = parseWithErrors(result.text, QaOutputSchema);
      if (!parsed.ok) return null;
      return { data: parsed.data, model: `${m.label}:${result.modelUsed.split(':')[1] ?? 'unknown'}` };
    })
  );

  const successful = results
    .filter(
      (r): r is PromiseFulfilledResult<{ data: QaOutputValidated; model: string }> =>
        r.status === 'fulfilled' && r.value !== null
    )
    .map((r) => r.value);

  if (successful.length === 0) {
    // All models failed — return unchanged
    return {
      verifiedReport: originalReport,
      flaggedClaims: [],
      missingFacts: [],
      qualityScore: 50,
      modelUsed: 'none',
      consensusStrength: 0,
    };
  }

  if (successful.length === 1) {
    // Single model result
    const { data, model } = successful[0]!;
    return {
      verifiedReport: applyCorrections(data, originalReport),
      flaggedClaims: data.flagged_claims.map((f) => `[${f.reason}] ${f.claim}: ${f.evidence}`),
      missingFacts: data.missing_facts.map((f) => `[${f.source}] ${f.fact}`),
      qualityScore: Math.min(100, Math.max(0, data.quality_score)),
      modelUsed: model,
      consensusStrength: 1,
    };
  }

  // Merge results from multiple models
  const scores = successful.map((s) => s.data.quality_score);
  const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

  // Consensus: how many models agree within 10 points
  const consensusStrength = scores.filter((s) => Math.abs(s - avgScore) <= 10).length;

  // Merge flagged claims (union, deduplicated by claim text)
  const allFlagged = new Map<string, { reason: string; claim: string; evidence: string }>();
  for (const s of successful) {
    for (const f of s.data.flagged_claims) {
      const key = f.claim.toLowerCase().trim();
      if (!allFlagged.has(key)) {
        allFlagged.set(key, f);
      }
    }
  }

  // Merge missing facts (union, deduplicated by fact text)
  const allMissing = new Map<string, { fact: string; source: string; importance: string }>();
  for (const s of successful) {
    for (const f of s.data.missing_facts) {
      const key = f.fact.toLowerCase().trim();
      if (!allMissing.has(key)) {
        allMissing.set(key, f);
      }
    }
  }

  // Use the report from the model with the highest score for corrections
  const bestModel = successful.sort((a, b) => b.data.quality_score - a.data.quality_score)[0]!;

  return {
    verifiedReport: applyCorrections(bestModel.data, originalReport),
    flaggedClaims: [...allFlagged.values()].map((f) => `[${f.reason}] ${f.claim}: ${f.evidence}`),
    missingFacts: [...allMissing.values()].map((f) => `[${f.source}] ${f.fact}`),
    qualityScore: Math.min(100, Math.max(0, avgScore)),
    modelUsed: successful.map((s) => s.model).join(' + '),
    consensusStrength,
  };
}

function applyCorrections(data: QaOutputValidated, originalReport: string): string {
  let report = originalReport;
  if (data.corrections.length > 0) {
    for (const c of data.corrections) {
      if (c.original && c.corrected && c.original !== c.corrected) {
        report = report.replaceAll(c.original, c.corrected);
      }
    }
  }
  if (data.missing_facts.length > 0) {
    const high = data.missing_facts.filter((f) => f.importance === 'high');
    if (high.length > 0) {
      report += '\n\n### Additional Intelligence (from QA verification)\n';
      for (const f of high) {
        report += `- ${f.fact} [Source: ${f.source}]\n`;
      }
    }
  }
  return report;
}

function buildCompactSummary(steps: AgentStep[]): string {
  const lines: string[] = [];
  for (const step of steps) {
    for (const r of step.results) {
      if (r.status !== 'ok' || !r.data) continue;
      const json = JSON.stringify(r.data);
      const truncated = json.length > 800 ? json.slice(0, 800) + '...' : json;
      lines.push(`[${r.tool}] ${truncated}`);
    }
  }
  const joined = lines.join('\n\n');
  return joined.length > 3200 ? joined.slice(0, 3200) + '\n...(truncated)' : joined;
}
