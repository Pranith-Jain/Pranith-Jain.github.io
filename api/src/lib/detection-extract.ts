/**
 * Detection Opportunities extraction — generates SIEM detection rules,
 * monitoring guidance, and CLI verification commands from threat reports.
 *
 * Uses LLM to produce structured detection content that analysts can
 * immediately use for threat hunting and monitoring.
 */

import type { Env } from '../env';
import { runCompletion } from '../case-study/generation/ai-client';

export interface DetectionRule {
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  mitreId?: string;
  query?: string;
  platform?: string;
}

export interface MonitoringGuidance {
  category: string;
  items: string[];
}

export interface CliCommand {
  purpose: string;
  command: string;
  platform?: string;
}

export interface DetectionOpportunities {
  siemRules: DetectionRule[];
  monitoringGuidance: MonitoringGuidance[];
  cliCommands: CliCommand[];
  detectionLimitations: string[];
  model?: string;
}

const SYSTEM = `You are a threat detection engineer. Given a threat report, extract detection opportunities that analysts can immediately implement.

Return JSON with this exact structure:
{
  "siemRules": [
    {
      "title": "rule name",
      "description": "what this rule detects",
      "severity": "critical|high|medium|low",
      "mitreId": "optional T-code",
      "query": "optional KQL/Sigma query",
      "platform": "optional: windows|linux|network|cloud"
    }
  ],
  "monitoringGuidance": [
    {
      "category": "category name (e.g. Authentication, Network, Process)",
      "items": ["specific monitoring action 1", "action 2"]
    }
  ],
  "cliCommands": [
    {
      "purpose": "what this command checks",
      "command": "the actual CLI/PowerShell command",
      "platform": "optional: windows|linux|fortinet|cisco"
    }
  ],
  "detectionLimitations": [
    "limitation 1: description",
    "limitation 2: description"
  ]
}

Focus on:
1. SIEM detection rules (KQL, Sigma, or YARA) for the specific TTPs described
2. Network monitoring for C2 communication patterns
3. Authentication monitoring for credential abuse
4. Process monitoring for malicious tools mentioned
5. CLI commands for device verification and forensics
6. Detection limitations the analyst should know about

Be specific to the threat described. Include actual IOCs where applicable.
Generate 3-8 SIEM rules, 3-5 monitoring categories, 3-6 CLI commands, and 2-4 limitations.
Output JSON only. No prose, no markdown fences.`;

const TIMEOUT_MS = 20_000;
const MAX_INPUT_CHARS = 6000;

export async function extractDetectionOpportunities(
  text: string,
  ttps: { id: string; name: string; tactic: string }[],
  env: Env
): Promise<DetectionOpportunities> {
  const ttpContext =
    ttps.length > 0
      ? `\n\nIdentified MITRE ATT&CK techniques:\n${ttps.map((t) => `- ${t.id}: ${t.name} (${t.tactic})`).join('\n')}`
      : '';

  const input = text.length > MAX_INPUT_CHARS ? text.slice(0, MAX_INPUT_CHARS) + '\n…[truncated]' : text;

  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('detection timeout')), TIMEOUT_MS)
    );
    const r = await Promise.race([
      runCompletion(
        env.AI,
        {
          system: SYSTEM,
          user: `Extract detection opportunities from this threat report.${ttpContext}\n\nReport text:\n${input}`,
          maxTokens: 3000,
          temperature: 0.3,
        },
        { googleKey: env.GOOGLE_AI_STUDIO_API_KEY, groqKey: env.GROQ_API_KEY }
      ),
      timeout,
    ]);

    const raw = typeof r.text === 'string' ? r.text.trim() : '';
    const i = raw.indexOf('{');
    const j = raw.lastIndexOf('}');
    if (i < 0 || j <= i) {
      return { siemRules: [], monitoringGuidance: [], cliCommands: [], detectionLimitations: [] };
    }

    const parsed = JSON.parse(raw.slice(i, j + 1)) as Record<string, unknown>;
    return {
      siemRules: Array.isArray(parsed.siemRules) ? (parsed.siemRules as DetectionRule[]).slice(0, 8) : [],
      monitoringGuidance: Array.isArray(parsed.monitoringGuidance)
        ? (parsed.monitoringGuidance as MonitoringGuidance[]).slice(0, 5)
        : [],
      cliCommands: Array.isArray(parsed.cliCommands) ? (parsed.cliCommands as CliCommand[]).slice(0, 6) : [],
      detectionLimitations: Array.isArray(parsed.detectionLimitations)
        ? (parsed.detectionLimitations as string[]).slice(0, 4)
        : [],
      model: r.modelUsed,
    };
  } catch {
    return {
      siemRules: [],
      monitoringGuidance: [],
      cliCommands: [],
      detectionLimitations: [],
    };
  }
}
