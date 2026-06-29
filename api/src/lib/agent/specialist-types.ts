/**
 * Specialist agent types for the multi-agent mesh.
 *
 * Each specialist is a domain expert that owns a subset of tools and has
 * its own planner prompt, exit conditions, and guardrails. The orchestrator
 * routes queries to the appropriate specialist(s) and merges their results.
 */

import type { AgentTool, AgentStep, AgentToolCall } from './types';
import type { ExitCondition, Guardrail } from './loop-engine';

// ── Specialist ident ──────────────────────────────────────────────────────

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
  /** Query types this specialist can handle. */
  handlesQueryTypes: string[];
  /** Maximum steps this specialist runs before handing off. */
  maxSteps: number;
  /** Exit conditions specific to this specialist. */
  exitConditions: ExitCondition<SpecialistView>[];
  /** Guardrails specific to this specialist. */
  guardrails: Guardrail<SpecialistView, AgentToolCall>[];
  /** Build the specialist planner prompt. */
  buildPlannerPrompt(tools: AgentTool[], step: number, maxSteps: number, query: string, steps: AgentStep[]): string;
}

export interface SpecialistView {
  stepNum: number;
  maxSteps: number;
  steps: AgentStep[];
  role: SpecialistRole;
}

// ── Orchestrator types ────────────────────────────────────────────────────

export interface OrchestratorPlan {
  /** Which specialists to dispatch, in order. */
  specialistCalls: SpecialistDispatch[];
  /** Reasoning for the orchestration plan. */
  reasoning: string;
}

export interface SpecialistDispatch {
  role: SpecialistRole;
  query: string;
  queryType: string;
  /** Context from previous specialists to pass along. */
  context: Record<string, unknown>;
  /** Max steps for this specialist. */
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

// ── Specialist registry ───────────────────────────────────────────────────

export const SPECIALIST_REGISTRY: Record<SpecialistRole, SpecialistDef> = {
  'ioc-reputation': {
    role: 'ioc-reputation',
    label: 'IOC Reputation Specialist',
    description: 'Checks indicators against 30+ reputation sources, correlates across feeds, assesses maliciousness.',
    handlesQueryTypes: ['ip', 'hash', 'domain', 'url'],
    maxSteps: 3,
    exitConditions: [],
    guardrails: [],
    buildPlannerPrompt: () => '',
  },
  'threat-actor': {
    role: 'threat-actor',
    label: 'Threat Actor Specialist',
    description: 'Profiles threat actors, maps their TTPs, tracks campaigns and victims.',
    handlesQueryTypes: ['actor', 'ransomware'],
    maxSteps: 4,
    exitConditions: [],
    guardrails: [],
    buildPlannerPrompt: () => '',
  },
  vulnerability: {
    role: 'vulnerability',
    label: 'Vulnerability Specialist',
    description: 'Analyzes CVEs with CVSS/EPSS/KEV scoring, SSVC-V decision model, exploit status, patch intelligence.',
    handlesQueryTypes: ['cve', 'exploit-db', 'bug-bounty', 'security-updates'],
    maxSteps: 4,
    exitConditions: [],
    guardrails: [],
    buildPlannerPrompt: () => '',
  },
  'domain-host': {
    role: 'domain-host',
    label: 'Domain & Host Specialist',
    description: 'DNS, WHOIS, certificate transparency, passive DNS, tech stack, IP geolocation, ASN, web footprint.',
    handlesQueryTypes: ['domain', 'ip'],
    maxSteps: 3,
    exitConditions: [],
    guardrails: [],
    buildPlannerPrompt: () => '',
  },
  'malware-analysis': {
    role: 'malware-analysis',
    label: 'Malware Analysis Specialist',
    description: 'Sample scanning, family profiling, sandbox verdicts, config extraction, YARA references.',
    handlesQueryTypes: ['hash'],
    maxSteps: 3,
    exitConditions: [],
    guardrails: [],
    buildPlannerPrompt: () => '',
  },
  'detection-rules': {
    role: 'detection-rules',
    label: 'Detection Rules Specialist',
    description: 'Generates YARA, Sigma, KQL, and Splunk detection rules from IOCs and TTPs.',
    handlesQueryTypes: ['cve', 'actor', 'hash', 'campaign'],
    maxSteps: 2,
    exitConditions: [],
    guardrails: [],
    buildPlannerPrompt: () => '',
  },
  phishing: {
    role: 'phishing',
    label: 'Phishing Specialist',
    description: 'Analyzes phishing URLs, emails, and campaigns. Extracts IOCs, identifies infrastructure.',
    handlesQueryTypes: ['phishing', 'url'],
    maxSteps: 3,
    exitConditions: [],
    guardrails: [],
    buildPlannerPrompt: () => '',
  },
  ransomware: {
    role: 'ransomware',
    label: 'Ransomware Specialist',
    description: 'Tracks ransomware group activity, negotiations, victims, and sector targeting.',
    handlesQueryTypes: ['ransomware'],
    maxSteps: 3,
    exitConditions: [],
    guardrails: [],
    buildPlannerPrompt: () => '',
  },
  'campaign-correlation': {
    role: 'campaign-correlation',
    label: 'Campaign Correlation Specialist',
    description: 'Cross-correlates IOCs, actors, and TTPs across campaigns. Finds connections.',
    handlesQueryTypes: ['campaign'],
    maxSteps: 3,
    exitConditions: [],
    guardrails: [],
    buildPlannerPrompt: () => '',
  },
  'dark-web': {
    role: 'dark-web',
    label: 'Dark Web & Cybercrime Specialist',
    description: 'Searches breach forums, Telegram leaks, dark web markets. Tracks stolen data and criminal activity.',
    handlesQueryTypes: ['generic'],
    maxSteps: 3,
    exitConditions: [],
    guardrails: [],
    buildPlannerPrompt: () => '',
  },
  'strategic-intel': {
    role: 'strategic-intel',
    label: 'Strategic Intel Specialist',
    description: 'Generates threat landscape assessments, PIR-driven briefings, executive summaries.',
    handlesQueryTypes: ['generic'],
    maxSteps: 3,
    exitConditions: [],
    guardrails: [],
    buildPlannerPrompt: () => '',
  },
  'export-stix': {
    role: 'export-stix',
    label: 'STIX Export Specialist',
    description: 'Produces STIX 2.1 bundles, TLP-marked reports, and structured action cards.',
    handlesQueryTypes: [],
    maxSteps: 1,
    exitConditions: [],
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
  cve: ['vulnerability', 'detection-rules', 'export-stix'],
  'exploit-db': ['vulnerability', 'detection-rules', 'export-stix'],
  'bug-bounty': ['vulnerability', 'export-stix'],
  'security-updates': ['vulnerability', 'export-stix'],
  ip: ['ioc-reputation', 'domain-host', 'export-stix'],
  domain: ['domain-host', 'ioc-reputation', 'export-stix'],
  hash: ['malware-analysis', 'ioc-reputation', 'detection-rules', 'export-stix'],
  url: ['phishing', 'domain-host', 'export-stix'],
  actor: ['threat-actor', 'ransomware', 'campaign-correlation', 'export-stix'],
  ransomware: ['ransomware', 'threat-actor', 'export-stix'],
  phishing: ['phishing', 'ioc-reputation', 'domain-host', 'export-stix'],
  campaign: ['campaign-correlation', 'threat-actor', 'export-stix'],
  generic: ['strategic-intel', 'dark-web', 'ioc-reputation', 'export-stix'],
};

export function getSpecialistsForQueryType(queryType: string): SpecialistRole[] {
  return ROUTING_TABLE[queryType] ?? ['strategic-intel', 'ioc-reputation', 'export-stix'];
}

export function getToolsForSpecialist(role: SpecialistRole, allTools: AgentTool[]): AgentTool[] {
  const allowed = new Set(SPECIALIST_TOOLS[role]);
  return allTools.filter((t) => allowed.has(t.name));
}
