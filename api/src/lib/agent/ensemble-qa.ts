/**
 * Multi-model ensemble QA — runs verification on multiple models and
 * takes the consensus for higher accuracy. Reduces false positives/negatives.
 */

import type { Ai } from '@cloudflare/workers-types';
import { runCompletion, type CompletionInput } from '../../case-study/generation/ai-client';
import type { AgentStep } from './types';
import { QaOutputSchema, parseWithErrors, type QaOutputValidated } from './schemas';
import { buildQaSystemPrompt, buildFactList } from './agent-framework';
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
  opts: {
    infronKey?: string;
    groqKey?: string;
    nvidiaKey?: string;
    googleKey?: string;
    recordUsage?: (model: string, inputText: string, outputText: string, role: string) => void;
    /** Provider that generated the report — excluded so the judge differs from the generator. */
    excludeProvider?: 'infron' | 'groq' | 'gemini' | 'nvidia';
  }
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

  // Run QA on every available provider in parallel (ensemble grows with the
  // number of configured keys — Gemini/Groq/NVIDIA — for stronger consensus).
  // Judge-independence: skip the provider that generated the report so no
  // model grades its own output.
  const models: Array<{ provider: 'groq' | 'gemini' | 'nvidia' | 'infron'; label: string }> = [];
  if (opts.googleKey && opts.excludeProvider !== 'gemini') models.push({ provider: 'gemini', label: 'gemini' });
  if (opts.groqKey && opts.excludeProvider !== 'groq') models.push({ provider: 'groq', label: 'groq' });
  if (opts.nvidiaKey && opts.excludeProvider !== 'nvidia') models.push({ provider: 'nvidia', label: 'nvidia' });
  if (opts.infronKey && opts.excludeProvider !== 'infron') models.push({ provider: 'infron', label: 'infron' });

  const results = await Promise.allSettled(
    models.map(async (m) => {
      const result = await runCompletion(ai, input, {
        infronKey: opts.infronKey,
        groqKey: opts.groqKey,
        nvidiaKey: opts.nvidiaKey,
        googleKey: opts.googleKey,
        quality: true,
        preferProvider: m.provider,
        exclusiveProvider: true,
        role: 'qa-ensemble',
        recordUsage: opts.recordUsage,
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
      // JUDGE-INDEPENDENCE: QA flags only — never rewrites prose. The
      // synthesizer's self-correction prompt owns all rewriting.
      verifiedReport: originalReport,
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

  return {
    // JUDGE-INDEPENDENCE: QA flags only — never rewrites prose.
    verifiedReport: originalReport,
    flaggedClaims: [...allFlagged.values()].map((f) => `[${f.reason}] ${f.claim}: ${f.evidence}`),
    missingFacts: [...allMissing.values()].map((f) => `[${f.source}] ${f.fact}`),
    qualityScore: Math.min(100, Math.max(0, avgScore)),
    modelUsed: successful.map((s) => s.model).join(' + '),
    consensusStrength,
  };
}

function buildCompactSummary(steps: AgentStep[]): string {
  const lines: string[] = [];
  for (const step of steps) {
    for (const r of step.results) {
      if (r.status !== 'ok' || !r.data) continue;
      const json = JSON.stringify(r.data);
      const truncated = json.length > 800 ? json.slice(0, 800) + '...' : json;
      // Tool data is untrusted — neutralize so it cannot forge the
      // </collected_data> delimiter or inject QA instructions. Mirrors the
      // single-model path (buildDataSummary in qa-verifier.ts).
      lines.push(`[${r.tool}] ${neutralizeUntrusted(truncated)}`);
    }
  }
  const joined = lines.join('\n\n');
  const truncated = joined.length > 3200 ? joined.slice(0, 3200) + '\n...(truncated)' : joined;
  const factList = buildFactList(steps);
  return factList ? `${factList}\n\n--- raw tool data ---\n${truncated}` : truncated;
}
