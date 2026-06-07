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

### EXECUTIVE SUMMARY
300-word dense summary: what this threat is, current status, threat level assessment, impact scope, and the single most critical action item. Include key metrics (CVSS, EPSS, victim count, provider scores).

### KEY FINDINGS
6-10 bullet points. Each must:
- State a specific, verifiable fact with exact values
- Cite the source tool: "[Source: check_ioc — VirusTotal: 15/90, AbuseIPDB: 92% confidence]"
- Include a confidence tag: [Confirmed] [Probable] [Possible]
- Be operationally actionable

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
- Affected component and root cause
- CVSS v3.1 vector string and breakdown (AV/AC/PR/UI/S/C/I/A)
- EPSS score and percentile — probability of exploitation in next 30 days
- CISA KEV status: date added, vulnerability name, known ransomware use
- CWE classification
- Affected products with exact version ranges
- Patch availability and workarounds

#### Exploitation Status
- In-the-wild exploitation: confirmed/probable/possible with evidence
- PoC availability: public/private/none with source
- Weaponization: integrated into exploit kits, ransomware, botnets
- Threat actors known to use this CVE (with confidence level)
- Timeline: disclosure date → PoC date → mass exploitation date

#### Affected Products Matrix
| Product | Version | Patched | Notes |`
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
Prioritized by urgency:

#### IMMEDIATE (0-24 hours)
- Specific IOCs to block (IPs, domains, hashes with exact values)
- Patches to apply (CVE IDs with priority)
- Accounts/systems to check

#### SHORT-TERM (1-7 days)
- Detection rules to deploy
- Hunting queries to run
- Network segmentation changes
- Email filtering rules

#### MEDIUM-TERM (1-4 weeks)
- Security architecture improvements
- Monitoring enhancements
- Threat intelligence program updates
- Training requirements

#### STRATEGIC
- Long-term posture improvements
- Threat model updates
- Intelligence sharing recommendations

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

  return `<investigation>
Query: ${query}
Type: ${queryType}
Steps: ${steps.length}
Total tool results: ${steps.reduce((n, s) => n + s.results.length, 0)}
</investigation>

<investigation_data>
${stepBlocks}
</investigation_data>

Write the intelligence report following the structure in the system prompt. Generate the STIX 2.1 bundle at the end.`;
}
