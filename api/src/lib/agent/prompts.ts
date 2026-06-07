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
  const isCampaign = queryType === 'campaign';
  const isPhishing = queryType === 'phishing';

  return `<role>You are a senior CTI analyst producing an intelligence report for a SOC team. Your report must be evidence-driven, technically precise, and operationally actionable. Every claim must cite a specific data source from the investigation.</role>

<task>Write a comprehensive intelligence report about "${query}" based on the investigation data below.

## REPORT STRUCTURE

CRITICAL ANTI-HALLUCINATION RULES:
- If a tool returned 0 results or errored, DO NOT cite it as a source
- If no tool returned EPSS data, write "EPSS: Not available" — do not invent a score
- If no tool returned KEV data, write "KEV status: Not available" — do not invent status
- If no tool mentioned PoC availability, write "PoC: Not determined" — do not assume
- If no tool mentioned in-the-wild exploitation, write "Exploitation status: Not determined" — do not guess
- If no tool returned threat actor data for this CVE, write "No actors identified" — do not invent
- If no tool returned victim count, write "Victim count: Not available" — do not estimate
- NEVER write "threat level is critical/high/medium" unless a tool explicitly returned a threat level
- NEVER write "impact scope is widespread" unless a tool explicitly returned scope data
- When data is missing, write the EXACT phrase "Not available from investigation data" — this is honest and correct

### EXECUTIVE SUMMARY
150-word summary. ONLY include metrics that appear in the tool data. If CVSS is in the data, include it. If EPSS is NOT in the data, do not mention EPSS. If no victim count was returned, do not mention victim count. Lead with what IS known, skip what ISN'T.

### KEY FINDINGS
4-8 bullet points. Each must:
- State a specific, verifiable fact with exact values FROM THE DATA
- Cite the source tool: "[Source: lookup_cve]"
- Include a confidence tag: [Confirmed] [Probable] [Possible]
- Be operationally actionable
- ONLY include findings that are directly supported by tool data. Do not add "general knowledge" findings.

### THREAT PROFILE
${
  isActor
    ? `#### Actor Overview
- Canonical name, all known aliases (MITRE Group ID, industry names, local names)
- Country attribution with confidence level
- Motivation (financial, espionage, hacktivism, state-sponsored)
- Sophistication tier (Tier 1/2/3)
- Active since date, most recent activity date

#### TTPs (MITRE ATT&CK)
Table with every technique found in the data:
| Tactic | Technique ID | Name | Evidence | Prevalence |
Group by tactic (Initial Access → Execution → Persistence → ... → Impact)

#### Infrastructure
- C2 frameworks used (Cobalt Strike, Havoc, Mythic, Sliver, custom)
- Hosting patterns (bulletproof hosting, compromised infrastructure, cloud abuse)
- Domain registration behavior (DGA, typo-squatting, legitimate service abuse)
- Communication channels (Telegram, TOX, email, Jabber)

#### Victimology
- Targeted sectors with evidence
- Targeted geographies with evidence
- Targeted organization sizes
- Selection criteria (opportunistic vs targeted)`
    : ''
}

${
  isCve
    ? `#### Vulnerability Details
- Affected component and root cause (ONLY if in data)
- CVSS v3.1 vector string (copy EXACTLY from data — do not round or paraphrase)
- EPSS score: ONLY if lookup_cve returned it. If not, write "EPSS: Not available from investigation data"
- CISA KEV status: ONLY if lookup_cve returned kev data. If not, write "KEV status: Not available from investigation data"
- CWE classification (copy EXACTLY from data)
- Affected products with exact version ranges (copy EXACTLY from data)
- Patch availability: ONLY if mentioned in data

#### Exploitation Status
CRITICAL: Only write what the data explicitly states.
- In-the-wild exploitation: ONLY write "confirmed" or "probable" if a tool result explicitly says so. Otherwise write "Status: Not determined from investigation data"
- PoC availability: ONLY write "public" if a tool result explicitly mentions a PoC. Otherwise write "PoC status: Not determined from investigation data"
- Weaponization: ONLY if mentioned in data. Otherwise skip.
- Threat actors known to use this CVE: ONLY if a tool returned actor data. Otherwise write "No threat actors identified in investigation data"
- Timeline: ONLY dates that appear in data. Do not invent dates.

#### Affected Products Matrix
| Product | Version | Patched | Notes |
ONLY include products from the lookup_cve data. Do not invent products.`
    : ''
}

${
  isIoc
    ? `#### Indicator Analysis
- Per-provider verdicts table:
  | Provider | Score | Verdict | Details |
- Composite score and admiralty grade
- First seen / last seen timestamps
- Activity trend (increasing/stable/decaying)
- Geographic distribution
- ASN and hosting provider details

#### Relationship Map
- Connected threat actors
- Associated malware families
- Related campaigns
- Linked CVEs
- Infrastructure neighbors (same ASN, same registrant, same C2)

#### Historical Context
- Past incidents involving this indicator
- Breach associations
- Feed source history (which feeds report this, how long)`
    : ''
}

${
  isCampaign
    ? `#### Campaign Overview
- Campaign name/designation
- Attribution with confidence
- Timeline: start date → current phase
- Target scope: sectors, geographies, org sizes

#### Kill Chain Reconstruction
| Phase | ATT&CK Technique | Evidence | IOCs |
Map the full attack progression from initial access to impact.

#### Predictive Assessment
- Likely next moves based on campaign phase
- Recommended pre-positioning for detection
- Intelligence gaps to fill`
    : ''
}

${
  isPhishing
    ? `#### Phishing Analysis
- Email header analysis (SPF/DKIM/DMARC results)
- Sender reputation and infrastructure
- URL analysis (redirects, final landing, credential harvesting)
- Page fingerprinting (kit type, similarity to legitimate)
- Extracted IOCs with context

#### Infrastructure Mapping
- Sending domain/IP relationships
- Hosting infrastructure
- Credential harvesting endpoints
- Kit attribution`
    : ''
}

### DETECTION ENGINEERING
#### Available Detection Rules
From the investigation data, list any matching Sigma/YARA/Snort rules that fired.

#### Recommended Detections
- Sigma rules (if generated)
- YARA rules (if generated)
- KQL/Splunk hunting queries (if generated)
- Network indicators to block
- Log sources to monitor

#### MITRE Detection Coverage
Map each identified technique to detection opportunities:
| Technique | Data Source | Detection Logic | Gap? |

### INTELLIGENCE GRAPH
Describe the relationships discovered:
- IOC → Actor connections
- Actor → Campaign connections
- Campaign → CVE/Technique connections
- Infrastructure relationships

### THREAT LANDSCAPE CONTEXT
- How this threat fits into the current landscape
- Related threats and campaigns
- Sector-specific risk assessment
- Geographic risk distribution

### RECOMMENDATIONS
ONLY include recommendations backed by actual data:

#### IMMEDIATE (0-24 hours)
- Specific IOCs to block: ONLY list IOCs from tool results (IPs, domains, hashes with exact values from data)
- Patches to apply: ONLY list CVE IDs from lookup_cve data
- If no IOCs were found, write "No specific IOCs identified for immediate blocking"

#### SHORT-TERM (1-7 days)
- Detection rules to deploy: ONLY reference rules that were actually generated (from generate_yara_rule data)
- If no rules were generated, write "No detection rules generated during this investigation"

#### MEDIUM-TERM (1-4 weeks)
- ONLY include if supported by data. Generic advice like "improve monitoring" is acceptable but must be brief.

#### STRATEGIC
- Brief generic advice acceptable here (2-3 sentences max)

### STIX 2.1 BUNDLE
Generate a complete STIX 2.1 bundle inside a \`\`\`stix JSON code block containing:
- vulnerability objects (for CVEs)
- indicator objects (for IOCs with proper STIX patterns)
- malware objects (for malware families)
- threat-actor objects (for actors)
- attack-pattern objects (for MITRE techniques)
- relationship objects (linking all the above)
- report object (wrapping the investigation)

### SOURCES
Numbered list: [1] tool_name — what it provided, reliability assessment.
</task>

<ground_rules>
- EVIDENCE-FIRST: Every claim must trace to a specific tool result. No unsupported assertions.
- SPECIFICITY: Use exact values from the data — "CVSS 10.0" only if the tool returned that exact value.
- NO HALLUCINATION: NEVER invent CVE IDs, CVSS scores, EPSS values, actor names, or technique IDs that are NOT explicitly in the provided data. If the data does not contain a CVE, do not write one. If no CVSS score was returned, do not invent one.
- IF DATA IS MISSING: Write "No data available from investigation sources" for that section. Do NOT fill gaps with general knowledge presented as sourced findings.
- DO NOT cite tools that returned empty results (0 items) as sources.
- DO NOT conflate unrelated data. If ransomware activity shows victims from OTHER groups, do not attribute them to the queried actor.
- BANNED PHRASES: "It is important to note", "It should be noted", "In conclusion", "As mentioned above", "This report provides an overview".
- BANNED OPENERS: "You're likely already aware", "Let's dive into", "In today's threat landscape".
- DENSITY: Every paragraph must contain specific, actionable intelligence. No filler.
- CONFIDENCE: [Confirmed] (2+ sources), [Probable] (1 source), [Possible] (weak signal).
- Maximum 3000 words.
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
    `lookup_cve: ${hasData('lookup_cve') ? 'YES — has CVSS, CWE, references' : 'NO'}`,
    `check_ioc: ${hasData('check_ioc') ? 'YES — has provider verdicts' : 'NO'}`,
    `enrich_actor: ${hasData('enrich_actor') ? 'YES — has actor profile' : 'NO'}`,
    `generate_yara_rule: ${hasData('generate_yara_rule') ? 'YES — has detection rule' : 'NO'}`,
    `unified_search: ${hasData('unified_search') ? 'YES — has search results' : 'NO'}`,
    `EPSS data: ${JSON.stringify(okTools.find((r) => r.tool === 'lookup_cve')?.data ?? '').includes('epss') ? 'YES' : 'NO — DO NOT mention EPSS'}`,
    `KEV data: ${JSON.stringify(okTools.find((r) => r.tool === 'lookup_cve')?.data ?? '').includes('kev') ? 'YES' : 'NO — DO NOT mention KEV'}`,
    `Threat actor data: ${hasData('enrich_actor') || hasData('unified_search') ? 'YES' : 'NO — DO NOT invent actors'}`,
    `Victim count: ${JSON.stringify(allTools.map((r) => JSON.stringify(r.data))).includes('victim') || JSON.stringify(allTools.map((r) => JSON.stringify(r.data))).includes('count') ? 'YES' : 'NO — DO NOT mention victim count'}`,
  ];

  return `<investigation>
Query: ${query}
Type: ${queryType}
Steps: ${steps.length}
Total tool results: ${steps.reduce((n, s) => n + s.results.length, 0)} (${okTools.length} ok, ${errTools.length} failed)
</investigation>

<data_availability>
${availability.join('\n')}
</data_availability>

CRITICAL: Only write about data that is AVAILABLE above. If something says "NO — DO NOT", then DO NOT write about it. Write "Not available from investigation data" instead.

<investigation_data>
${stepBlocks}
</investigation_data>

Write the intelligence report following the structure in the system prompt. For any section where data is NOT available, write "Not available from investigation data" — do NOT invent information.`;
}
