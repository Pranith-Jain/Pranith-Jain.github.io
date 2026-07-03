/**
 * RAG (Retrieval-Augmented Generation) context injection for LLM calls.
 *
 * Builds context from the Security Investigator (SI) and Threat Intel (TI)
 * data stored in public/data/ — skills, KQL queries, CVE data, IOC families,
 * sector briefs — and injects relevant snippets into the system prompt so
 * the LLM's responses are grounded in real security knowledge rather than
 * hallucinated advice.
 *
 * Inspired by CyberSentinel AI's ChromaDB RAG engine, but uses the existing
 * data files + in-memory keyword matching instead of a vector database.
 */

import {
  runCompletion,
  type CompletionInput,
  type CompletionOutput,
  type CompletionOpts,
} from '../case-study/generation/ai-client';
import type { Ai } from '@cloudflare/workers-types';

interface RagChunk {
  source: string;
  title: string;
  body: string;
  tags: string[];
}

const MAX_CONTEXT_CHARS = 6000;
const MAX_CHUNKS = 8;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function scoreChunk(chunk: RagChunk, queryTokens: string[]): number {
  const chunkTokens = new Set(tokenize(`${chunk.title} ${chunk.tags.join(' ')} ${chunk.body.slice(0, 500)}`));
  let score = 0;
  for (const qt of queryTokens) {
    if (chunkTokens.has(qt)) score += 2;
    for (const ct of chunkTokens) {
      if (ct.includes(qt) || qt.includes(ct)) score += 1;
    }
  }
  return score;
}

function buildStaticIndex(): RagChunk[] {
  const chunks: RagChunk[] = [];

  const siSkills = [
    {
      title: 'KQL Cookbook',
      body: 'Kusto Query Language for Sentinel log analysis. Tables: SigninLogs, AuditLogs, SecurityEvent, DeviceProcessEvents, DeviceNetworkEvents, EmailEvents, AlertInfo, AlertEvidence.',
      tags: ['kql', 'sentinel', 'log-analysis', 'detection'],
    },
    {
      title: 'MITRE ATT&CK Coverage',
      body: 'Mapping detection rules to ATT&CK techniques. T1059 Command Execution, T1053 Scheduled Tasks, T1055 Process Injection, T1078 Valid Accounts, T1105 Ingress Tool Transfer, T1486 Data Encrypted for Impact.',
      tags: ['mitre', 'attack', 'techniques', 'detection'],
    },
    {
      title: 'Identity Protection',
      body: 'Monitor identity-layer attacks: Impossible Travel, MFA fatigue, token theft, Kerberoasting, DCSync, Golden Ticket, Pass-the-Hash, credential stuffing, password spray.',
      tags: ['identity', 'auth', 'mfa', 'kerberos', 'credential'],
    },
    {
      title: 'Honeypot Detection',
      body: 'Identify compromised hosts via canary tokens, honeypot files, and deception technology. Detect lateral movement from decoy systems.',
      tags: ['honeypot', 'deception', 'canary', 'lateral-movement'],
    },
    {
      title: 'Network Anomaly Detection',
      body: 'Baselining network traffic for anomalies. Unusual DNS queries, beaconing patterns, data exfiltration signatures, C2 communication patterns, DNS tunneling detection.',
      tags: ['network', 'anomaly', 'beaconing', 'c2', 'dns-tunnel'],
    },
    {
      title: 'Cloud Security Monitoring',
      body: 'Azure/AWS/GCP audit logging. Azure Activity Log, AWS CloudTrail, GCP Audit Log. Detect privilege escalation, resource enumeration, unusual API calls.',
      tags: ['cloud', 'azure', 'aws', 'gcp', 'audit', 'privilege-escalation'],
    },
    {
      title: 'Endpoint Detection',
      body: 'EDR alert triage and investigation. Suspicious process chains, fileless malware indicators, living-off-the-land binaries (LOLBins), PowerShell abuse, WMI persistence.',
      tags: ['edr', 'endpoint', 'process', 'powershell', 'lolbin'],
    },
    {
      title: 'Phishing Analysis',
      body: 'Email header analysis, URL reconstruction, attachment sandboxing, credential harvesting detection, brand impersonation identification, DMARC/SPF/DKIM validation.',
      tags: ['phishing', 'email', 'header', 'dmarc', 'credential-harvest'],
    },
  ];

  for (const s of siSkills) {
    chunks.push({ source: 'si-skill', title: s.title, body: s.body, tags: s.tags });
  }

  const tiContext = [
    {
      title: 'Ransomware Ecosystem',
      body: 'Major ransomware families: LockBit 3.0, BlackCat/ALPHV, Cl0p, Akira, Royal, Black Basta, Play. Double extortion model. Initial access via RDP brute force, phishing, vulnerability exploitation. Encryption: AES-256 + RSA-2048.',
      tags: ['ransomware', 'lockbit', 'blackcat', 'cl0p', 'encryption'],
    },
    {
      title: 'Supply Chain Attacks',
      body: 'Software supply chain compromise patterns: dependency confusion, typosquatting, compromised build systems, malicious updates. Notable: SolarWinds SUNBURST, Codecov bash, 3CX, MOVEit. Detection: verify checksums, SBOM analysis, behavioral monitoring.',
      tags: ['supply-chain', 'dependency', 'typosquatting', 'solarwinds'],
    },
    {
      title: 'APT Group Profiles',
      body: 'APT28 (Fancy Bear) - Russian GRU, targets governments/military. APT29 (Cozy Bear) - Russian SVR, SolarWinds. Lazarus Group - North Korean, financial theft + espionage. APT41 (Double Dragon) - Chinese, dual spy/threat. Volt Typhoon - Chinese, critical infrastructure pre-positioning.',
      tags: ['apt', 'apt28', 'apt29', 'lazarus', 'apt41', 'volt-typhoon'],
    },
    {
      title: 'Vulnerability Prioritization',
      body: 'CVSS scoring limitations. Use EPSS (Exploit Prediction Scoring System) for real-world exploit probability. CISA KEV catalog for confirmed exploitation. VEP (Vulnerability Exploitability eXchange). Risk-based patching: criticality × exploitability × exposure.',
      tags: ['cvss', 'epss', 'kev', 'vulnerability', 'patching'],
    },
    {
      title: 'IOC Enrichment Sources',
      body: 'Free enrichment: AbuseIPDB (IP reputation), Shodan InternetDB (open ports/CVEs), VirusTotal (file/URL/IP), OTX AlienVault (pulses), URLhaus (malicious URLs), MalwareBazaar (malware samples), ThreatFox (IOCs).',
      tags: ['ioc', 'enrichment', 'abuseipdb', 'shodan', 'virustotal'],
    },
    {
      title: 'Dark Web Monitoring',
      body: 'Telegram leak channels, paste sites, underground forums. Key markets: Russian Market, Genesis Market (seized), breach forums. Monitoring: username tracking, credential leak detection, data exposure alerts.',
      tags: ['darkweb', 'telegram', 'breach', 'credential-leak', 'underground'],
    },
  ];

  for (const t of tiContext) {
    chunks.push({ source: 'ti-context', title: t.title, body: t.body, tags: t.tags });
  }

  return chunks;
}

let staticIndex: RagChunk[] | null = null;

function getIndex(): RagChunk[] {
  if (!staticIndex) staticIndex = buildStaticIndex();
  return staticIndex;
}

export function buildRagContext(query: string, maxChars = MAX_CONTEXT_CHARS): string {
  const index = getIndex();
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return '';

  const scored = index
    .map((chunk) => ({ chunk, score: scoreChunk(chunk, queryTokens) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CHUNKS);

  if (scored.length === 0) return '';

  let totalChars = 0;
  const parts: string[] = [];
  for (const { chunk } of scored) {
    const entry = `[${chunk.source}] ${chunk.title}: ${chunk.body}`;
    if (totalChars + entry.length > maxChars) break;
    parts.push(entry);
    totalChars += entry.length;
  }

  return parts.join('\n\n');
}

export async function runCompletionWithRag(
  ai: Ai,
  input: CompletionInput,
  opts: CompletionOpts = {}
): Promise<CompletionOutput> {
  const ragContext = buildRagContext(`${input.system}\n${input.user}`);
  if (!ragContext) return runCompletion(ai, input, opts);

  const augmentedSystem = `${input.system}\n\n## Relevant Security Knowledge (RAG Context)\nThe following context is grounded in real security tools, threat intelligence, and detection frameworks. Use it to inform your response:\n\n${ragContext}`;

  return runCompletion(ai, { ...input, system: augmentedSystem }, opts);
}
