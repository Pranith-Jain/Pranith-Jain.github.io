/**
 * Agent synthesizer — the final LLM pass that turns the full investigation
 * step history into a structured intelligence report.
 */
import type { Ai } from '@cloudflare/workers-types';
import { runCompletion, type CompletionInput } from '../../case-study/generation/ai-client';
import type { AgentStep, SynthesizerOutput } from './types';
import { buildSynthesizerPrompt, buildSynthesizerUserPrompt } from './prompts';

interface DataQuality {
  totalOk: number;
  totalErr: number;
  emptyResults: number;
}

export async function synthesizeReport(
  ai: Ai,
  query: string,
  queryType: string,
  steps: AgentStep[],
  opts: { groqKey?: string; dataQuality?: DataQuality }
): Promise<SynthesizerOutput> {
  const dq = opts.dataQuality ?? {
    totalOk: steps.reduce((n, s) => n + s.results.filter((r) => r.status === 'ok').length, 0),
    totalErr: steps.reduce((n, s) => n + s.results.filter((r) => r.status === 'error').length, 0),
    emptyResults: 0,
  };

  // If almost all tools failed or returned empty, the report will be thin.
  // Add a warning to the synthesizer so it doesn't hallucinate to fill gaps.
  let dataWarning = '';
  if (dq.totalOk <= 1) {
    dataWarning = `\n\nWARNING: Only ${dq.totalOk} tool(s) returned data. ${dq.totalErr} failed. The report must honestly reflect this — write "No data available from investigation sources" for sections without evidence. DO NOT invent data.`;
  } else if (dq.emptyResults > dq.totalOk / 2) {
    dataWarning = `\n\nWARNING: ${dq.emptyResults} of ${dq.totalOk} tool results were nearly empty. Report sections without evidence must state "No data available from investigation sources."`;
  }

  const system = buildSynthesizerPrompt(query, queryType);
  const user = buildSynthesizerUserPrompt(query, queryType, steps) + dataWarning;
  const input: CompletionInput = { system, user, maxTokens: 4000, temperature: 0.3 };

  const { text, modelUsed } = await runCompletion(ai, input, { groqKey: opts.groqKey, quality: true });

  const keyFindings = extractKeyFindings(text);
  const iocs = extractIocs(text);
  const mitre = extractMitre(text);
  const confidence = estimateConfidence(steps, dq);

  return {
    report: text,
    modelUsed,
    keyFindings,
    confidence,
    iocsExtracted: iocs,
    mitreTechniques: mitre,
  };
}

function extractKeyFindings(report: string): string[] {
  const match = report.match(/## Key Findings\s*\n([\s\S]*?)(?=\n## |\n#|$)/);
  if (!match?.[1]) return [];
  return match[1]
    .split('\n')
    .map((l) => l.replace(/^[-*]\s*(?:\[(?:High|Medium|Low|Confirmed|Probable|Possible)\]\s*)?/, '').trim())
    .filter((l) => l.length > 10)
    .slice(0, 10);
}

function extractIocs(report: string): string[] {
  const iocs: string[] = [];
  const ipv4 = /\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)\b/g;
  let m: RegExpExecArray | null;
  while ((m = ipv4.exec(report)) !== null) {
    const ip = m[0];
    const first = Number(ip.split('.')[0]);
    if (first === 0 || first === 127 || first >= 224) continue;
    iocs.push(ip);
  }
  const sha256 = /\b[a-fA-F0-9]{64}\b/g;
  while ((m = sha256.exec(report)) !== null) iocs.push(m[0]);
  const SKIP = new Set([
    'example.com',
    'example.org',
    'github.com',
    'mitre.org',
    'nvd.nist.gov',
    'cloudflare.com',
    'microsoft.com',
    'google.com',
    'wikipedia.org',
  ]);
  const domains = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|org|net|io|co|ru|cn|onion)\b/gi;
  while ((m = domains.exec(report)) !== null) {
    const d = m[0].toLowerCase();
    if (SKIP.has(d) || /^\d+\.\d+/.test(d)) continue;
    iocs.push(d);
  }
  return [...new Set(iocs)].slice(0, 20);
}

function extractMitre(report: string): string[] {
  return [...new Set(report.match(/\bT\d{4}(?:\.\d{3})?\b/g) ?? [])];
}

function estimateConfidence(steps: AgentStep[], dq?: DataQuality): 'high' | 'medium' | 'low' {
  const ok = dq?.totalOk ?? steps.reduce((n, s) => n + s.results.filter((r) => r.status === 'ok').length, 0);
  const total =
    ok + (dq?.totalErr ?? steps.reduce((n, s) => n + s.results.filter((r) => r.status === 'error').length, 0));
  const errRate = total > 0 ? 1 - ok / total : 1;
  if (ok >= 6 && errRate < 0.2) return 'high';
  if (ok >= 3 && errRate < 0.5) return 'medium';
  return 'low';
}
