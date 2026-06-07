/**
 * Agent synthesizer — the final LLM pass that turns the full investigation
 * step history into a structured intelligence report.
 */
import type { Ai } from '@cloudflare/workers-types';
import { runCompletion, type CompletionInput } from '../../case-study/generation/ai-client';
import type { AgentStep, SynthesizerOutput } from './types';
import { buildSynthesizerPrompt, buildSynthesizerUserPrompt } from './prompts';

/**
 * Generate the final intelligence report from the investigation steps.
 */
export async function synthesizeReport(
  ai: Ai,
  query: string,
  queryType: string,
  steps: AgentStep[],
  opts: { groqKey?: string }
): Promise<SynthesizerOutput> {
  const system = buildSynthesizerPrompt(query, queryType);
  const user = buildSynthesizerUserPrompt(query, queryType, steps);
  const input: CompletionInput = { system, user, maxTokens: 4000, temperature: 0.4 };

  const { text, modelUsed } = await runCompletion(ai, input, { groqKey: opts.groqKey });

  // Extract structured metadata from the report
  const keyFindings = extractKeyFindings(text);
  const iocs = extractIocs(text);
  const mitre = extractMitre(text);
  const confidence = estimateConfidence(steps);

  return {
    report: text,
    modelUsed,
    keyFindings,
    confidence,
    iocsExtracted: iocs,
    mitreTechniques: mitre,
  };
}

/** Extract bullet points from Key Findings section. */
function extractKeyFindings(report: string): string[] {
  const match = report.match(/## Key Findings\s*\n([\s\S]*?)(?=\n## |\n#|$)/);
  if (!match?.[1]) return [];
  return match[1]
    .split('\n')
    .map((l) => l.replace(/^[-*]\s*(?:\[(?:High|Medium|Low)\]\s*)?/, '').trim())
    .filter((l) => l.length > 10)
    .slice(0, 6);
}

/** Extract IOCs (IPs, domains, hashes) from the report text. */
function extractIocs(report: string): string[] {
  const iocs: string[] = [];
  // IPv4
  const ipv4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
  let m: RegExpExecArray | null;
  while ((m = ipv4.exec(report)) !== null) iocs.push(m[0]);
  // SHA256
  const sha256 = /\b[a-fA-F0-9]{64}\b/g;
  while ((m = sha256.exec(report)) !== null) iocs.push(m[0]);
  // Domains (rough)
  const domains = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}\b/gi;
  while ((m = domains.exec(report)) !== null) {
    const d = m[0].toLowerCase();
    if (!d.includes('example.com') && !d.includes('github.com') && !d.includes('mitre.org')) iocs.push(d);
  }
  return [...new Set(iocs)].slice(0, 20);
}

/** Extract MITRE ATT&CK technique IDs from the report. */
function extractMitre(report: string): string[] {
  const re = /\bT\d{4}(?:\.\d{3})?\b/g;
  const matches = report.match(re) ?? [];
  return [...new Set(matches)];
}

/** Estimate overall confidence from investigation quality. */
function estimateConfidence(steps: AgentStep[]): 'high' | 'medium' | 'low' {
  const totalTools = steps.reduce((n, s) => n + s.results.length, 0);
  const successfulTools = steps.reduce((n, s) => n + s.results.filter((r) => r.status === 'ok').length, 0);
  const errorRate = totalTools > 0 ? 1 - successfulTools / totalTools : 1;

  if (successfulTools >= 6 && errorRate < 0.2) return 'high';
  if (successfulTools >= 3 && errorRate < 0.5) return 'medium';
  return 'low';
}
