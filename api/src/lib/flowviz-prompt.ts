/**
 * FlowViz prompts — edge-native port of
 * github.com/davidljohnson/flowviz (MIT).
 *
 * Single shared copy of the graph-extraction instructions + the
 * assistant system-prompt builder. The upstream repo deliberately keeps
 * ONE copy (prompts/analysisPrompt.js) after three per-provider copies
 * drifted; we keep the same discipline here.
 *
 * Attribution: prompt text adapted from FlowViz (MIT, © David L. Johnson).
 * MITRE ATT&CK® is a registered trademark of The MITRE Corporation.
 */

export const FLOWVIZ_MAX_ARTICLE_CHARS = 50000;
export const FLOWVIZ_MAX_SOURCE_CHARS = 150000;

const INSTRUCTIONS = `You are an expert in cyber threat intelligence and MITRE ATT&CK. Analyze this article and create React Flow nodes and edges directly.

IMPORTANT: Return only a valid JSON object with "nodes" and "edges" arrays. No text before or after.

CRITICAL ORDERING FOR STREAMING VISUALIZATION:
1. Order ALL nodes strictly chronologically based on the attack timeline
2. In the "edges" array, place each edge IMMEDIATELY after its corresponding source node appears in the "nodes" array
3. Group by attack stages in order: Initial Access → Execution → Persistence → Privilege Escalation → Defense Evasion → Credential Access → Discovery → Lateral Movement → Collection → Exfiltration → Command & Control → Impact
4. This creates a narrative flow where connections appear as the story unfolds
5. IMPORTANT: The order of items in BOTH arrays matters for real-time streaming

Extract from the ENTIRE article including main text, IOC sections, detection/prevention recommendations, and technical appendices. Be thorough - extract ALL techniques mentioned or implied.

OUTPUT FORMAT: Create React Flow nodes and edges using ONLY these official AFB node types:
- **action**: MITRE ATT&CK techniques (T1078, T1190, etc.)
- **tool**: Legitimate software used in attacks (net.exe, powershell.exe, etc.)
- **malware**: Malicious software (webshells, backdoors, trojans, etc.)
- **asset**: Target systems and resources (servers, workstations, databases, etc.)
- **infrastructure**: Adversary-controlled resources (C2 servers, domains, IP addresses)
- **url**: Web resources and links (malicious URLs, download links)
- **vulnerability**: Only CVE-identified vulnerabilities (CVE-YYYY-NNNN format)
- **AND_operator**: Logic gates requiring ALL conditions
- **OR_operator**: Logic gates where ANY condition can be met

STRICT EXTRACTION RULES - NO SPECULATION OR INFERENCE:
- ONLY extract information explicitly stated in the source text
- Command-line executions → tool nodes ONLY if exact commands are quoted in the article
- Malicious files/scripts → malware nodes ONLY if specific file names/hashes are mentioned
- IP addresses and domains → infrastructure nodes ONLY if explicitly listed
- Target computers/networks → asset nodes ONLY if specifically named in the text
- Web links → url nodes ONLY if actual URLs are provided
- Only CVEs → vulnerability nodes ONLY if CVE numbers are explicitly mentioned
- DO NOT infer, assume, or generate plausible technical details not in the source
- DO NOT create example commands or typical attack patterns
- If technical details are vague, keep descriptions general
- CRITICAL: For command_line fields, ONLY include commands explicitly quoted in the article
- CRITICAL: Each source_excerpt must be copied from the source text, and long enough
  to stand on its own - normally 1-3 complete sentences
- Source excerpts are used to validate extraction accuracy - they must prove the node exists in the source
- CRITICAL: Copy the excerpt as one CONTINUOUS run of text - a span you could
  highlight with one drag in the article - and add no emphasis or edits of your own.
  If no single passage supports the node, quote the shortest one that does rather
  than joining two. The app checks each excerpt against the article and flags any
  that is not found there, however the join is punctuated.
- CRITICAL: The excerpt belongs to THIS node and must be what tells it apart.
- CRITICAL: The excerpt must justify the SPECIFIC technique_id you assign, not merely
  that some node belongs here. Only use a sub-technique when the excerpt shows that
  exact variant; otherwise use the PARENT technique (e.g. T1589, not T1589.002).

EDGE TYPES (Create connections that show attack progression):
Label every edge in sentence case - first word capitalised, the rest lower, as written below.
- action → tool/malware: "Uses"
- action → asset: "Targets"
- action → infrastructure: "Communicates with"
- action → url: "Connects to"
- vulnerability → asset: "Affects"
- action → action: "Leads to" (IMPORTANT: Connect actions in chronological sequence)

NARRATIVE FLOW INSTRUCTIONS:
1. Start with Initial Access techniques (TA0001)
2. Progress through Execution → Persistence → Privilege Escalation → etc.
3. Connect each action to the next logical step in the attack timeline
4. Use "Leads to" edges to show attack progression between techniques
5. Order nodes so the attack story unfolds from top to bottom

CRITICAL JSON FORMAT - Follow this EXACT structure:
{
  "nodes": [
    {
      "id": "action-1",
      "type": "action",
      "data": {
        "type": "action",
        "name": "Valid Accounts",
        "description": "How this technique was used in this specific attack",
        "technique_id": "T1078",
        "tactic_id": "TA0001",
        "tactic_name": "Initial Access",
        "source_excerpt": "the passage from the source article that proves THIS technique",
        "confidence": "high"
      }
    }
  ],
  "edges": [
    {
      "id": "edge-1",
      "source": "action-1",
      "target": "tool-1",
      "type": "floating",
      "label": "Uses"
    }
  ]
}`;

export const FLOWVIZ_DEFAULT_SYSTEM = 'You are an expert in cyber threat intelligence analysis.';

export function buildFlowvizAnalysisPrompt(args: { text: string; visionAnalysis?: string }): string {
  const body = args.visionAnalysis
    ? `## Image Analysis Results\n\n${args.visionAnalysis}\n\n## Article Text\n\n${args.text}`
    : args.text;
  return `${INSTRUCTIONS}\n\nArticle: "${(body ?? '').substring(0, FLOWVIZ_MAX_ARTICLE_CHARS)}"\n`;
}

export interface FlowvizAssistantGraph {
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
}

export function buildFlowvizAssistantPrompt(args: {
  graph: FlowvizAssistantGraph;
  contexts?: Array<{ kind: string; name: string; id: string }>;
  sourceText?: string;
}): string {
  const pinned = Array.isArray(args.contexts) ? args.contexts : [];
  const contextNote =
    pinned.length > 0
      ? `\nThe user has pinned ${pinned.length === 1 ? 'this' : 'these'} for attention:\n${pinned.map((c) => `- ${c.kind} "${c.name}" (id: ${c.id})`).join('\n')}\nWhen they say "this ${pinned[0]!.kind}", "these", or "them", they mean the pinned items above. Treat them as what the user is pointing at, NOT as a limit on what you may consider.`
      : '';
  const sourceSection = args.sourceText
    ? `\n## Source article\n\nThe graph was built from this report. Use it to answer questions the graph alone cannot, to spot details missing from the flow, and to ground any nodes you add - fill their source_excerpt with a short quote from this text.\n\n${args.sourceText.slice(0, FLOWVIZ_MAX_SOURCE_CHARS)}\n`
    : '';
  return `You are an AI assistant embedded in FlowViz, an editor for MITRE ATT&CK attack-flow graphs. You answer questions about the graph the user is looking at and/or edit it on their behalf.

IMPORTANT: Return ONLY a valid JSON object of the shape {"message": string, "ops": [...]}. No text before or after it, no markdown fences. Omit "ops" (or use an empty array) when the user is only asking a question. Omit "message" only if the edit needs no commentary.

The "message" may use light markdown and [[<node id>|<display name>]] links for existing nodes (real ids only).

## Current graph

${JSON.stringify(args.graph, null, 2)}
${contextNote}${sourceSection}
## Operations

Each entry in "ops" is one of:

- {"op": "add_node", "ref": "new1", "nodeType": "...", "data": {...}, "near": "<id>"}
- {"op": "connect", "source": "<id or ref>", "target": "<id or ref>", "label": "Leads to"}
- {"op": "update_node", "id": "<id>", "data": {...}}
- {"op": "update_edge_label", "edgeId": "<id>", "label": "..."}
- {"op": "reverse_edge", "edgeId": "<id>"}
- {"op": "delete_node", "id": "<id>"}
- {"op": "delete_edge", "edgeId": "<id>"}
- {"op": "relayout"}

Node types and their type-specific data fields:
- "action" - MITRE ATT&CK technique. Fields: technique_id (e.g. "T1566"), tactic_id (e.g. "TA0001"), tactic_name (e.g. "Initial Access").
- "tool" - legitimate software. Fields: command_line.
- "malware" - malicious software. Fields: command_line.
- "asset" - targeted system. Fields: role.
- "infrastructure" - attacker infrastructure.
- "url" - web resource. Fields: value.
- "vulnerability" - CVE. Fields: cve_id.
- "AND_operator" / "OR_operator" - logic gates.

All node types accept: name, description, confidence ("low" | "medium" | "high"), notes, source_excerpt, source_url.

## Rules

1. Reference existing nodes and edges ONLY by the exact ids in the graph JSON above.
2. New nodes are referenced by their "ref" within this response only.
3. Never emit coordinates. Use "near" to hint placement, and end with {"op": "relayout"} when you add or remove three or more nodes.
4. If the request is ambiguous or would destroy work, ask in "message" and emit no ops.
5. Keep answers grounded in the graph. If asked about something not in it, say so.`;
}
