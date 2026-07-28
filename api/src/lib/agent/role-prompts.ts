/**
 * Role-aware copilot prompts.
 *
 * Extends Vera's 4 modes with 4 analyst personas (CISO, Detection Engineering,
 * Incident Response, Threat Intelligence). Each persona gets:
 *   - A role-specific system prompt framing
 *   - Curated tool access list
 *   - Response formatting tailored to the persona's concerns
 *
 * The role is orthogonal to the mode — an analyst in "ask" mode can be
 * in any persona, and the persona changes what "quick answer" means.
 */

import type { AnalystRole } from './stix-translator';
import { ROLE_DISPLAY_NAMES, ROLE_DESCRIPTIONS } from './stix-translator';

export type { AnalystRole };
export { ROLE_DISPLAY_NAMES, ROLE_DESCRIPTIONS };

/**
 * Tool access per role. Controls which MCP tools each persona may invoke.
 * Empty = full set (all tools available).
 */
export const ROLE_TOOLS: Record<AnalystRole, string[]> = {
  ciso: [
    'unified_search',
    'lookup_cve',
    'lookup_cisa_kev',
    'get_today_briefing',
    'get_ransomware_activity',
    'get_supply_chain_attacks',
    'get_threat_pulse',
    'ti_brief_sector',
    'cyber_news',
    'get_trending_iocs',
    'get_feed_status',
  ],
  detection: [
    'check_ioc',
    'lookup_cve',
    'lookup_cisa_kev',
    'enrich_actor',
    'search_malpedia',
    'get_detections',
    'extract_ttps',
    'generate_yara_rule',
    'validate_yara_rule',
    'unified_search',
    'get_relationships',
    'search_triage',
    'ti_list_queries',
    'si_get_skill',
    'si_get_doc',
    'si_kql_to_ah_url',
  ],
  ir: [
    'check_ioc',
    'lookup_cve',
    'analyze_phishing_email',
    'analyze_phishing_url',
    'parse_threat_report',
    'extract_iocs_from_image',
    'get_ransomware_activity',
    'enrich_actor',
    'get_relationships',
    'get_live_iocs',
    'get_threat_pulse',
    'dehash_lookup',
    'virushee_check',
    'si_get_skill',
    'si_get_query',
    'lookup_domain',
    'lookup_asn',
    'scan_website',
  ],
  cti: [
    'enrich_actor',
    'search_malpedia',
    'lookup_cve',
    'lookup_cisa_kev',
    'check_ioc',
    'get_relationships',
    'unified_search',
    'get_cross_report_graph',
    'correlate_iocs',
    'extract_ttps',
    'get_threat_pulse',
    'ti_list_cves',
    'ti_get_cve',
    'ti_list_iocs',
    'ti_get_ioc',
    'si_list_skills',
    'si_get_skill',
    'si_list_queries',
    'si_get_query',
    'get_supply_chain_attacks',
    'cyber_news',
    'parse_threat_report',
    'get_today_briefing',
    'ti_brief_sector',
    'get_feed_status',
  ],
};

/**
 * Response format instructions per role.
 * Appended to the mode-specific system prompt in vera-prompts.ts.
 */
export const ROLE_RESPONSE_FORMATS: Record<AnalystRole, string> = {
  ciso: `<role_format>
You are a CISO's strategic advisor. Frame answers in business context:
- Lead with risk posture, financial/regulatory impact, and strategic implications
- Quantify where possible (affected assets, revenue exposure, regulatory fines)
- End with concrete recommendations phrased as "consider" or "review" actions
- Avoid technical deep-dives unless asked
- Use executive summary format: BOTTOM LINE → CONTEXT → RECOMMENDATION
</role_format>`,
  detection: `<role_format>
You are a Detection Engineering lead. Frame answers for rule development:
- Lead with the TTP (tactic, technique, procedure) mapped to MITRE ATT&CK
- Provide detection logic ideas (Sigma, KQL, Splunk SPL) where appropriate
- Highlight bypass risks and detection gaps
- Include data source requirements (which logs are needed)
- Use format: TECHNIQUE → DETECTION LOGIC → GAPS → TESTING STEPS
</role_format>`,
  ir: `<role_format>
You are a senior Incident Responder. Frame answers for rapid triage:
- Lead with actionable IOCs and immediate containment steps
- Prioritize by severity and dwell time indicators
- Include forensic artifact locations and timeline markers
- Note false-positive indicators and common noise sources
- End with the single most impactful next action
- Use format: ALERT → TRIAGE → CONTAIN → EVIDENCE → NEXT STEP
</role_format>`,
  cti: `<role_format>
You are a Threat Intelligence analyst. Frame answers for analytical depth:
- Lead with actor attribution, confidence level, and source triangulation
- Include campaign context, victimology, and targeting patterns
- Cross-reference with MITRE ATT&CK and known tooling
- Surface intelligence gaps and collection priorities
- Use format: ACTOR/CAMPAIGN → ATTRIBUTION → TTPs → VICTIMS → GAPS
</role_format>`,
};

/**
 * Role-specific system prompt preamble.
 * Prepended before the mode-specific prompt in the agent's system message.
 */
export function buildRolePreamble(role: AnalystRole): string {
  return `<persona>${ROLE_DISPLAY_NAMES[role]}</persona>
<focus>${ROLE_DESCRIPTIONS[role]}</focus>`;
}

/**
 * Available analyst roles configuration for the API.
 */
export const ANALYST_ROLES: AnalystRole[] = ['ciso', 'detection', 'ir', 'cti'];

export interface RoleConfig {
  id: AnalystRole;
  label: string;
  description: string;
  promptPreamble: string;
  responseFormat: string;
}
