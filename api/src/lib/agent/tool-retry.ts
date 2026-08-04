/**
 * Tool retry with alternative — when a tool fails, automatically try
 * a different tool that covers the same domain. Maps tool failures
 * to alternative tools based on the investigation context.
 */

import type { AgentToolCall } from './types';

/**
 * Alternative tool mappings — when a tool fails, try these alternatives
 * in order. Each alternative covers the same intelligence domain.
 */
const TOOL_ALTERNATIVES: Record<string, string[]> = {
  // IOC reputation alternatives
  check_ioc: ['enrich_ioc_deep', 'maltiverse_verify'],
  enrich_ioc_deep: ['check_ioc', 'lookup_ipinfo'],
  maltiverse_verify: ['check_ioc', 'enrich_ioc_deep'],

  // Actor/identity alternatives
  enrich_actor: ['search_malpedia', 'actor_timeline'],
  search_malpedia: ['enrich_actor', 'unified_search'],
  actor_timeline: ['enrich_actor', 'get_ransomware_group_profile'],

  // Vulnerability alternatives
  lookup_cve: ['unified_search', 'lookup_cisa_kev'],
  lookup_cisa_kev: ['lookup_cve', 'unified_search'],

  // Domain/host alternatives
  lookup_domain: ['lookup_dns', 'lookup_reverse_dns', 'lookup_builtwith'],
  lookup_dns: ['lookup_domain', 'lookup_reverse_dns'],
  lookup_ipinfo: ['lookup_reverse_dns', 'lookup_asn'],
  lookup_asn: ['lookup_ipinfo', 'lookup_reverse_dns'],
  lookup_builtwith: ['lookup_domain', 'lookup_certificate_transparency'],
  lookup_certificate_transparency: ['lookup_domain', 'lookup_builtwith'],

  // Ransomware alternatives
  get_ransomware_group_profile: ['enrich_actor', 'get_ransomware_activity'],
  get_ransomware_activity: ['get_ransomware_group_profile', 'get_victim_releaks'],

  // Search alternatives
  unified_search: ['darkweb_multi_search', 'cyber_news'],
  darkweb_multi_search: ['unified_search'],

  // Detection alternatives
  generate_yara_rule: ['generate_hunting_queries'],
  generate_hunting_queries: ['generate_yara_rule'],
};

/**
 * Given a failed tool call and the set of tools already called,
 * suggest an alternative tool to try. Returns null if no alternative
 * is available or all alternatives have already been tried.
 */
export function suggestAlternative(
  failedCall: AgentToolCall,
  allToolNames: Set<string>,
  calledToolKeys: Set<string>
): AgentToolCall | null {
  const alternatives = TOOL_ALTERNATIVES[failedCall.tool];
  if (!alternatives) return null;

  for (const alt of alternatives) {
    // Must exist in the tool registry
    if (!allToolNames.has(alt)) continue;
    // Must not have been called with the same args already
    const altKey = `${alt}:${JSON.stringify(failedCall.args)}`;
    if (calledToolKeys.has(altKey)) continue;
    // Return the alternative with the same args and original reasoning
    return {
      tool: alt,
      args: failedCall.args,
      reasoning: `Alternative for failed ${failedCall.tool}: trying ${alt}`,
    };
  }

  return null;
}

/**
 * Get all alternatives for a tool (for display/planning purposes).
 */
export function getAlternatives(tool: string): string[] {
  return TOOL_ALTERNATIVES[tool] ?? [];
}

/**
 * Check if two tools cover the same domain (for deduplication).
 */
export function sameDomain(toolA: string, toolB: string): boolean {
  const altsA = new Set([toolA, ...(TOOL_ALTERNATIVES[toolA] ?? [])]);
  return altsA.has(toolB);
}

/**
 * Natural next-step hints per tool, for the success path. These are the
 * enrichment-chain follow-ups an analyst would run after a clean result —
 * surfaced as `nextActions` on the tool result so the observer gets a stable
 * recovery handle without parsing raw JSON. Keep deterministic and short.
 */
const SUCCESS_NEXT_ACTIONS: Record<string, string[]> = {
  // IOC reputation → correlate + pivot to actor/infrastructure
  check_ioc: ['correlate_iocs', 'enrich_actor', 'lookup_ipinfo'],
  enrich_ioc_deep: ['correlate_iocs', 'get_relationships', 'enrich_actor'],
  maltiverse_verify: ['check_ioc', 'correlate_iocs'],
  lookup_tre_ge: ['check_ioc', 'enrich_ioc_deep'],
  // Actor → TTPs + associated malware + CVEs
  enrich_actor: ['actor_timeline', 'search_malpedia', 'actor_cves'],
  search_malpedia: ['enrich_actor', 'get_ransomware_group_profile'],
  actor_timeline: ['enrich_actor', 'get_ransomware_activity'],
  // CVE → KEV + exploit status + affected actors
  lookup_cve: ['lookup_cisa_kev', 'enrich_actor', 'generate_hunting_queries'],
  lookup_cisa_kev: ['lookup_cve', 'get_supply_chain_attacks'],
  // Domain/host → DNS + CT + relationships
  lookup_domain: ['lookup_dns', 'lookup_certificate_transparency', 'get_relationships'],
  lookup_dns: ['lookup_domain', 'lookup_reverse_dns'],
  lookup_ipinfo: ['lookup_asn', 'lookup_reverse_dns'],
  lookup_asn: ['lookup_ipinfo', 'correlate_iocs'],
  lookup_builtwith: ['lookup_domain', 'lookup_certificate_transparency'],
  lookup_certificate_transparency: ['lookup_domain', 'get_domain_history'],
  // Ransomware → group profile + activity + victims
  get_ransomware_group_profile: ['get_ransomware_activity', 'get_victim_releaks', 'enrich_actor'],
  get_ransomware_activity: ['get_ransomware_group_profile', 'get_victim_releaks'],
  // Hash → reputation + relationships
  sample_scan: ['check_ioc', 'get_relationships'],
  traceix_lookup: ['check_ioc', 'enrich_ioc_deep'],
  // Search → correlate the findings
  unified_search: ['correlate_iocs', 'cross_correlate'],
  darkweb_multi_search: ['unified_search', 'correlate_iocs'],
  // Correlation → nothing further (terminal enrichment)
  correlate_iocs: ['get_relationships'],
  cross_correlate: ['get_relationships', 'correlate_iocs'],
  get_relationships: [],
};

/**
 * Return the next-action hints for a tool result. On success these are the
 * natural enrichment-chain follow-ups; on error they are the documented
 * alternatives (mirrors TOOL_ALTERNATIVES so the observer can suggest a retry
 * with a different tool). Always returns a fresh array (never the internal
 * map entry) so callers can mutate safely.
 */
export function nextActionsFor(tool: string, status: 'ok' | 'error'): string[] {
  if (status === 'error') {
    return [...(TOOL_ALTERNATIVES[tool] ?? [])];
  }
  return [...(SUCCESS_NEXT_ACTIONS[tool] ?? [])];
}
