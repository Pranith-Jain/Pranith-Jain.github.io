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
  // IPv4 (exclude common non-IOC ranges: 0.x, 127.x, 224+)
  const ipv4 = /\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)\b/g;
  let m: RegExpExecArray | null;
  while ((m = ipv4.exec(report)) !== null) {
    const ip = m[0];
    const first = Number(ip.split('.')[0]);
    if (first === 0 || first === 127 || first >= 224) continue;
    iocs.push(ip);
  }
  // SHA256
  const sha256 = /\b[a-fA-F0-9]{64}\b/g;
  while ((m = sha256.exec(report)) !== null) iocs.push(m[0]);
  // Domains — must have a valid TLD and not be common reference domains
  const SKIP_DOMAINS = new Set([
    'example.com',
    'example.org',
    'example.net',
    'github.com',
    'github.io',
    'mitre.org',
    'attack.mitre.org',
    'nvd.nist.gov',
    'cve.mitre.org',
    'cloudflare.com',
    'microsoft.com',
    'google.com',
    'amazon.com',
    'wikipedia.org',
    'archive.org',
    'zenodo.org',
    'virustotal.com',
    'abuseipdb.com',
    'shodan.io',
    'otx.alienvault.com',
  ]);
  const domains =
    /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|org|net|io|co|ru|cn|de|uk|fr|br|jp|kr|in|au|info|xyz|top|cc|pw|tk|ml|ga|cf|gq|onion)\b/gi;
  while ((m = domains.exec(report)) !== null) {
    const d = m[0].toLowerCase();
    if (SKIP_DOMAINS.has(d)) continue;
    // Skip version-like strings (e.g. "v2.0", "3.1.4")
    if (/^\d+\.\d+/.test(d)) continue;
    iocs.push(d);
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
