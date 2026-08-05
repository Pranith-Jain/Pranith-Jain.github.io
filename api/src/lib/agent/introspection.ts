/**
 * Agent introspection — structured recovery notes for failed/banned tools.
 *
 * When a tool fails 3× and gets banned (shouldBanTool), the agent currently
 * moves on silently. This module captures the failure, diagnoses the likely
 * cause (bad arg, dead upstream, rate limit), and produces an introspection
 * note that the synthesizer includes in the report's "Data Gaps &
 * Limitations" section so the analyst knows what was missed.
 *
 * Inspired by the agent-introspection-debugging skill: capture → diagnosis →
 * contained recovery → introspection report.
 */
import type { AgentStep } from './types';

export interface ToolFailure {
  tool: string;
  error: string;
  step: number;
  /** Diagnosed cause category. */
  cause: 'upstream-error' | 'rate-limit' | 'bad-args' | 'timeout' | 'unknown';
  /** Human-readable diagnosis. */
  diagnosis: string;
  /** What the investigation missed because this tool failed. */
  missedCapability: string;
}

/**
 * Extract failed tool calls from the investigation steps and diagnose each.
 * Returns a structured introspection list for the synthesizer.
 */
export function extractToolFailures(steps: AgentStep[]): ToolFailure[] {
  const failures: ToolFailure[] = [];
  const seen = new Set<string>();

  for (const step of steps) {
    for (const result of step.results) {
      if (result.status !== 'error') continue;
      const key = `${result.tool}:${result.error ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const error = result.error ?? 'unknown error';
      const cause = diagnoseCause(error);
      const missed = missedCapabilityFor(result.tool);

      failures.push({
        tool: result.tool,
        error: error.slice(0, 200),
        step: step.stepNumber,
        cause,
        diagnosis: diagnose(cause, result.tool, error),
        missedCapability: missed,
      });
    }
  }

  return failures;
}

function diagnoseCause(error: string): ToolFailure['cause'] {
  const lower = error.toLowerCase();
  if (lower.includes('rate limit') || lower.includes('429') || lower.includes('too many requests')) {
    return 'rate-limit';
  }
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return 'timeout';
  }
  if (
    lower.includes('400') ||
    lower.includes('bad request') ||
    lower.includes('invalid') ||
    lower.includes('missing')
  ) {
    return 'bad-args';
  }
  if (
    lower.includes('500') ||
    lower.includes('502') ||
    lower.includes('503') ||
    lower.includes('internal') ||
    lower.includes('upstream')
  ) {
    return 'upstream-error';
  }
  return 'unknown';
}

function diagnose(cause: ToolFailure['cause'], tool: string, _error: string): string {
  switch (cause) {
    case 'rate-limit':
      return `${tool} hit a rate limit — the upstream provider throttled the request. Retry later or use an alternative source.`;
    case 'timeout':
      return `${tool} timed out — the upstream provider took too long to respond. The data may exist but was unreachable within the investigation budget.`;
    case 'bad-args':
      return `${tool} received invalid arguments — the planner may have passed an unsupported value. Check the tool's parameter schema.`;
    case 'upstream-error':
      return `${tool} returned an upstream error — the provider's API failed (500/502/503). This is a transient provider issue, not an investigation error.`;
    default:
      return `${tool} failed with an unclassified error. The investigation continued without its data.`;
  }
}

/**
 * Map a tool to the capability/capability section it would have filled.
 * Used to tell the analyst what intelligence was missed.
 */
function missedCapabilityFor(tool: string): string {
  const map: Record<string, string> = {
    check_ioc: 'IOC reputation and threat classification',
    enrich_ioc_deep: 'deep IOC enrichment (ASN, geo, co-hosted domains, relationships)',
    enrich_actor: 'threat actor profile (aliases, motivations, targets, TTPs)',
    actor_timeline: '30-day activity timeline for the threat actor',
    actor_cves: 'CVEs associated with the threat actor',
    search_malpedia: 'malware family details and known tooling',
    lookup_cve: 'CVE details (CVSS, references, affected products)',
    lookup_cisa_kev: 'CISA KEV (Known Exploited Vulnerabilities) status',
    lookup_exploit_db: 'public exploit availability',
    reconstruct_attack_chain: 'MITRE ATT&CK kill-chain mapping and attack progression',
    get_relationships: 'IOC relationship graph and infrastructure links',
    generate_yara_rule: 'YARA detection rule for the identified malware',
    generate_hunting_queries: 'KQL/SIEM hunting queries for the threat',
    cross_correlate: 'cross-source IOC correlation',
    cross_campaign_correlate: 'campaign cross-correlation and shared infrastructure',
    breach_check: 'breach database hit for the target',
    get_victim_releaks: 'ransomware victim re-leak data',
    get_ransomware_group_profile: 'ransomware group profile (onion URLs, TTPs, tools)',
    sample_scan: 'malware sample analysis (sandbox verdict, network IOCs)',
    scan_package: 'package vulnerability/malicious-package scan',
    scan_dependencies: 'dependency vulnerability scan',
    ti_list_cves: 'threat-intel CVE catalog (NVD + KEV)',
    ti_list_darknet: 'darknet site directory lookup',
    dn_greynoise_check: 'GreyNoise IP classification (scanner/benign)',
    dn_abuseipdb_check: 'AbuseIPDB abuse confidence score',
    dn_hibp_latest: 'HIBP breach data',
    dn_threatfox_search: 'ThreatFox IOC lookup (malware family, confidence)',
    dn_bazaar_hash: 'MalwareBazaar sample lookup by hash',
    dn_otx_ip: 'AlienVault OTX pulse data for the IP',
    dn_otx_domain: 'AlienVault OTX pulse data for the domain',
    dn_otx_hash: 'AlienVault OTX pulse data for the hash',
    dn_pulsedive_indicator: 'Pulsedive indicator risk assessment',
    dn_intelx_search: 'IntelX leak/paste-site search',
    dn_hybrid_search: 'Hybrid Analysis malware report for the hash',
    dn_ransomware_group: 'ransomware.live group profile',
    dn_vulners_search: 'Vulners vulnerability/exploit search',
    traceix_lookup: 'Traceix SHA-256 AV reputation lookup',
    whoxy_reverse_whois: 'reverse WHOIS domain registration lookup',
    depx_check: 'supply-chain malicious-package check',
    breach_vip_search: 'breach database search (BreachVIP)',
  };
  return map[tool] ?? `${tool} data (capability not mapped)`;
}

/**
 * Build the "Data Gaps & Limitations" markdown section for the synthesizer
 * to include in the report. Returns null when there are no failures.
 */
export function buildDataGapsSection(steps: AgentStep[]): string | null {
  const failures = extractToolFailures(steps);
  if (failures.length === 0) return null;

  const lines: string[] = ['## Data Gaps & Limitations', ''];
  lines.push(
    'The following tool calls failed during this investigation. The report is based on the data that was successfully collected; these gaps are surfaced so the analyst can assess completeness and retry if needed.'
  );
  lines.push('');
  lines.push('| Tool | Step | Cause | What Was Missed | Diagnosis |');
  lines.push('|---|---|---|---|---|');
  for (const f of failures) {
    lines.push(`| \`${f.tool}\` | ${f.step} | ${f.cause} | ${f.missedCapability} | ${f.diagnosis} |`);
  }
  lines.push('');
  lines.push(
    '**Analyst note:** These failures do not invalidate the findings above, but they limit coverage. If a critical question depends on a failed tool, retry the investigation or call the tool directly.'
  );

  return lines.join('\n');
}
