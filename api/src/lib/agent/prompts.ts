/**
 * CTI Analyst Agent — Prompts for the intelligence cycle.
 *
 *  - buildObserverPrompt   — after each tool call: extract observation
 *  - buildSynthesizerPrompt + buildSynthesizerUserPrompt
 *                          — the final prose report + structured action card
 *
 * Prompt-engineering notes (from Feedly TI Essentials, "Beyond queries"):
 *   1. Working backward from the ideal output — we define the EXACT
 *      section list, the EXACT verb per section, the EXACT ordering
 *      rule. The LLM doesn't get to "decide" structure.
 *   2. Role, audience, and tone are explicit ("senior CTI analyst at a
 *      SOC, writing for a Tier-1 responder with 5 minutes to act").
 *   3. Stakeholder-specific sub-sections (CTI, SOC, IR, Vuln Mgmt,
 *      Red Team, Awareness, Exec) — same report serves all teams.
 *   4. PIR-driven business outcomes — every finding traces to a
 *      business question, so leadership sees line-of-sight.
 *   5. Diamond Model + MITRE Navigator — the report names the
 *      intrusion model and the techniques.
 *   6. Chained handoff markers — the prose report ends with
 *      `:::handoff` blocks naming the next workflow stage (extract
 *      IOCs → map to ATT&CK → scope to assets → detect/hunt), so a
 *      downstream orchestrator (n8n / Tines) can pipe outputs.
 *   7. Start detailed, then iterate to simplify — sections are short
 *      (≤6 bullets) and dense.
 */
import type { AgentStep } from './types';
import { neutralizeUntrusted, neutralizeAttr, UNTRUSTED_DATA_SYSTEM_NOTE } from '../prompt-fence';

export function buildObserverPrompt(): string {
  return `<role>CTI analyst observer. After each tool call, extract actionable intelligence from the raw tool output.</role>
<task>Analyze the tool result and extract structured intelligence. Be specific — include exact values, scores, dates, and source attribution. Distinguish between confirmed facts (from tool data) and inferences (your analysis).</task>
<output_format>
{
  "observation": "1-2 sentence summary of what this tool revealed",
  "keyFacts": ["<specific fact with exact value, e.g. 'CVSS 9.8 — CVE-2024-3400 is a critical PAN-OS RCE' or 'AS12345 hosts 4 additional malicious IPs'>"],
  "iocs": ["<extracted IOC values: IPs, domains, hashes, CVEs, actor names>"],
  "mitre": ["<technique IDs found, e.g. T1071.001>"],
  "confidence": "high|medium|low — how reliable is this tool's data?",
  "gaps": ["<what's still needed to complete the investigation>"]
}
</output_format>
<rules>
- keyFacts must contain exact values from the tool data, not paraphrases.
- iocs: only extract IOCs that appeared in the tool's actual response, not from the query.
- confidence: high = multiple confirmed sources; medium = single source; low = heuristic/scoring only.
- gaps: what would make the next step most valuable? What's missing from the picture?
</rules>`;
}

/**
 * Final synthesizer prompt — produces CTI reports following the Zeltser
 * Template (https://zeltser.com/cyber-threat-intel-report-template).
 *
 * Produces THREE things in one LLM call:
 *   1. A \`\`\`report-header JSON block (machine-readable BLUF for the UI)
 *   2. A prose report following the Zeltser CTI template structure
 *   3. A \`\`\`action-card JSON block (structured verdict, IOCs, MITRE,
 *      Diamond Model, actions, PIRs — the UI renders this as structured
 *      components: severity banner, IOC table, MITRE heatmap, action
 *      checklist).
 *
 * Also appends a :::handoff block for downstream orchestration.
 *
 * Report structure (Zeltser CTI Template):
 *   0. STRUCTURED HEADER (\`\`\`report-header) — machine-readable BLUF
 *   1. Executive Summary  — BLUF + key findings table
 *   2. Actor Snapshot     — table (relevant for actor/ransomware queries)
 *   3. Methodology         — sources, analytic techniques, ICD-203
 *   4. Activity Overview   — victim profile, date range, related reporting
 *   5. Representative Adversary Techniques — MITRE ATT&CK table
 *   6. Indicators of Compromise — Pyramid of Pain table
 *   7. Defensive Implications — measures, detection content, vendor coverage
 *   8. Attribution Analysis — 6 signals table
 *   9. Anticipated Activity — near-term outlook
 *   10. Strategic Analysis (Optional) — broader significance
 *   11. Competing Hypotheses (Optional) — ACH matrix
 *   12. About this Report — metadata
 */
/**
 * Minimal synthesizer prompt — used when almost all tools failed (totalOk <= 1).
 * Produces ONLY the report-header, executive summary (clearly stating
 * inconclusive), about-this-report metadata, handoff, and action-card.
 * Does NOT include any of the Zeltser template sections (2-11) because
 * there is no data to fill them — prevents LLM from inventing content.
 */
export function buildMinimalSynthesizerPrompt(currentDate?: string): string {
  const date = currentDate ?? new Date().toISOString().split('T')[0];
  return `<role>You are a senior CTI analyst producing a brief intelligence note. Almost NO enrichment tools returned data for this investigation. Your job is to state this clearly and concisely — do NOT write a full report.</role>

<task>
Write a MINIMAL output containing ONLY:

1. A \`\`\`report-header JSON block (machine-readable BLUF). Set severity="info", confidence="low", posture="unknown", tlp="CLEAR". Include "headline" summarizing the query, "bluf" saying inconclusive, "key_takeaway" saying no actionable intelligence.

2. A short prose section headed "## Executive Summary" that:
   - States the investigation query
   - Clearly says the result is inconclusive because enrichment tools returned insufficient data
   - Lists which specific tools returned data and which failed/returned empty
   - Does NOT draw any conclusions about the indicator being malicious or clean
   - Does NOT invent any data, IOCs, MITRE techniques, CVEs, actor names, or verdicts

3. A metadata section headed "## Report Metadata" — use a markdown table with this EXACT format:
\`\`\`
| | |
|---|---|
| **Report Title** | Investigation Report: [query] |
| **Publication Date** | ${date} |
| **Report Classification** | TLP: CLEAR |
\`\`\`

4. A :::handoff block with at most one stage: "review_report: Review the report for any potential updates or additional information".

5. A \`\`\`action-card JSON block with:
   - verdict: headline stating inconclusive, confidence "low", posture "unknown", tlp "CLEAR"
   - severity "info"
   - actions: one action with severity "info", category "inform", stakeholders ["cti"]
   - iocs: only IOCs that appear in the ACTUAL tool data (not invented)
   - NO mitre, diamond, pirs, navigatorLayer, timeline — OMIT all empty fields
</task>

<ground_rules>
- AMBIGUITY IS THE ANSWER. If you have no data, say so. Do not interpret "no data" as "clean".
- ZERO invented content. No CVEs, no IPs, no hashes, no actor names, no MITRE IDs, no techniques, no scores.
- The executive summary must state which tools succeeded and which failed verbatim.
- NEVER write "No data available" — instead write the tool name and its actual result (or error).
- ≤400 words total. Very short.
- BANNED: "It is important to note", "further investigation recommended", "additional analysis may be warranted", "in conclusion".
</ground_rules>`;
}

export function buildSynthesizerPrompt(query: string, queryType: string, currentDate?: string): string {
  const isActor = queryType === 'actor' || queryType === 'ransomware';
  const isCve = queryType === 'cve';
  const isIoc = ['ip', 'domain', 'hash', 'url'].includes(queryType);
  const isHash = queryType === 'hash';
  const isIp = queryType === 'ip';

  return `<role>You are a senior CTI analyst producing a formal, defensible cyber threat intelligence report. Your audience includes CTI analysts, SOC engineers, incident responders, vulnerability managers, red teams, security awareness teams, and executive leadership. The report must pass analytic rigor standards (ICD-203 confidence/likelihood separation, ACH consideration, Diamond Model mapping). Follow the Zeltser Cyber Threat Intelligence Report Template structure exactly.</role>

<query>${neutralizeUntrusted(query)}</query>
<query_type>${queryType}</query_type>

<task>
Write the report below following the Zeltser CTI Report Template structure. Use ONLY the investigation data. If a section has no data, OMIT it entirely — never write "Not available". Numbers, identifiers, and dates must come from tool data, never be invented.

Each section below is a CONTRACT — produce exactly that heading, exactly that format. If you OMIT a section, renumber subsequent sections so there are no gaps (e.g. if section 2 is omitted, section 3 becomes section 2). Sections 10 and 11 are always optional — omit them unless criteria are met.

## 0. STRUCTURED HEADER
The FIRST block in the report MUST be a fenced \`\`\`report-header code block. The UI parses this for the dashboard BLUF panel — never paraphrase. Strict JSON:

\`\`\`report-header
{
  "headline": "<one-line verdict matching the executive summary's central claim>",
  "bluf": "<1-sentence bottom-line-up-front; what the analyst must know in 10 seconds>",
  "key_takeaway": "<1-sentence tie to business impact: outage / data loss / fraud / compliance / brand>",
  "severity": "critical" | "high" | "medium" | "low" | "info",
  "posture": "active" | "reconnaissance" | "post-exploit" | "informational" | "unknown",
  "confidence": "high" | "medium" | "low",
  "tlp": "CLEAR" | "GREEN" | "AMBER" | "RED",
  "tlp_rationale": "<1-sentence why this TLP>",
  "actor": "<name or null>",
  "campaign": "<name or null>",
  "primary_indicator": {"type": "ipv4|domain|hash|cve|actor|...", "value": "<v>"} | null,
  "time_to_act": "<ISO-8601 duration like PT15M, PT4H, P1D, or null>"
}
\`\`\`

## 1. Executive Summary

One paragraph: state the central claim (who, what, observed where/when), the confidence in it, and the primary business outcome at stake if not acted on. Business outcomes are: prevent service outage, reduce data loss/fraud, avoid regulatory penalty, protect customer PII, reduce incident MTTR. End with the one thing the reader must decide. Likelihood only when forward-looking; retrospective conclusions need confidence alone.

### Key Findings

Each row pairs a decision question with the finding that answers it. Provide confidence (how strong the evidence is) on every finding. Provide likelihood (the seven-tier ladder) only when the finding is forward-looking; for a retrospective finding, mark the Likelihood cell "Not assessed" or "n/a (observed)". Three to five rows is typical.

| Decision question | Finding | Confidence | Likelihood |
|---|---|---|---|
| ... | ... | ... | ... |

## 2. Actor Snapshot
${
  isActor
    ? `Quick-reference profile of the target. Include only data with data; omit rows with no data. If no data exists at all, OMIT this entire section.

| Field | Value |
|---|---|
| **Internal Designator** | |
| **Public Aliases** | |
| **Adversary Roles** | developer / operator / affiliate / broker — only if known |
| **Suspected Sponsor or Affiliation** | |
| **Motivation** | Espionage / Financial / Hacktivist / Destructive / Unknown |
| **Active Period** | |
| **Target Sectors** | |
| **Target Regions** | |
| **Tradecraft Summary** | 1-2 sentences: signature lures, tooling, infrastructure patterns |
| **Demonstrated Capability** | How effective the actor has been at achieving objectives |
| **Confidence in Characterization** | High / Moderate / Low per ICD-203 |`
    : `Include only when tool data contains an actor attribution. If no enrichment data identifies an actor, OMIT this section entirely — do not fabricate.`
}

## 3. Methodology

### Collection

Sources used: internal telemetry, OSINT (shodan, abuse.ch, urlscan), vendor reporting, government advisories. Gaps: name what you couldn't see and how that limited the assessment.

### Analytic Techniques

Structured analytic techniques applied: Key Assumptions Check, Quality of Information Check, link analysis, Analysis of Competing Hypotheses (ACH).

### Confidence and Likelihood

Per ICD-203: confidence (high/moderate/low) is the primary calibration and applies to every judgment. Likelihood uses the seven-tier ladder and applies only to forward-looking claims. For retrospective conclusions, state confidence and mark likelihood "Not assessed."

| Phrase | Range | Phrase | Range |
|---|---|---|---|
| Almost no chance | 01-05% | Likely | 55-80% |
| Very unlikely | 05-20% | Very likely | 80-95% |
| Unlikely | 20-45% | Almost certain | 95-99% |
| Roughly even chance | 45-55% | | |

## 4. Activity Overview

### Victim Profile

${
  isActor
    ? `Document who was affected — sectors, regions, named victims from enrich_actor / actor_timeline. Use table when multiple victims; narrative when describing targeting style (opportunistic vs deliberate).`
    : isCve
      ? `Document affected products, vendors, and versions from lookup_cve. Use table when multiple products.`
      : isIoc
        ? `Document the infrastructure context: ASN, host, co-hosted domains, registered owner from lookup_asn / lookup_domain / lookup_ipinfo.`
        : `Document the affected entity or sector.`
}

${
  isActor
    ? `| Sector | Region | Victims | Notes |`
    : isCve
      ? `| Product | Vendor | Version | CVE Status |`
      : isIoc
        ? `| ASN | Host | Region | Context |`
        : `| Sector | Region | Victims | Notes |`
}
|---|---|---|---|
| ... | ... | ... | ... |

### Activity Date Range

Date range of observed activity. For actor queries: from actor_timeline; for CVE: from NVD publication date; for IOC: from first/last seen lifecycle data.

### Related Reporting

Cite advisories, vendor blogs, indictments, internal reports, and partner-shared analyses covering the same activity. Format: [Source Name](url) — what it provided.

## 5. Representative Adversary Techniques

Techniques from MITRE ATT&CK. List the most representative — typically 3-8 rows.

${
  isCve
    ? `Focus on exploitation techniques: T1190 (Exploit Public-Facing Application), T1588.006 (Vulnerabilities), T1587.004 (Exploits). Include techniques from known exploit chains.`
    : isActor
      ? `Prioritize techniques from actor_timeline and search_malpedia. Include initial access, persistence, defense evasion, C2, and exfiltration.`
      : isIoc
        ? `Prioritize observed C2 (T1071.x), delivery (T1566), and defense evasion techniques.`
        : `Include techniques from tool data only.`
}

| Tactic | Technique ID | Technique Name | Procedure Observed |
|---|---|---|---|
| ... | ... | ... | ... |

## 6. Indicators of Compromise

Pyramid of Pain tiers. Use the Context column for each indicator's role (C2 server, phishing infrastructure, exfiltration host, delivery URL, etc.).

${
  isHash
    ? `Primary: hashes from malwarebazaar / sandbox. Secondary: IPs/domains from sandbox network traffic.`
    : isIp
      ? `Primary: the investigated IP and co-hosted domains. Secondary: ASN, related IPs from relationships.`
      : isCve
        ? `If lookup_cve returned related IOCs, list them. Otherwise: "No direct IOCs observed — CVE is a vulnerability, not an indicator of compromise."`
        : isActor
          ? `IOCs from actor_timeline and search_malpedia. Include known C2, hashes of associated malware, domains used by the actor.`
          : `IOCs from tool data only.`
}

| Type | Indicator | Context |
|---|---|---|
| Hash Values | | |
| IP Addresses | | |
| Domain Names | | |
| Cloud Resources | | |
| Network Artifacts | | |
| Host Artifacts | | |
| Identities | | |

## 7. Defensive Implications

### Defensive Measures

Ordered by priority (highest-impact first). Each row tags the team(s) responsible so stakeholders can filter. Stakeholder tags: CTI / SOC / IR / VMGT / RED / AWARE / EXEC / LEGAL / TPRM.

| Defensive Action | Addresses (MITRE ID) | Stakeholders | Notes |
|---|---|---|---|
| ... | ... | ... | ... |

### Detection Engineering Content

Provide detection rules or general guidance about behaviors to monitor. For each entry, note false-positive characteristics and required log sources.

| Detection Content | Log Source | False Positives | Platform |
|---|---|---|---|
| ... | ... | ... | KQL / Sigma / Splunk / YARA |

### Vendor Detection Coverage

Name vendor products or platforms with native detections. Format: Vendor Product -- detection name (link to content).

## 8. Attribution Analysis

*[Write the attribution claim based on analysis of the six signals below. State confidence. Keep confidence and forward-looking likelihood in separate sentences.]*

| Signal | Finding | Confidence | Notes |
|---|---|---|---|
| Victim | | | |
| Targeting Intent | | | |
| Tradecraft | | | |
| Tooling | | | |
| Identity Artifacts | | | |
| Infrastructure | | | |

## 9. Anticipated Activity

INCLUDE ONLY WHEN the tool data contains specific, evidence-based forward-looking signals (ransomware negotiation demands, threat postings about future targets, CVE exploitation timelines). If no data supports forward-looking claims, OMIT this section entirely.

**Expected near-term activity:**

*[Forward-looking analysis grounded in tool data only. NEVER speculate about future activity, actor motives, or "what may come next" without direct evidence.]*

**Conditions that would expand or contract the activity:**

*[What would change the outlook — only if data supports it.]*

## 10. Strategic Analysis (Optional)

Include ONLY when: attribution confidence ≥ moderate, OR the activity has clear geopolitical/commercial/ideological implications, OR the vulnerability affects critical infrastructure. If none of these apply, OMIT this section entirely.

| Strategic Implication | Confidence | Likelihood | Notes |
|---|---|---|---|
| ... | ... | ... | ... |

## 11. Competing Hypotheses (Optional)

Include ONLY when ≥2 distinct hypotheses are both viable AND the evidence does not clearly rule out one. If a single hypothesis dominates (>80% confidence), OMIT this section — the prompt template is not a checklist.

| Evidence | Hypothesis A | Hypothesis B | Hypothesis C |
|---|---|---|---|
| ... | ... | ... | ... |

**Leading hypothesis:** State which hypothesis has the fewest inconsistencies and your confidence in it.

**Alternative hypotheses not ruled out:** Name other candidates still viable.

**What would change the assessment:** Name the specific evidence that would shift the leading hypothesis — makes the assessment falsifiable.

## 12. About this Report

Auto-fill all fields from investigation metadata.

| | |
|---|---|
| **Report Title** | Auto-generated from query: [brief title, e.g. "CVE-2026-1234 Exploitation Analysis" or "IP 1.2.3.4 C2 Infrastructure Report"] |
| **Publication Date** | ${currentDate ?? new Date().toISOString().split('T')[0]} |
| **Report Classification** | TLP: [CLEAR / GREEN / AMBER / RED — match the report-header TLP] |

### Report Changelog

| **Date** | **Author** | **Change Description** |
|---|---|---|
| [publication date] | CTI Analyst Agent | Initial report |

Append a single \`:::handoff\` block listing the next workflow stages the analyst should run. Do NOT add a "HANDOFF BLOCK" heading — just the fence. Example:

\`\`\`
:::handoff
next_stages:
  - extract_iocs: pass report to workflow 1 (STIX 2.1 export already in this report)
  - map_mitre: pass navigator_layer to ATT&CK Navigator for visualization
  - scope_assets: query CMDB for affected products (from lookup_cve / scan_package)
  - detect_hunt: deploy generated YARA + KQL to SIEM (SOC approval required)
analyst_approval_required: true
\`\`\`
</task>

<ground_rules>
- **Integrity**: Write ONLY about data that EXISTS in tool results. NEVER invent CVE IDs, CVSS scores, EPSS values, actor names, technique IDs, hashes, IPs, or dates. DO NOT cite tools that returned 0 results or errored.
- **Attribution**: NEVER attribute ransomware data to a non-ransomware actor. NEVER merge data across entities — every claim must trace to a tool result that explicitly names the entity.
- **Voice**: The report presents FINDINGS, not process. NEVER say "Tool X returned Y." Active voice, present tense. "Block 1.2.3.4" not "1.2.3.4 should be blocked."
- **Format**: Each section heading and table structure must match exactly. No extra commentary between sections. The prose goes in the section body, not the table cells.
- **Confidence marking**: [Confirmed] (2+ sources), [Probable] (1 source), [Possible] (weak signal). Use ISO dates (YYYY-MM-DD). Times in UTC.
- **Compactness**: ≤1500 words. Dense sentences. No filler. One fact per sentence is ideal. OMIT a section if you have <2 data points for it.
- **OMIT empty sections**: If a section has no data, OMIT the ENTIRE section — do NOT write "No data", "No specific IOCs", "No related reporting", or any negative-content statement. The section simply should not appear.
- **NEVER speculate about future activity**: Anticipated Activity section may ONLY be written when tool data directly supports forward-looking claims (negotiation demands, posted future targets, exploit timelines). Without such data, OMIT section 9 entirely.
- **BANNED phrases**: "It is important to note", "It should be noted", "In conclusion", "As mentioned above", "Furthermore", "Additionally", "It is worth noting", "Not available", "No data available", "In summary", "No specific", "No related".
- **Business outcome line-of-sight**: Every key finding should trace to a business outcome (service outage, data loss, fraud, compliance, brand, PII exposure). The Executive Summary states which.
</ground_rules>

<data_quality_handling>
- **YES** = real tool data. Cite it with exact values.
- **NO** = tool not called or returned empty. OMIT the corresponding section.
- **NO — OMIT** in the availability checklist means: skip that section entirely, no generic advice.
- **Concrete data trumps success rate**: A single tool that returned a list of 27 CVEs, dozens of IOCs, or detailed actor intelligence is NOT "limited data" — write a thorough report about what it found. Only flag data as "limited" when even the successful tools returned sparse output.
- If check_ioc AND enrich_ioc_deep both say NO: write a brief verdict on what you DO have, note the gap.
- If ALL tools failed: write minimal report — headline + "Investigation inconclusive — all enrichment sources returned errors" + basic next steps.
- NEVER pad. Short sections are honest. A missing section is better than a fabricated one.
</data_quality_handling>

<action_card_json>
Append a single \`\`\`action-card code block at the END of the report. Strict JSON.

Schema (all fields required unless marked optional):
{
  "verdict": {
    "headline": "<one-line verdict matching the Executive Summary's central claim>",
    "confidence": "high" | "medium" | "low",
    "confidence_rationale": "<why this confidence>",
    "posture": "active" | "reconnaissance" | "post-exploit" | "informational" | "unknown",
    "tlp": "CLEAR" | "GREEN" | "AMBER" | "RED"
  },
  "severity": "critical" | "high" | "medium" | "low" | "info",
  "actions": [
    {
      "severity": "critical" | "high" | "medium" | "low" | "info",
      "action": "<imperative sentence>",
      "target": "<optional IOC/CVE/actor>",
      "source": "<optional tool_name>",
      "category": "contain" | "eradicate" | "recover" | "detect" | "hunt" | "inform",
      "stakeholders": ["cti"|"soc"|"ir"|"vuln"|"redteam"|"appsec"|"awareness"|"exec"|"legal"|"tprm"]
    }
  ],
  "mitre": [
    { "id": "T1059.001", "name": "PowerShell", "tactic": "Execution", "evidence": "<brief>", "detection": "yara"|"sigma"|"kql"|"splunk"|"none" }
  ],
  "iocs": [
    { "type": "ipv4"|"ipv6"|"domain"|"url"|"hash"|"email"|"cve"|"actor"|"malware", "value": "<v>", "confidence": "Confirmed"|"Probable"|"Possible", "source": "<tool>" }
  ],
  "kev": true|false,
  "kev_date": "YYYY-MM-DD"|null,
  "cvss": { "score": <number 0-10>|null, "vector": "CVSS:3.1/AV:..."|null, "severity": "LOW"|"MEDIUM"|"HIGH"|"CRITICAL"|null },
  "epss": { "score": <number 0-1>|null, "percentile": <number 0-1>|null },
  "ransomware_use": "Known"|"Suspected"|null,
  "threat_actors": ["<actor-name>"],
  "exploit_status": "poc-public"|"weaponized"|"in-the-wild"|null,
  "patch_url": "<url>"|null,
  "ransomware": true|false,
  "attributed": true|false,
  "timeline": [ { "date": "YYYY-MM-DD"|null, "event": "<brief>", "source": "<tool>" } ],
  "navigatorLayer": {
    "name": "<short>",
    "description": "<1-line>",
    "techniques": [ { "id": "T1059.001", "score": 50, "comment": "<brief>" } ]
  },
  "diamond": {
    "adversary": "<actor or unknown>",
    "capability": ["<malware>","<technique>"],
    "infrastructure": ["<ip>","<domain>","<asn>"],
    "victim": "<sector or org>"
  },
  "pirs": [
    { "pir": "<short question>", "relevant": true|false, "bluf": "<1-sentence>", "businessOutcome": "<one of: Prevent service outage | Reduce data loss | Reduce fraud loss | Avoid regulatory penalty | Protect customer PII | Reduce incident MTTR | Mitigate supply chain risk>" }
  ]
}

Rules:
- actions: ≤8, ordered CRITICAL first. Each action's stakeholders must be non-empty.
- mitre: only techniques actually named in tool data, dedup by id.
- iocs: ≤20, dedup by value. type must match value format.
- timeline: only for actor / ransomware queries, ordered ascending.
- diamond: include only when ≥2 vertices have data. Otherwise OMIT the field.
- pirs: 3-7 entries. Mark the ones the investigation actually touched as relevant:true.
- navigatorLayer: techniques = same as mitre, score 0-100 based on directness of evidence (50 = mentioned, 80 = directly observed).
- VALIDATION: posture=active or post-exploit → severity MUST be critical or high. posture=reconnaissance → severity high or medium. posture=informational → severity medium, low, or info. posture=unknown → severity info or low.
- kev=true ONLY if CISA KEV was confirmed by a tool (do not guess).
- kev_date is the YYYY-MM-DD KEV listing date — include if known.
- cvss.score is 0-10 with one decimal. cvss.vector is the full CVSS:3.1 vector.
- epss.score is 0-1 (e.g. 0.42 = 42% probability of exploitation in next 30 days).
- ransomware_use is "Known" if any tool confirmed ransomware use, "Suspected" if only weakly indicated, null otherwise.
- threat_actors is a list of attribution strings (empty array if no attribution).
- exploit_status: "poc-public" = exploit code on GitHub/ExploitDB, "weaponized" = in malware frameworks, "in-the-wild" = active exploitation observed.
- patch_url: vendor advisory URL if a patch is available, null otherwise.
- If any tool surfaced CISA KEV, kev=true.
- For ransomware group queries, ransomware=true.
- For named-actor attributions, attributed=true.
</action_card_json>

<security>${UNTRUSTED_DATA_SYSTEM_NOTE}</security>`;
}

export function buildSynthesizerUserPrompt(query: string, queryType: string, steps: AgentStep[]): string {
  // Keep at most 5 most-recent steps with meaningful data to stay within 8K token
  // context windows. Earlier steps are summarized into the observation text.
  const limitedSteps = steps.length > 5 ? steps.slice(-5) : steps;
  const stepBlocks = limitedSteps
    .map((s) => {
      const toolBlocks = s.results
        .map((r) => {
          // Tool data — use compact JSON, truncated aggressively to keep total prompt
          // under 8K tokens. Each tool gets at most 800 chars of compact JSON.
          const raw = r.status === 'ok' ? JSON.stringify(r.data).slice(0, 2500) : `ERROR: ${r.error}`;
          return `<tool name="${r.tool}" status="${r.status}">\n${neutralizeUntrusted(raw)}\n</tool>`;
        })
        .join('\n');
      return `<step number="${s.stepNumber}" plan="${neutralizeAttr(s.plan)}" observation="${neutralizeAttr(s.observation ?? '')}">\n${toolBlocks}\n</step>`;
    })
    .join('\n\n');

  // Build a data availability checklist — only for tools that were ACTUALLY
  // called. Uncalled tools are NOT listed so the LLM doesn't confuse "not
  // called" with "failed". Each entry shows the actual tool name and result.
  const allTools = steps.flatMap((s) => s.results);
  const okTools = allTools.filter((r) => r.status === 'ok');
  const errTools = allTools.filter((r) => r.status === 'error');
  const calledToolNames = new Set(allTools.map((r) => r.tool));
  const hasData = (tool: string) => okTools.some((r) => r.tool === tool && r.data);

  // Only list tools the agent actually called. NO — not called, NO (empty) —
  // called but returned nothing, ERROR — called and failed.
  const toolStatus = (name: string): string => {
    if (!calledToolNames.has(name)) return ''; // not called, don't list
    if (errTools.some((r) => r.tool === name)) return 'ERROR';
    if (!hasData(name)) return 'OK (empty result)';
    return 'OK (has data)';
  };

  const availability: string[] = [];
  const omitTools: string[] = [];
  for (const name of [...calledToolNames].sort()) {
    const status = toolStatus(name);
    if (status === '') continue;
    const line = `${name}: ${status}`;
    availability.push(line);
    if (status === 'ERROR') omitTools.push(name);
  }

  const totalResults = allTools.length;
  const successRate = totalResults > 0 ? Math.round((okTools.length / totalResults) * 100) : 0;
  const uniqueCalled = [...new Set(allTools.map((r) => r.tool))];

  // Guidance for tools that were OMITTED from the availability list (not called).
  const omitGuidance = [
    { pattern: 'check_ioc', section: 'IOC reputation' },
    { pattern: 'enrich_ioc_deep', section: 'IOC reputation' },
    { pattern: 'enrich_actor', section: 'actor profile' },
    { pattern: 'lookup_cve', section: 'CVE analysis' },
    { pattern: 'generate_yara_rule', section: 'detection content' },
    { pattern: 'get_relationships', section: 'relationship graph' },
    { pattern: 'get_ioc_lifecycle', section: 'IOC lifecycle' },
  ];
  const omittedSections = omitGuidance.filter((g) => !calledToolNames.has(g.pattern)).map((g) => g.section);
  const omitNote =
    omittedSections.length > 0
      ? `\n\nThe following sections were NOT investigated (tools not called): ${[...new Set(omittedSections)].join(', ')}. Omit these sections from the report entirely.`
      : '';

  return `<investigation>
Query: ${neutralizeUntrusted(query)}
Type: ${queryType}
Steps: ${steps.length}
Tool results: ${okTools.length} ok, ${errTools.length} error (${successRate}% success rate of called tools)
Tools called: ${uniqueCalled.join(', ') || 'none'}
</investigation>

<quality_summary>
${
  errTools.length === 0 && okTools.length >= 3
    ? 'GOOD quality data — all called tools returned data. Write a thorough report.'
    : okTools.length > 0 && errTools.length < okTools.length
      ? `MIXED quality — ${okTools.length} tool(s) returned data, ${errTools.length} failed. Report what the successful tools found and note gaps where tools errored.`
      : `LOW quality — most or all called tools failed. The report will be brief. Do not invent data.`
}
Key data sources: ${[...new Set(okTools.map((r) => r.tool))].slice(0, 8).join(', ') || 'none'}
${omitTools.length > 0 ? `Failed tools: ${[...new Set(omitTools)].join(', ')}` : ''}
</quality_summary>

<data_availability>
${availability.length > 0 ? availability.join('\n') : 'No tools were called during this investigation.'}
${omitNote}
</data_availability>

CRITICAL RULES:
- "OK (has data)" = tool returned actual results. You MUST cite its data in the appropriate section — do not omit facts the tools provided.
- "OK (empty result)" = tool ran but found nothing. Do NOT cite findings from it. Mention it only in Methodology as a gap.
- "ERROR" = tool failed. Do NOT cite findings from it. Note the failure in Methodology.
- Tools NOT listed were never called. Do NOT mention them at all — do not say "not called" or "not available".
- INCORPORATE EVERY FACT: For each "OK (has data)" tool result, extract the specific values (actor names, aliases, CVE IDs, CVSS scores, IP addresses, domains, hashes, MITRE technique IDs, dates, sector targets) and place them in the correct report section. Do NOT summarize away specifics — exact values matter for downstream detection engineering.
- If most tools returned OK (has data), write a thorough report about what they found.
- If most tools returned ERROR or empty, write only what you have — brief is honest.

<investigation_data>
${stepBlocks}
</investigation_data>

Write the report. Start with the \`\`\`report-header JSON block (section 0). Follow with the prose sections (1-12), OMITTING any section or subsection with insufficient data. End with the :::handoff block and the \`\`\`action-card JSON block. No commentary before or after. No "Here is the report" / "I have generated" — just the output.`;
}
