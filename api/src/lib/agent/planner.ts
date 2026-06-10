/**
 * CTI Analyst Agent — Multi-phase planner.
 *
 * Investigation follows the intelligence cycle:
 *   Phase 1: COLLECTION    — Get raw data from primary sources
 *   Phase 2: ENRICHMENT    — Cross-correlate, pivot, expand
 *   Phase 3: ANALYSIS      — Attribute, assess confidence, map kill chain
 *   Phase 4: PRODUCTION    — Generate rules, STIX, campaigns, hunt queries
 *   Phase 5: SYNTHESIS     — Final analyst-grade report
 *
 * The planner decides which phase we're in and picks the most valuable
 * next tool call. It synthesizes when enough data is collected.
 */
import type { Ai } from '@cloudflare/workers-types';
import { runCompletion, type CompletionInput } from '../../case-study/generation/ai-client';
import type { AgentStep, AgentTool, PlannerOutput } from './types';
import { describeTools } from './tools';
import { neutralizeUntrusted, UNTRUSTED_DATA_SYSTEM_NOTE } from '../prompt-fence';

const MAX_PARSE_RETRIES = 2;

export async function planNextStep(
  ai: Ai,
  query: string,
  queryType: string,
  steps: AgentStep[],
  currentStep: number,
  maxSteps: number,
  tools: AgentTool[],
  opts: { groqKey?: string }
): Promise<PlannerOutput> {
  // The pre-plan exit decision (enough-results / near-limit / max-iterations)
  // is now owned by the loop engine and evaluated in the DO *before* this
  // function is called (see cti-loop.ts + InvestigatorAgentDO.advanceOneStep).
  // Reaching here means the loop chose to keep investigating, so we always plan.
  const toolDescriptions = describeTools(tools);
  const system = buildCtiPlannerPrompt(toolDescriptions, maxSteps, queryType);
  const user = buildCtiUserPrompt(query, queryType, steps, currentStep, maxSteps);
  const input: CompletionInput = { system, user, maxTokens: 1200, temperature: 0.2 };

  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_PARSE_RETRIES; attempt++) {
    const { text } = await runCompletion(ai, input, { groqKey: opts.groqKey });
    try {
      return parsePlannerOutput(text);
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_PARSE_RETRIES) {
        input.user = `${user}\n\nIMPORTANT: Respond with ONLY valid JSON.`;
      }
    }
  }
  console.warn('planner: parse failure, synthesizing', lastErr);
  return { reasoning: 'Planner failure — synthesizing.', toolCalls: [], shouldSynthesize: true };
}

function buildCtiPlannerPrompt(toolDescriptions: string, maxSteps: number, queryType: string): string {
  return `<role>You are a senior CTI analyst running an investigation. You have ${maxSteps} steps to collect, enrich, analyze, and produce intelligence from ${toolDescriptions.split('\n').length} available tools.</role>

<available_tools>
${toolDescriptions}
</available_tools>

<intelligence_cycle>
Phase 1 — COLLECTION (Steps 1-2): Get raw data from the most relevant primary source.
Phase 2 — ENRICHMENT (Steps 2-4): Cross-correlate findings, pivot on related entities.
Phase 3 — ANALYSIS (Steps 3-5): Attribute, assess confidence, map to kill chain.
Phase 4 — PRODUCTION (Step 4-6): Generate detection rules, STIX bundles, hunt queries.
Phase 5 — SYNTHESIS (Final step): Compile everything into an analyst-grade report.
</intelligence_cycle>

<tool_selection_rules>
FOR ${queryType.toUpperCase()} QUERIES:

${
  queryType === 'cve' || queryType === 'exploit-db'
    ? `Step 1: lookup_cve (get CVSS, EPSS, KEV, affected products, references, CWE)
Step 2: For exploit-db queries — lookup_exploit_db for PoC/exploit references; for cve queries — unified_search for exploitation intel OR generate_yara_rule for detection
Step 3: If exploit-db query returns CVEs — check_ioc on discovered IOCs. If a CVE has KEV data — lookup_cisa_kev for ransomware/exploitation context
Step 4: Synthesize. Do NOT call enrich_actor (it's for actors, not CVEs). Do NOT call lookup_mitre without a real technique ID from the CVE data.`
    : ''
}

${
  queryType === 'bug-bounty'
    ? `Step 1: unified_search for bounty platform intel, researcher disclosures
Step 2: lookup_exploit_db for public PoCs/exploits + check_ioc on discovered IOCs
Step 3: lookup_cisa_kev for KEV/ransomware status + enrich_actor for discovered actors
Step 4: generate_yara_rule + generate_hunting_queries
Step 5: Synthesize`
    : ''
}

${
  queryType === 'security-updates'
    ? `Step 1: lookup_security_updates for vendor advisories + unified_search for context
Step 2: lookup_cve for referenced CVEs + lookup_cisa_kev for KEV/ransomware status
Step 3: check_ioc on discovered IOCs
Step 4: generate_yara_rule + generate_hunting_queries
Step 5: Synthesize`
    : ''
}

${
  queryType === 'ip' || queryType === 'domain' || queryType === 'hash'
    ? `Step 1: check_ioc (32+ provider verdicts inc. StopForumSpam, DShield)
Step 2: get_relationships + get_ioc_lifecycle (map connections, assess activity)
Step 3: If domain — lookup_domain + pivot_domain + lookup_builtwith + lookup_certificate_transparency + lookup_wayback_advanced (infrastructure, tech stack, certs, historical data)
If IP — lookup_ip_geo + lookup_asn + urlscan_ip_search (find URLs hosted on IP)
If hash — sample_scan + malware_family_detail
Step 4: generate_yara_rule for detection. Synthesize`
    : ''
}

${
  queryType === 'actor' || queryType === 'ransomware'
    ? `Step 1: enrich_actor (profile, aliases, MITRE, CVEs)
Step 2: actor_timeline + get_ransomware_activity (recent campaigns, victims)
Step 3: actor_cves + analyze_campaign (attribution, kill chain)
Step 4: generate_yara_rule + get_blocklists (detection + defense)
Step 5: Synthesize`
    : ''
}

${
  queryType === 'phishing'
    ? `Step 1: analyze_phishing_url (verdict, extraction)
Step 2: check_ioc on extracted IOCs + lookup_domain on extracted domains
Step 3: generate_yara_rule + generate_hunting_queries
Step 4: Synthesize`
    : ''
}

${
  queryType === 'campaign'
    ? `Step 1: unified_search (find related intel)
Step 2: cross_correlate + analyze_campaign (lifecycle, kill chain)
Step 3: generate_yara_rule + generate_hunting_queries (detection)
Step 4: Synthesize`
    : ''
}

${
  queryType === 'url'
    ? `Step 1: parse_threat_report with url=<the URL> (extract IOCs, actors, CVEs, techniques from the report)
Step 2: For each major IOC/actor/CVE found — enrich with check_ioc, enrich_actor, or lookup_cve
Step 3: Synthesize`
    : ''
}

${
  queryType === 'generic'
    ? `Step 1: unified_search (find what this is about)
Step 2: Based on results — enrich with the most relevant tool (check_ioc, enrich_actor, lookup_cve)
Step 3: Synthesize`
    : ''
}
</tool_selection_rules>

<critical_rules>
- NEVER call the same tool with the same args twice.
- NEVER call broad dump tools: get_live_iocs, get_today_briefing, get_feed_status, get_feed_catalog.
- NEVER call enrich_actor for CVE queries — enrich_actor is for threat actors only.
- NEVER call lookup_mitre with a placeholder like "TXXXX" — only use real technique IDs from data (T1190, T1566.001, etc). If you don't have a real ID, don't call lookup_mitre.
- Maximum 2 tool calls per step. 1 is often better.
- After 3+ successful results with good data, SYNTHESIZE IMMEDIATELY.
- More tools ≠ better reports. Quality of data > quantity of data.
- For rule generation: ALWAYS include the malware family name and known strings from the data you collected.
- If a tool returned 0 results, do NOT call it again with the same query.
</critical_rules>

<security>${UNTRUSTED_DATA_SYSTEM_NOTE}</security>

<output_format>
Respond with ONLY valid JSON:
{
  "phase": "collection|enrichment|analysis|production|synthesis",
  "reasoning": "Why these tools for this phase",
  "toolCalls": [{ "tool": "name", "args": {...}, "reasoning": "why" }],
  "shouldSynthesize": false
}
</output_format>`;
}

function buildCtiUserPrompt(
  query: string,
  queryType: string,
  steps: AgentStep[],
  currentStep: number,
  maxSteps: number
): string {
  const historyBlock = steps
    .filter((s) => s.results.length > 0)
    .map((s) => {
      const results = s.results
        .map((r) => {
          const status = r.status === 'ok' ? 'OK' : `ERR`;
          // Tool data is untrusted — neutralize so it cannot forge the
          // </collected_data> delimiter or inject planner instructions.
          const data = r.data ? neutralizeUntrusted(JSON.stringify(r.data).slice(0, 500)) : '(no data)';
          return `  ${r.tool}: ${status} — ${data}`;
        })
        .join('\n');
      return `Step ${s.stepNumber} (${neutralizeUntrusted(s.plan.slice(0, 80))}):\n${results}`;
    })
    .join('\n\n');

  return `<investigation>
Query: ${neutralizeUntrusted(query)}
Type: ${queryType}
Step: ${currentStep + 1} of ${maxSteps}
</investigation>

${historyBlock ? `<collected_data>\n${historyBlock}\n</collected_data>` : '<collected_data>None yet — start with Phase 1: Collection.</collected_data>'}

What is the most valuable next tool call? If I have enough data for a comprehensive report, set shouldSynthesize=true.`;
}

function parsePlannerOutput(raw: string): PlannerOutput {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1) throw new Error('No JSON found');
  cleaned = cleaned.slice(firstBrace, lastBrace + 1);

  const parsed = JSON.parse(cleaned) as {
    reasoning?: string;
    toolCalls?: Array<{ tool: string; args?: Record<string, unknown>; reasoning?: string }>;
    shouldSynthesize?: boolean;
  };

  if (typeof parsed !== 'object' || parsed === null) throw new Error('Not an object');

  // Normalize raw JSON into typed tool calls. Filtering (unknown tools, dedup
  // against prior steps, banned dump tools, per-step cap) is owned by the loop
  // engine's guardrails in InvestigatorAgentDO — here we only validate the shape
  // and fill defaults so downstream consumers get well-formed AgentToolCalls.
  const toolCalls = (parsed.toolCalls ?? [])
    .filter((tc) => typeof tc.tool === 'string' && tc.tool.length > 0)
    .map((tc) => ({ tool: tc.tool, args: tc.args ?? {}, reasoning: tc.reasoning ?? '' }));

  if (parsed.shouldSynthesize === true) {
    return { reasoning: parsed.reasoning ?? '', toolCalls: [], shouldSynthesize: true };
  }

  if (toolCalls.length === 0) {
    return { reasoning: parsed.reasoning ?? 'No valid calls — synthesizing.', toolCalls: [], shouldSynthesize: true };
  }

  return { reasoning: parsed.reasoning ?? '', toolCalls, shouldSynthesize: false };
}
