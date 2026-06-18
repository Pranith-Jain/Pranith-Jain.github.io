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
  return `<role>CTI analyst observer. After each tool call, extract actionable intelligence.</role>
<task>Analyze tool results and extract: IOCs (with context), actor attributions, CVE IDs with scores, MITRE techniques, malware families, campaign indicators, infrastructure details. Be specific — include exact values, scores, dates.</task>
<output_format>{"observation":"summary","keyFacts":["specific fact with value"],"gaps":["what's still needed"]}</output_format>`;
}

/**
 * Final synthesizer prompt.
 *
 * Produces TWO things in one LLM call:
 *   1. A stakeholder-aware prose report (markdown) — one report, seven
 *      sub-sections so CTI, SOC, IR, Vuln Mgmt, Red Team, Awareness
 *      and Exec each get what they need.
 *   2. A \`\`\`action-card JSON code block at the END with a structured
 *      verdict, action checklist (stakeholder-tagged), MITRE Navigator
 *      layer, IOC table, Diamond Model, and PIR links. The UI parses
 *      this to render the severity banner, follow-up buttons, and
 *      export the Navigator layer.
 *
 * Report structure (Feedly "beyond queries" pattern):
 *   0. STRUCTURED HEADER (\`\`\`report-header)  — machine-readable BLUF for the UI
 *   1. HEADLINE VERDICT  — one line, severity + plain English
 *   2. EXECUTIVE SUMMARY — 2-3 sentences, business impact
 *   ── Technical body (collapsible in the UI) ──
 *   3. KEY FINDINGS
 *   4. THREAT CONTEXT     (query-type specific)
 *   5. INDICATORS         (table)
 *   6. DETECTION          (YARA / Sigma / KQL / Splunk)
 *   7. CONTAINMENT & RESPONSE
 *   8. STAKEHOLDER NOTES  (one sub-block per team)
 *   9. RECOMMENDED NEXT ACTIONS
 *   10. SOURCES
 *   ── Appendices ──
 *     - STIX 2.1 bundle (json block, type: "bundle")
 *     - :::handoff (yaml-ish, next workflow stages)
 *     - action-card JSON
 */
export function buildSynthesizerPrompt(query: string, queryType: string): string {
  const isActor = queryType === 'actor' || queryType === 'ransomware';
  const isCve = queryType === 'cve';
  const isIoc = ['ip', 'domain', 'hash', 'url'].includes(queryType);
  const isHash = queryType === 'hash';
  const isIp = queryType === 'ip';

  return `<role>You are a senior CTI analyst at a SOC, writing a single report that seven different teams will read in under five minutes: CTI (enrichment + pivots), SOC & detection engineering (IOCs + rules), incident response (containment), vulnerability management (patching), red team / purple team (adversary emulation), security awareness (user-facing trends), and exec / CISO (business risk).</role>

<query>${neutralizeUntrusted(query)}</query>
<query_type>${queryType}</query_type>

<task>
Write the report below. Use ONLY the investigation data. If a section has no data, OMIT it entirely — never write "Not available". Numbers, identifiers, and dates must come from tool data, never be invented.

Each section below is a CONTRACT — produce exactly that heading, exactly that verb, exactly that length. The format is for a SOC dashboard, not a research paper.

## 0. STRUCTURED HEADER
The FIRST block in the report MUST be a fenced \`\`\`report-header code block. The UI parses this for the dashboard BLUF panel — never paraphrase. Strict JSON:

\`\`\`report-header
{
  "headline": "<one-line matching section 1>",
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

## 1. HEADLINE VERDICT
One line. Open with severity in caps: CRITICAL / HIGH / MEDIUM / LOW / INFO. State what this is, who is involved, and what to do. ≤25 words. Example: "CRITICAL — Active C2 infrastructure on 1.2.3.4; block at perimeter and hunt for beaconing in 24h proxy logs."

## 2. EXECUTIVE SUMMARY
≤80 words. 2-3 sentences. Lead with the single most important finding. End with one sentence linking the threat to business impact (service outage / data loss / fraud / compliance / brand). Use plain English, active voice. NO bullet lists, NO sub-headings — one tight paragraph.

## 3. KEY FINDINGS
5-8 bullets. ≤25 words per bullet. Each bullet MUST:
- Open with a severity tag: [CRITICAL] / [HIGH] / [MEDIUM] / [LOW] / [INFO]
- State one specific fact with exact values from tool data (CVSS, EPSS, KEV, scores, dates, hash)
- End with source citation: [Source: tool_name]
- End with confidence: [Confirmed] / [Probable] / [Possible]
- BANNED: filler words ("notably", "it is worth noting", "furthermore"), hedging ("may potentially"), or restating the question.

## 4. THREAT CONTEXT
${
  isActor
    ? `Sub-sections in this order. Skip any with no data.
- Actor: name, aliases, country, motivation, first-seen (from enrich_actor)
- TTPs: compact table — Technique (Txxxx) | Name | Tactic | Evidence
- Infrastructure: domains, IPs, hosts with source attribution
- Recent activity: campaigns + victims in last 90 days (from actor_timeline / get_ransomware_activity)
- Victimology: sectors + geographies (from tool data only)
- Negotiations: ransom demands, discounts, settlement patterns (from get_ransomware_negotiations, if any)`
    : ''
}
${
  isCve
    ? `Sub-sections in this order. Skip any with no data.
- Vulnerability: CVSS v3 score + vector, CWE, affected products (exact)
- EPSS: probability + percentile (only if present in lookup_cve)
- KEV: listed date + ransomware use (only if kev=true in lookup_cve)
- Exploitation: in-the-wild / PoC / exploit-db status with source
- Threat actors: attributed groups (only if enrich_actor named any)
- Patches: vendor advisory URL + fixed versions`
    : ''
}
${
  isIoc
    ? `Sub-sections in this order. Skip any with no data.
- Reputation: composite verdict + per-provider table (only providers that returned results, with verdict + score + tag highlights). For tre.ge, include reputation verdict/score + ASN/country.
- Deep enrichment: enrich_ioc_deep unified verdict + source_count + top contributing sources (if present)
- Infrastructure: WHOIS / RDAP / DNS / ASN / CT / BuiltWith findings (only if returned)
- Relationships: actors / malware / campaigns (only if get_relationships returned)
- Lifecycle: first/last seen, observation count (only if get_ioc_lifecycle returned)
- Breach exposure: source, breach name, date, pwn count, data classes (only if breach_check found=true)
- Maltiverse: only if maltiverse_verify returned data
- Co-hosted domains: count + up to 5 examples (from lookup_reverse_dns, IP only)`
    : ''
}
${
  isHash
    ? `Sub-sections in this order. Skip any with no data.
- Sample: family, type, first/last seen, signature (from malwarebazaar / sandbox)
- Triage analysis: tags, MITRE, C2, configs (from search_triage)
- Detection: YARA / Sigma / KQL generated (full content)`
    : ''
}
${
  isIp && !isIoc
    ? `Sub-sections. Skip any with no data.
- ASN: number, name, country, abuse contact (from lookup_asn)
- Co-hosted domains: count + up to 5 examples (from lookup_reverse_dns)
- Geo: city, country, ASN org (from lookup_ipinfo)`
    : ''
}

## 5. INDICATORS
A markdown table, ≤20 rows. Columns: Type | Value | Confidence | Source
Only IOCs actually returned by tool data. Skip the table entirely if no IOCs.

## 6. DETECTION
- Full content of any YARA / Sigma / KQL / Splunk rule the agent generated
- If no rules generated, OMIT this section

## 7. CONTAINMENT & RESPONSE
Action checklist, ordered CRITICAL → HIGH → MEDIUM → LOW → INFO. ≤8 lines. Each line:
- [SEVERITY] <imperative sentence> — [Source: tool_name, Stakeholders: SOC,IR]
- Stakeholder tag uses commas: CTI / SOC / IR / VMGT / RED / APPSEC / AWARE / EXEC / LEGAL / TPRM
- If you have no data-backed actions, write 1-2 generic best-practices lines.

## 8. STAKEHOLDER NOTES
One sub-block per team, ONLY for teams with data-backed actions. Each sub-block:
### For CTI
- 2-4 bullets: pivot suggestions, related campaigns, IOC enrichment
### For SOC & Detection Engineering
- 2-4 bullets: IOCs to ingest, Sigma/EDR rules to tune, MITRE TTPs to monitor, log sources
### For Incident Response
- 2-4 bullets: containment steps, forensic evidence to collect, isolation priorities
### For Vulnerability Management
- 2-4 bullets: CVEs to patch, exploit status, compensating controls, asset classes
### For Red Team / Purple Team
- 2-4 bullets: TTPs to emulate, ATT&CK scenarios, detection/response tests
### For Security Awareness
- 2-4 bullets: user-facing trends, training topics, risky behaviors to highlight
### For Executive Leadership
- 2-4 bullets: strategic risk, business impact, resource/policy recommendations

Skip sub-blocks with no data-backed actions.

## 9. RECOMMENDED NEXT ACTIONS
Hunt / pivot suggestions — what queries to run, where to look next.
- 1-2 KQL / Splunk / Sigma snippets ONLY if relevant. Wrap each in \`\`\`kql / \`\`\`splunk / \`\`\`sigma code block. Add a one-line "use case" above each.
- Pivot suggestions: "Search OTX pulses for <actor>", "Check Shodan for <asn>", etc.
- For CVE: link to NVD + CISA KEV JSON + vendor advisory
- For hash: link to MalwareBazaar + Hybrid Analysis + VirusTotal

## 10. SOURCES
Numbered, one per line. Only tools that returned usable data.
[1] tool_name — what it provided

## HANDOFF BLOCK
Append a single \`:::handoff\` block listing the next workflow stages the analyst should run. The block is plain markdown, not JSON. Example:

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
- ONLY write about data that EXISTS in the tool results.
- NEVER invent CVE IDs, CVSS scores, EPSS values, actor names, technique IDs, hashes, IPs, dates.
- DO NOT cite tools that returned 0 results or errored as sources.
- DO NOT repeat the same fact in multiple sections.
- BANNED: "It is important to note", "It should be noted", "In conclusion", "As mentioned above", "Furthermore", "Additionally", "It is worth noting".
- BANNED: "Not available from investigation data", "No data available" — OMIT the section.
- Use ISO dates (YYYY-MM-DD). Times in UTC.
- Confidence: [Confirmed] (2+ sources), [Probable] (1 source), [Possible] (weak signal).
- Active voice, present tense. "Block 1.2.3.4" not "1.2.3.4 should be blocked".
- Maximum 1500 words for the prose. Be dense.
</ground_rules>

<action_card_json>
Append a single \`\`\`action-card code block at the END of the report. Strict JSON.

Schema (all fields required unless marked optional):
{
  "verdict": {
    "headline": "<one-line matching section 1>",
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
    { "pir": "<short question>", "relevant": true|false, "bluf": "<1-sentence>", "businessOutcome": "<e.g. Reduce fraud loss>" }
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
- If posture is "active" or "post-exploit", severity MUST be critical or high.
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
  const stepBlocks = steps
    .map((s) => {
      const toolBlocks = s.results
        .map((r) => {
          // Tool data (incl. fetched pages, provider JSON) is untrusted — neutralize
          // so it cannot forge a </tool>/<step> delimiter and break out of its block.
          const raw = r.status === 'ok' ? JSON.stringify(r.data, null, 2).slice(0, 2200) : `ERROR: ${r.error}`;
          return `<tool name="${r.tool}" status="${r.status}">\n${neutralizeUntrusted(raw)}\n</tool>`;
        })
        .join('\n');
      return `<step number="${s.stepNumber}" plan="${neutralizeAttr(s.plan)}" observation="${neutralizeAttr(s.observation ?? '')}">\n${toolBlocks}\n</step>`;
    })
    .join('\n\n');

  // Build a data availability checklist
  const allTools = steps.flatMap((s) => s.results);
  const okTools = allTools.filter((r) => r.status === 'ok');
  const errTools = allTools.filter((r) => r.status === 'error');
  const hasData = (tool: string) => okTools.some((r) => r.tool === tool && r.data);

  const availability = [
    `check_ioc / enrich_ioc_deep: ${hasData('check_ioc') || hasData('enrich_ioc_deep') ? 'YES' : 'NO'}`,
    `lookup_tre_ge: ${hasData('lookup_tre_ge') ? 'YES' : 'NO'}`,
    `breach_check: ${hasData('breach_check') ? 'YES' : 'NO'}`,
    `maltiverse_verify: ${hasData('maltiverse_verify') ? 'YES' : 'NO'}`,
    `lookup_domain: ${hasData('lookup_domain') ? 'YES' : 'NO'}`,
    `lookup_ipinfo: ${hasData('lookup_ipinfo') ? 'YES' : 'NO'}`,
    `lookup_asn: ${hasData('lookup_asn') ? 'YES' : 'NO'}`,
    `lookup_dns: ${hasData('lookup_dns') ? 'YES' : 'NO'}`,
    `lookup_reverse_dns: ${hasData('lookup_reverse_dns') ? 'YES' : 'NO'}`,
    `webamon_search / webamon_domain: ${hasData('webamon_search') || hasData('webamon_domain') ? 'YES' : 'NO'}`,
    `lookup_builtwith: ${hasData('lookup_builtwith') ? 'YES' : 'NO'}`,
    `lookup_cve: ${hasData('lookup_cve') ? 'YES' : 'NO — OMIT CVE sections'}`,
    `search_triage: ${hasData('search_triage') ? 'YES' : 'NO'}`,
    `enrich_actor: ${hasData('enrich_actor') ? 'YES' : 'NO — OMIT actor profile'}`,
    `actor_timeline: ${hasData('actor_timeline') ? 'YES' : 'NO'}`,
    `actor_cves: ${hasData('actor_cves') ? 'YES' : 'NO'}`,
    `search_malpedia: ${hasData('search_malpedia') ? 'YES' : 'NO'}`,
    `get_ransomware_negotiations: ${hasData('get_ransomware_negotiations') ? 'YES' : 'NO'}`,
    `get_ransomware_activity: ${hasData('get_ransomware_activity') ? 'YES' : 'NO'}`,
    `generate_yara_rule: ${hasData('generate_yara_rule') ? 'YES' : 'NO — OMIT detection section'}`,
    `generate_hunting_queries: ${hasData('generate_hunting_queries') ? 'YES' : 'NO'}`,
    `unified_search: ${hasData('unified_search') ? 'YES' : 'NO'}`,
    `get_relationships: ${hasData('get_relationships') ? 'YES' : 'NO — OMIT relationships'}`,
    `get_ioc_lifecycle: ${hasData('get_ioc_lifecycle') ? 'YES' : 'NO — OMIT lifecycle'}`,
    `lookup_certificate_transparency: ${hasData('lookup_certificate_transparency') ? 'YES' : 'NO'}`,
    `lookup_wayback_advanced: ${hasData('lookup_wayback_advanced') ? 'YES' : 'NO'}`,
    `urlscan_ip_search: ${hasData('urlscan_ip_search') ? 'YES' : 'NO'}`,
    `lookup_ip_geo: ${hasData('lookup_ip_geo') ? 'YES' : 'NO'}`,
    `trace_crypto_address: ${hasData('trace_crypto_address') ? 'YES' : 'NO'}`,
    `lookup_cisa_kev: ${hasData('lookup_cisa_kev') ? 'YES' : 'NO'}`,
  ];

  return `<investigation>
Query: ${neutralizeUntrusted(query)}
Type: ${queryType}
Steps: ${steps.length}
Tool results: ${okTools.length} ok, ${errTools.length} failed
Tools called: ${[...new Set(allTools.map((r) => r.tool))].join(', ')}
</investigation>

<data_availability>
${availability.join('\n')}
</data_availability>

RULE: If data_availability says "NO — OMIT", then SKIP that section entirely. Do NOT write "Not available".

<investigation_data>
${stepBlocks}
</investigation_data>

Write the report following the section contract. Append the :::handoff block and the \`\`\`action-card JSON block at the end. No commentary outside the report.`;
}
