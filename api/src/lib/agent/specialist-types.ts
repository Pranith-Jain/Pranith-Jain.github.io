/**
 * Specialist agent types for the multi-agent mesh.
 *
 * Each specialist is a domain expert that owns a subset of tools and has
 * its own planner prompt, exit conditions, and guardrails. The orchestrator
 * routes queries to the appropriate specialist(s) and merges their results.
 */

import type { AgentTool, AgentStep, AgentToolCall } from './types';
import type { ExitCondition, Guardrail } from './loop-engine';

export type SpecialistRole =
  | 'ioc-reputation'
  | 'threat-actor'
  | 'vulnerability'
  | 'domain-host'
  | 'malware-analysis'
  | 'detection-rules'
  | 'phishing'
  | 'ransomware'
  | 'campaign-correlation'
  | 'dark-web'
  | 'strategic-intel'
  | 'export-stix';

export interface SpecialistDef {
  role: SpecialistRole;
  label: string;
  description: string;
  handlesQueryTypes: string[];
  maxSteps: number;
  exitConditions: ExitCondition<SpecialistView>[];
  guardrails: Guardrail<SpecialistView, AgentToolCall>[];
  buildPlannerPrompt(tools: AgentTool[], step: number, maxSteps: number, query: string, steps: AgentStep[]): string;
}

export interface SpecialistView {
  stepNum: number;
  maxSteps: number;
  steps: AgentStep[];
  role: SpecialistRole;
}

export interface OrchestratorPlan {
  specialistCalls: SpecialistDispatch[];
  reasoning: string;
}

export interface SpecialistDispatch {
  role: SpecialistRole;
  query: string;
  queryType: string;
  context: Record<string, unknown>;
  maxSteps: number;
}

export interface SpecialistResult {
  role: SpecialistRole;
  steps: AgentStep[];
  findings: SpecialistFinding[];
  report: string | null;
  error: string | null;
}

export interface SpecialistFinding {
  type: 'ioc' | 'actor' | 'cve' | 'domain' | 'hash' | 'technique' | 'campaign' | 'intel';
  value: string;
  confidence: 'high' | 'medium' | 'low';
  source: string;
  detail: string;
}

function countOkResults(steps: AgentStep[]): number {
  return steps.reduce((n, s) => n + s.results.filter((r) => r.status === 'ok').length, 0);
}

function hasToolBeenCalled(steps: AgentStep[], toolName: string): boolean {
  return steps.some((s) => s.toolCalls.some((tc) => tc.tool === toolName));
}

function okResultsForTool(steps: AgentStep[], toolName: string): number {
  return steps.reduce((n, s) => n + s.results.filter((r) => r.tool === toolName && r.status === 'ok').length, 0);
}

// ── Specialist registry ───────────────────────────────────────────────────

export const SPECIALIST_REGISTRY: Record<SpecialistRole, SpecialistDef> = {
  'ioc-reputation': {
    role: 'ioc-reputation',
    label: 'IOC Reputation Specialist',
    description: 'Checks indicators against reputation sources, correlates across feeds, assesses maliciousness.',
    handlesQueryTypes: ['ip', 'hash', 'domain', 'url'],
    maxSteps: 3,
    exitConditions: [
      {
        name: 'enough-verdicts',
        met: (v) => okResultsForTool(v.steps, 'check_ioc') >= 1 || okResultsForTool(v.steps, 'enrich_ioc_deep') >= 1,
        reason: () => 'IOC reputation verdict collected',
      },
      {
        name: 'lifecycle-mapped',
        met: (v) => hasToolBeenCalled(v.steps, 'get_ioc_lifecycle') && hasToolBeenCalled(v.steps, 'get_relationships'),
        reason: () => 'Lifecycle and relationships mapped',
      },
      {
        name: 'max-steps',
        met: (v) => v.stepNum >= v.maxSteps,
        reason: () => 'Specialist step budget exhausted',
      },
    ],
    guardrails: [
      {
        name: 'ioc-only-tools',
        filter: (calls) => {
          const allowed = new Set(SPECIALIST_TOOLS['ioc-reputation']);
          return calls.filter((c) => allowed.has(c.tool));
        },
      },
      {
        name: 'no-duplicate-ioc-checks',
        filter: (calls, view) => {
          const seen = new Set(
            view.steps.flatMap((s) => s.toolCalls.map((tc) => `${tc.tool}:${JSON.stringify(tc.args)}`))
          );
          return calls.filter((c) => !seen.has(`${c.tool}:${JSON.stringify(c.args)}`));
        },
      },
    ],
    buildPlannerPrompt: (tools, step, maxSteps, query, steps) => {
      const ok = countOkResults(steps);
      const toolList = tools.map((t) => `  - ${t.name}: ${t.description.split('.')[0]}`).join('\n');
      return `You are the IOC Reputation Specialist. Your job: determine if this indicator is malicious.

Query: ${query}

Available tools:
${toolList}

Step ${step}/${maxSteps}. Results so far: ${ok} successful.

Strategy:
- Step 1: enrich_ioc_deep (single-call fan-out to all reputation sources)
- Step 2: get_relationships + get_ioc_lifecycle (map connections, assess activity)
- Step 3: Synthesize if you have enough data. Do NOT retry tools that already returned results.

After ${ok >= 3 ? '3+ results' : 'enough data'}, synthesize immediately.`;
    },
  },

  'threat-actor': {
    role: 'threat-actor',
    label: 'Threat Actor Specialist',
    description: 'Profiles threat actors, maps their TTPs, tracks campaigns and victims.',
    handlesQueryTypes: ['actor', 'ransomware'],
    maxSteps: 4,
    exitConditions: [
      {
        name: 'actor-profiled',
        met: (v) => hasToolBeenCalled(v.steps, 'enrich_actor') && okResultsForTool(v.steps, 'enrich_actor') >= 1,
        reason: () => 'Actor profile collected',
      },
      {
        name: 'timeline-mapped',
        met: (v) => hasToolBeenCalled(v.steps, 'actor_timeline'),
        reason: () => 'Actor timeline collected',
      },
      {
        name: 'max-steps',
        met: (v) => v.stepNum >= v.maxSteps,
        reason: () => 'Specialist step budget exhausted',
      },
    ],
    guardrails: [
      {
        name: 'actor-tools-only',
        filter: (calls) => {
          const allowed = new Set(SPECIALIST_TOOLS['threat-actor']);
          return calls.filter((c) => allowed.has(c.tool));
        },
      },
    ],
    buildPlannerPrompt: (tools, step, maxSteps, query, steps) => {
      const ok = countOkResults(steps);
      const toolList = tools.map((t) => `  - ${t.name}: ${t.description.split('.')[0]}`).join('\n');
      return `You are the Threat Actor Specialist. Your job: build a complete actor profile.

Query: ${query}

Available tools:
${toolList}

Step ${step}/${maxSteps}. Results so far: ${ok} successful.

Strategy:
- Step 1: enrich_actor (profile, aliases, MITRE, CVEs)
- Step 2: actor_timeline (recent campaigns, victims, posting cadence)
- Step 3: actor_cves (CVEs exploited by this actor) + analyze_campaign
- Step 4: Synthesize with full profile.

Do NOT call get_ransomware_activity unless the actor is a known ransomware group.`;
    },
  },

  vulnerability: {
    role: 'vulnerability',
    label: 'Vulnerability Specialist',
    description: 'Analyzes CVEs with CVSS/EPSS/KEV scoring, exploit status, patch intelligence.',
    handlesQueryTypes: ['cve', 'exploit-db', 'bug-bounty', 'security-updates'],
    maxSteps: 4,
    exitConditions: [
      {
        name: 'cve-looked-up',
        met: (v) => hasToolBeenCalled(v.steps, 'lookup_cve') && okResultsForTool(v.steps, 'lookup_cve') >= 1,
        reason: () => 'CVE data collected from NVD/KEV',
      },
      {
        name: 'exploit-status-known',
        met: (v) => hasToolBeenCalled(v.steps, 'lookup_exploit_db') || hasToolBeenCalled(v.steps, 'lookup_cisa_kev'),
        reason: () => 'Exploit status determined',
      },
      {
        name: 'max-steps',
        met: (v) => v.stepNum >= v.maxSteps,
        reason: () => 'Specialist step budget exhausted',
      },
    ],
    guardrails: [
      {
        name: 'vuln-tools-only',
        filter: (calls) => {
          const allowed = new Set(SPECIALIST_TOOLS['vulnerability']);
          return calls.filter((c) => allowed.has(c.tool));
        },
      },
    ],
    buildPlannerPrompt: (tools, step, maxSteps, query, steps) => {
      const ok = countOkResults(steps);
      const toolList = tools.map((t) => `  - ${t.name}: ${t.description.split('.')[0]}`).join('\n');
      return `You are the Vulnerability Specialist. Your job: fully characterize this CVE.

Query: ${query}

Available tools:
${toolList}

Step ${step}/${maxSteps}. Results so far: ${ok} successful.

Strategy:
- Step 1: lookup_cve (CVSS, EPSS, KEV, affected products, references, CWE)
- Step 2: lookup_exploit_db (PoC/exploit references) OR lookup_cisa_kev (ransomware/exploitation context)
- Step 3: unified_search for additional exploitation intel
- Step 4: Synthesize. Do NOT call enrich_actor for CVE queries.`;
    },
  },

  'domain-host': {
    role: 'domain-host',
    label: 'Domain & Host Specialist',
    description: 'DNS, WHOIS, certificate transparency, passive DNS, tech stack, IP geolocation, ASN.',
    handlesQueryTypes: ['domain', 'ip'],
    maxSteps: 3,
    exitConditions: [
      {
        name: 'dns-resolved',
        met: (v) => hasToolBeenCalled(v.steps, 'lookup_domain') || hasToolBeenCalled(v.steps, 'lookup_ipinfo'),
        reason: () => 'DNS/host data collected',
      },
      {
        name: 'footprint-complete',
        met: (v) =>
          hasToolBeenCalled(v.steps, 'lookup_certificate_transparency') ||
          hasToolBeenCalled(v.steps, 'lookup_builtwith') ||
          hasToolBeenCalled(v.steps, 'lookup_asn'),
        reason: () => 'Infrastructure footprint collected',
      },
      {
        name: 'max-steps',
        met: (v) => v.stepNum >= v.maxSteps,
        reason: () => 'Specialist step budget exhausted',
      },
    ],
    guardrails: [
      {
        name: 'domain-tools-only',
        filter: (calls) => {
          const allowed = new Set(SPECIALIST_TOOLS['domain-host']);
          return calls.filter((c) => allowed.has(c.tool));
        },
      },
    ],
    buildPlannerPrompt: (tools, step, maxSteps, query, steps) => {
      const ok = countOkResults(steps);
      const toolList = tools.map((t) => `  - ${t.name}: ${t.description.split('.')[0]}`).join('\n');
      return `You are the Domain & Host Specialist. Your job: map the infrastructure.

Query: ${query}

Available tools:
${toolList}

Step ${step}/${maxSteps}. Results so far: ${ok} successful.

Strategy:
- Step 1: lookup_domain (DNS/WHOIS/RDAP/CT) or lookup_ipinfo (IP geolocation/ASN/hosting)
- Step 2: lookup_certificate_transparency + lookup_builtwith (tech stack) or lookup_asn
- Step 3: Synthesize with infrastructure map.`;
    },
  },

  'malware-analysis': {
    role: 'malware-analysis',
    label: 'Malware Analysis Specialist',
    description: 'Sample scanning, family profiling, sandbox verdicts, config extraction.',
    handlesQueryTypes: ['hash'],
    maxSteps: 3,
    exitConditions: [
      {
        name: 'sample-scanned',
        met: (v) => hasToolBeenCalled(v.steps, 'sample_scan') && okResultsForTool(v.steps, 'sample_scan') >= 1,
        reason: () => 'Sample scan completed',
      },
      {
        name: 'max-steps',
        met: (v) => v.stepNum >= v.maxSteps,
        reason: () => 'Specialist step budget exhausted',
      },
    ],
    guardrails: [
      {
        name: 'malware-tools-only',
        filter: (calls) => {
          const allowed = new Set(SPECIALIST_TOOLS['malware-analysis']);
          return calls.filter((c) => allowed.has(c.tool));
        },
      },
    ],
    buildPlannerPrompt: (tools, step, maxSteps, query, steps) => {
      const ok = countOkResults(steps);
      const toolList = tools.map((t) => `  - ${t.name}: ${t.description.split('.')[0]}`).join('\n');
      return `You are the Malware Analysis Specialist. Your job: identify and profile this malware sample.

Query: ${query}

Available tools:
${toolList}

Step ${step}/${maxSteps}. Results so far: ${ok} successful.

Strategy:
- Step 1: sample_scan (multi-provider hash fan-out: VirusTotal, MalwareBazaar, Triage, sandboxes)
- Step 2: malware_family_detail OR search_malpedia (family profile, YARA references) + search_triage
- Step 3: Synthesize with family attribution, detection verdicts, and sandbox links.`;
    },
  },

  'detection-rules': {
    role: 'detection-rules',
    label: 'Detection Rules Specialist',
    description: 'Generates YARA, Sigma, KQL, and Splunk detection rules from IOCs and TTPs.',
    handlesQueryTypes: ['cve', 'actor', 'hash', 'campaign'],
    maxSteps: 2,
    exitConditions: [
      {
        name: 'rules-generated',
        met: (v) =>
          hasToolBeenCalled(v.steps, 'generate_yara_rule') || hasToolBeenCalled(v.steps, 'generate_hunting_queries'),
        reason: () => 'Detection rules generated',
      },
      {
        name: 'max-steps',
        met: (v) => v.stepNum >= v.maxSteps,
        reason: () => 'Specialist step budget exhausted',
      },
    ],
    guardrails: [
      {
        name: 'detection-tools-only',
        filter: (calls) => {
          const allowed = new Set(SPECIALIST_TOOLS['detection-rules']);
          return calls.filter((c) => allowed.has(c.tool));
        },
      },
    ],
    buildPlannerPrompt: (tools, step, maxSteps, query, _steps) => {
      const toolList = tools.map((t) => `  - ${t.name}: ${t.description.split('.')[0]}`).join('\n');
      return `You are the Detection Rules Specialist. Your job: generate actionable detection rules.

Query: ${query}

Available tools:
${toolList}

Step ${step}/${maxSteps}.

Strategy:
- Step 1: generate_yara_rule (YARA + Sigma + KQL from the threat data)
- Step 2: generate_hunting_queries (Splunk/Elastic hunt queries) + get_detections
- Always include the malware family name and known strings from collected data.`;
    },
  },

  phishing: {
    role: 'phishing',
    label: 'Phishing Specialist',
    description: 'Analyzes phishing URLs, emails, and campaigns. Extracts IOCs, identifies infrastructure.',
    handlesQueryTypes: ['phishing', 'url'],
    maxSteps: 3,
    exitConditions: [
      {
        name: 'phishing-analyzed',
        met: (v) =>
          hasToolBeenCalled(v.steps, 'analyze_phishing_url') || hasToolBeenCalled(v.steps, 'analyze_phishing_email'),
        reason: () => 'Phishing content analyzed',
      },
      {
        name: 'max-steps',
        met: (v) => v.stepNum >= v.maxSteps,
        reason: () => 'Specialist step budget exhausted',
      },
    ],
    guardrails: [
      {
        name: 'phishing-tools-only',
        filter: (calls) => {
          const allowed = new Set(SPECIALIST_TOOLS['phishing']);
          return calls.filter((c) => allowed.has(c.tool));
        },
      },
    ],
    buildPlannerPrompt: (tools, step, maxSteps, query, _steps) => {
      const toolList = tools.map((t) => `  - ${t.name}: ${t.description.split('.')[0]}`).join('\n');
      return `You are the Phishing Specialist. Your job: analyze this phishing attempt.

Query: ${query}

Available tools:
${toolList}

Step ${step}/${maxSteps}.

Strategy:
- Step 1: analyze_phishing_url (verdict, extraction) or analyze_phishing_email
- Step 2: check_ioc on extracted IOCs + lookup_domain on extracted domains
- Step 3: Synthesize with verdict, extracted IOCs, and infrastructure map.`;
    },
  },

  ransomware: {
    role: 'ransomware',
    label: 'Ransomware Specialist',
    description: 'Tracks ransomware group activity, negotiations, victims, and sector targeting.',
    handlesQueryTypes: ['ransomware'],
    maxSteps: 3,
    exitConditions: [
      {
        name: 'activity-collected',
        met: (v) => hasToolBeenCalled(v.steps, 'get_ransomware_activity'),
        reason: () => 'Ransomware activity data collected',
      },
      {
        name: 'max-steps',
        met: (v) => v.stepNum >= v.maxSteps,
        reason: () => 'Specialist step budget exhausted',
      },
    ],
    guardrails: [
      {
        name: 'ransomware-tools-only',
        filter: (calls) => {
          const allowed = new Set(SPECIALIST_TOOLS['ransomware']);
          return calls.filter((c) => allowed.has(c.tool));
        },
      },
    ],
    buildPlannerPrompt: (tools, step, maxSteps, query, _steps) => {
      const toolList = tools.map((t) => `  - ${t.name}: ${t.description.split('.')[0]}`).join('\n');
      return `You are the Ransomware Specialist. Your job: track this ransomware group's activity.

Query: ${query}

Available tools:
${toolList}

Step ${step}/${maxSteps}.

Strategy:
- Step 1: get_ransomware_activity (recent victims, leak sites, posting cadence)
- Step 2: get_ransomware_negotiations (settlement patterns, demands, discounts)
- Step 3: get_blocklists + unified_search for additional context. Synthesize.`;
    },
  },

  'campaign-correlation': {
    role: 'campaign-correlation',
    label: 'Campaign Correlation Specialist',
    description: 'Cross-correlates IOCs, actors, and TTPs across campaigns. Finds connections.',
    handlesQueryTypes: ['campaign'],
    maxSteps: 3,
    exitConditions: [
      {
        name: 'campaign-analyzed',
        met: (v) => hasToolBeenCalled(v.steps, 'analyze_campaign') || hasToolBeenCalled(v.steps, 'cross_correlate'),
        reason: () => 'Campaign analysis complete',
      },
      {
        name: 'max-steps',
        met: (v) => v.stepNum >= v.maxSteps,
        reason: () => 'Specialist step budget exhausted',
      },
    ],
    guardrails: [
      {
        name: 'campaign-tools-only',
        filter: (calls) => {
          const allowed = new Set(SPECIALIST_TOOLS['campaign-correlation']);
          return calls.filter((c) => allowed.has(c.tool));
        },
      },
    ],
    buildPlannerPrompt: (tools, step, maxSteps, query, _steps) => {
      const toolList = tools.map((t) => `  - ${t.name}: ${t.description.split('.')[0]}`).join('\n');
      return `You are the Campaign Correlation Specialist. Your job: map this campaign's connections.

Query: ${query}

Available tools:
${toolList}

Step ${step}/${maxSteps}.

Strategy:
- Step 1: unified_search (find related intel) + cross_correlate
- Step 2: analyze_campaign (lifecycle, kill chain, attribution)
- Step 3: Synthesize with campaign map, kill chain, and attributed actors.`;
    },
  },

  'dark-web': {
    role: 'dark-web',
    label: 'Dark Web & Cybercrime Specialist',
    description: 'Searches breach forums, Telegram leaks, dark web markets.',
    handlesQueryTypes: ['generic'],
    maxSteps: 3,
    exitConditions: [
      {
        name: 'breach-searched',
        met: (v) => hasToolBeenCalled(v.steps, 'get_breach_forums') || hasToolBeenCalled(v.steps, 'check_breach'),
        reason: () => 'Breach data collected',
      },
      {
        name: 'max-steps',
        met: (v) => v.stepNum >= v.maxSteps,
        reason: () => 'Specialist step budget exhausted',
      },
    ],
    guardrails: [
      {
        name: 'darkweb-tools-only',
        filter: (calls) => {
          const allowed = new Set(SPECIALIST_TOOLS['dark-web']);
          return calls.filter((c) => allowed.has(c.tool));
        },
      },
    ],
    buildPlannerPrompt: (tools, step, maxSteps, query, _steps) => {
      const toolList = tools.map((t) => `  - ${t.name}: ${t.description.split('.')[0]}`).join('\n');
      return `You are the Dark Web & Cybercrime Specialist. Your job: find exposure on underground forums.

Query: ${query}

Available tools:
${toolList}

Step ${step}/${maxSteps}.

Strategy:
- Step 1: check_breach (exposure check) + search_telegram_leaks
- Step 2: get_breach_forums (forum activity) + trace_crypto_address if relevant
- Step 3: Synthesize with exposure assessment and dark web presence.`;
    },
  },

  'strategic-intel': {
    role: 'strategic-intel',
    label: 'Strategic Intel Specialist',
    description: 'Generates threat landscape assessments, PIR-driven briefings.',
    handlesQueryTypes: ['generic'],
    maxSteps: 3,
    exitConditions: [
      {
        name: 'pulse-collected',
        met: (v) => hasToolBeenCalled(v.steps, 'get_threat_pulse') || hasToolBeenCalled(v.steps, 'unified_search'),
        reason: () => 'Strategic intel collected',
      },
      {
        name: 'max-steps',
        met: (v) => v.stepNum >= v.maxSteps,
        reason: () => 'Specialist step budget exhausted',
      },
    ],
    guardrails: [
      {
        name: 'strategic-tools-only',
        filter: (calls) => {
          const allowed = new Set(SPECIALIST_TOOLS['strategic-intel']);
          return calls.filter((c) => allowed.has(c.tool));
        },
      },
    ],
    buildPlannerPrompt: (tools, step, maxSteps, query, _steps) => {
      const toolList = tools.map((t) => `  - ${t.name}: ${t.description.split('.')[0]}`).join('\n');
      return `You are the Strategic Intel Specialist. Your job: provide a threat landscape assessment.

Query: ${query}

Available tools:
${toolList}

Step ${step}/${maxSteps}.

Strategy:
- Step 1: get_threat_pulse (current threat landscape) + unified_search
- Step 2: get_ransomware_map + get_supply_chain_attacks for context
- Step 3: Synthesize with strategic assessment.`;
    },
  },

  'export-stix': {
    role: 'export-stix',
    label: 'STIX Export Specialist',
    description: 'Produces STIX 2.1 bundles, TLP-marked reports, and structured action cards.',
    handlesQueryTypes: [],
    maxSteps: 1,
    exitConditions: [
      {
        name: 'always-exit',
        met: () => true,
        reason: () => 'STIX export is a terminal step',
      },
    ],
    guardrails: [],
    buildPlannerPrompt: () => '',
  },
};

// ── Tool subset mapping ───────────────────────────────────────────────────

export const SPECIALIST_TOOLS: Record<SpecialistRole, string[]> = {
  'ioc-reputation': [
    'check_ioc',
    'enrich_ioc_deep',
    'get_relationships',
    'get_ioc_lifecycle',
    'maltiverse_verify',
    'correlate_iocs',
  ],
  'threat-actor': [
    'enrich_actor',
    'actor_timeline',
    'actor_cves',
    'search_malpedia',
    'analyze_campaign',
    'get_blocklists',
  ],
  vulnerability: [
    'lookup_cve',
    'lookup_exploit_db',
    'lookup_cisa_kev',
    'lookup_security_updates',
    'unified_search',
    'scan_package',
    'scan_dependencies',
  ],
  'domain-host': [
    'lookup_domain',
    'lookup_dns',
    'lookup_reverse_dns',
    'lookup_builtwith',
    'lookup_certificate_transparency',
    'lookup_ip_geo',
    'lookup_ipinfo',
    'lookup_asn',
    'passive_dns_lookup',
    'pivot_domain',
    'search_registrant',
    'webamon_search',
    'webamon_domain',
    'maltiverse_verify',
  ],
  'malware-analysis': ['sample_scan', 'malware_family_detail', 'search_triage', 'search_malpedia'],
  'detection-rules': ['generate_yara_rule', 'generate_hunting_queries', 'get_yara_rules', 'get_detections'],
  phishing: ['analyze_phishing_url', 'analyze_phishing_email', 'check_ioc', 'lookup_domain'],
  ransomware: ['get_ransomware_activity', 'get_ransomware_negotiations', 'get_blocklists', 'unified_search'],
  'campaign-correlation': ['analyze_campaign', 'cross_campaign_correlate', 'cross_correlate', 'unified_search'],
  'dark-web': [
    'get_breach_forums',
    'search_telegram_leaks',
    'trace_crypto_address',
    'breach_check',
    'check_breach',
    'unified_search',
  ],
  'strategic-intel': [
    'get_threat_pulse',
    'get_ransomware_map',
    'get_c2_tracker',
    'get_predictive_forecasts',
    'get_supply_chain_attacks',
    'unified_search',
  ],
  'export-stix': ['build_stix_bundle', 'parse_threat_report'],
};

// ── Query-type to specialist routing ─────────────────────────────────────

const ROUTING_TABLE: Record<string, SpecialistRole[]> = {
  cve: ['vulnerability', 'detection-rules'],
  'exploit-db': ['vulnerability', 'detection-rules'],
  'bug-bounty': ['vulnerability'],
  'security-updates': ['vulnerability'],
  ip: ['ioc-reputation', 'domain-host'],
  domain: ['domain-host', 'ioc-reputation'],
  hash: ['malware-analysis', 'ioc-reputation', 'detection-rules'],
  url: ['phishing', 'domain-host'],
  actor: ['threat-actor', 'campaign-correlation'],
  ransomware: ['ransomware', 'threat-actor'],
  phishing: ['phishing', 'ioc-reputation'],
  campaign: ['campaign-correlation', 'threat-actor'],
  generic: ['strategic-intel', 'dark-web', 'ioc-reputation'],
};

export function getSpecialistsForQueryType(queryType: string): SpecialistRole[] {
  return ROUTING_TABLE[queryType] ?? ['strategic-intel', 'ioc-reputation'];
}

export function getToolsForSpecialist(role: SpecialistRole, allTools: AgentTool[]): AgentTool[] {
  const allowed = new Set(SPECIALIST_TOOLS[role]);
  return allTools.filter((t) => allowed.has(t.name));
}
