/**
 * CTI Analyst Agent — Prompts for the intelligence cycle.
 */
import type { AgentStep } from './types';

export function buildObserverPrompt(): string {
  return `<role>CTI analyst observer. After each tool call, extract actionable intelligence.</role>
<task>Analyze tool results and extract: IOCs (with context), actor attributions, CVE IDs with scores, MITRE techniques, malware families, campaign indicators, infrastructure details. Be specific — include exact values, scores, dates.</task>
<output_format>{"observation":"summary","keyFacts":["specific fact with value"],"gaps":["what's still needed"]}</output_format>`;
}

export function buildSynthesizerPrompt(query: string, queryType: string): string {
  const isActor = queryType === 'actor' || queryType === 'ransomware';
  const isCve = queryType === 'cve';
  const isIoc = ['ip', 'domain', 'hash', 'url'].includes(queryType);

  return `<role>You are a senior CTI analyst producing an intelligence report for a SOC team.</role>

<task>Write an intelligence report about "${query}" based ONLY on the investigation data below.

## FORMAT RULES

### EXECUTIVE SUMMARY
80-100 words MAX. Lead with the single most important finding. Only include metrics that appear in tool data. Skip any metric not in data — do NOT write "not available", just omit it.

### KEY FINDINGS
4-6 bullet points. Each MUST:
- State a specific fact with exact values FROM TOOL DATA
- Cite source: "[Source: tool_name]"
- Include confidence: [Confirmed] [Probable] [Possible]
- NEVER include "Not available" or "Not determined" as a finding — only findings WITH data
- If you have fewer than 4 real findings, write fewer bullets — do not pad with gaps

### THREAT PROFILE
${
  isActor
    ? `Write ONLY sections with data. SKIP sections entirely if no data exists — do NOT write "Not available":
- Actor Overview: name, aliases, country, motivation (only if enrich_actor returned data)
- TTPs: ONLY techniques from tool data in table format (only if techniques found)
- Infrastructure: ONLY if tool data mentions C2, hosting, or domains
- Victimology: ONLY sectors/geographies from tool data`
    : ''
}
${
  isCve
    ? `Write ONLY sections with data. SKIP sections entirely if no data exists:
- Vulnerability Details: CVSS vector (EXACT from data), CWE, affected products (EXACT from data)
- EPSS: ONLY if lookup_cve returned epss data. If not, OMIT entirely — do not write "Not available"
- KEV: ONLY if lookup_cve returned kev data. If not, OMIT entirely
- Exploitation Status: ONLY if a tool explicitly states exploitation. If not, OMIT entirely
- Threat Actors: ONLY if enrich_actor returned actors. If not, OMIT entirely
- Affected Products: ONLY from lookup_cve data`
    : ''
}
${
  isIoc
    ? `Write ONLY sections with data:
- Provider verdicts: table from check_ioc data (only providers that returned results)
- Relationships: ONLY if get_relationships returned connections
- Lifecycle: ONLY if get_ioc_lifecycle returned data`
    : ''
}

### DETECTION ENGINEERING
- List generated rules with their full content (from generate_yara_rule data)
- If no rules generated, OMIT this section entirely

### RECOMMENDATIONS
ONLY data-backed:
- IMMEDIATE: List specific IOCs from tool data. If none, OMIT subsection
- SHORT-TERM: Reference generated rules. If none, OMIT subsection
- STRATEGIC: 1-2 sentences of generic advice acceptable

### STIX 2.1 BUNDLE
Generate inside a \`\`\`stix JSON code block with proper STIX 2.1 objects:
- vulnerability (with external_references, NOT cve_id)
- indicator (with pattern, pattern_type, valid_from)
- attack-pattern (with external_references)
- threat-actor (if actor query)
- relationship (linking objects with source_ref, target_ref, relationship_type)
- report (with object_refs array)

### SOURCES
[1] tool_name — what it provided
</task>

<ground_rules>
- ONLY write about data that EXISTS in the tool results. Skip sections with no data entirely.
- NEVER write "Not available from investigation data" in a section — instead, OMIT the entire section.
- NEVER invent CVE IDs, CVSS scores, EPSS values, actor names, or technique IDs.
- DO NOT cite tools that returned 0 results or errored as sources.
- DO NOT repeat the same fact in multiple sections — each fact appears ONCE.
- BANNED: "It is important to note", "It should be noted", "In conclusion", "As mentioned above".
- BANNED: "Not available from investigation data" — just OMIT the section instead.
- CONFIDENCE: [Confirmed] (2+ sources), [Probable] (1 source), [Possible] (weak signal).
- Maximum 2000 words. Dense, no filler.
</ground_rules>`;
}

export function buildSynthesizerUserPrompt(query: string, queryType: string, steps: AgentStep[]): string {
  const stepBlocks = steps
    .map((s) => {
      const toolBlocks = s.results
        .map((r) => {
          const data = r.status === 'ok' ? JSON.stringify(r.data, null, 2).slice(0, 1500) : `ERROR: ${r.error}`;
          return `<tool name="${r.tool}" status="${r.status}">\n${data}\n</tool>`;
        })
        .join('\n');
      return `<step number="${s.stepNumber}" plan="${s.plan}" observation="${s.observation ?? ''}">\n${toolBlocks}\n</step>`;
    })
    .join('\n\n');

  // Build a data availability checklist
  const allTools = steps.flatMap((s) => s.results);
  const okTools = allTools.filter((r) => r.status === 'ok');
  const errTools = allTools.filter((r) => r.status === 'error');
  const hasData = (tool: string) => okTools.some((r) => r.tool === tool && r.data);

  const availability = [
    `lookup_cve: ${hasData('lookup_cve') ? 'YES' : 'NO — OMIT CVE sections'}`,
    `check_ioc: ${hasData('check_ioc') ? 'YES' : 'NO — OMIT provider verdicts'}`,
    `enrich_actor: ${hasData('enrich_actor') ? 'YES' : 'NO — OMIT actor profile'}`,
    `generate_yara_rule: ${hasData('generate_yara_rule') ? 'YES' : 'NO — OMIT detection rules section'}`,
    `unified_search: ${hasData('unified_search') ? 'YES' : 'NO'}`,
    `EPSS: ${JSON.stringify(okTools.find((r) => r.tool === 'lookup_cve')?.data ?? '').includes('epss') ? 'YES' : 'NO — OMIT EPSS entirely'}`,
    `KEV: ${JSON.stringify(okTools.find((r) => r.tool === 'lookup_cve')?.data ?? '').includes('kev') ? 'YES' : 'NO — OMIT KEV entirely'}`,
    `Actors: ${hasData('enrich_actor') ? 'YES' : 'NO — OMIT actor section'}`,
    `Victims: ${JSON.stringify(allTools.map((r) => JSON.stringify(r.data))).includes('victim') ? 'YES' : 'NO — OMIT victim count'}`,
  ];

  return `<investigation>
Query: ${query}
Type: ${queryType}
Steps: ${steps.length}
Results: ${okTools.length} ok, ${errTools.length} failed
</investigation>

<data_availability>
${availability.join('\n')}
</data_availability>

RULE: If data_availability says "NO — OMIT", then SKIP that section entirely. Do NOT write "Not available".

<investigation_data>
${stepBlocks}
</investigation_data>

Write the report. OMIT sections with no data — do NOT write "Not available from investigation data".`;
}
