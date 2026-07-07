/**
 * AI Agent Attack-Surface Mapper.
 *
 * Takes an MCP / Claude Code config and produces a typed graph plus a list
 * of high-risk paths. The risk model is the OWASP-LLM "exfil chain":
 *
 *   ingest (untrusted content reaches the model)
 *      -> sensitive read (secrets / files / env)
 *      -> egress (network / write to attacker-controlled path)
 *
 * Or the simpler "RCE chain":
 *
 *   ingest -> execute (bash / eval / unrestricted command)
 *
 * Capability classification is heuristic — it relies on tool names,
 * descriptions, and Claude Code permission rules, not full semantic
 * analysis. False positives are preferable to false negatives.
 */

import type { McpServerEntry } from './mcp-audit';

export type Capability = 'ingest' | 'read-sensitive' | 'write' | 'execute' | 'egress';

export interface ToolNode {
  id: string;
  /** Human label shown in the graph. */
  label: string;
  /** Owning MCP server / "claude-code" / "(builtin)". */
  origin: string;
  capabilities: Capability[];
  /** Verbatim description / rule, for tooltips. */
  detail: string;
}

export interface RiskPath {
  id: string;
  kind: 'exfil-chain' | 'rce-chain' | 'over-privilege';
  severity: 'critical' | 'high' | 'medium';
  title: string;
  detail: string;
  /** Tool nodes that participate in the path. */
  nodes: string[];
  remediation: string;
}

export interface GraphResult {
  tools: ToolNode[];
  risks: RiskPath[];
  /** Aggregate count of capabilities across all tools — for the legend. */
  capCounts: Record<Capability, number>;
}

// ─────────────────────────────────────────────────────────────────────────
// Capability classification
// ─────────────────────────────────────────────────────────────────────────

const INGEST_PAT = /(fetch|web_?search|browse|read_url|http|crawl|scrape|search|googl|user_input|prompt)/i;
const SENSITIVE_PAT = /(secret|env|credential|password|token|key|ssh|aws|gcp|vault|keychain|kms|\.ssh|\.aws|\/etc)/i;
const WRITE_PAT = /(write|create|save|put_|upload|edit|patch|modify|delete|remove|rm)/i;
const EXECUTE_PAT = /(exec|run_?(?:command|shell|bash)|shell|eval|spawn|invoke|bash|sh\b|powershell|cmd|process)/i;
const EGRESS_PAT = /(fetch|post|put|http|curl|wget|webhook|outbound|send|email|sms|slack|discord)/i;

function classify(name: string, description: string): Capability[] {
  const haystack = `${name} ${description}`.toLowerCase();
  const caps = new Set<Capability>();
  if (INGEST_PAT.test(haystack)) caps.add('ingest');
  if (SENSITIVE_PAT.test(haystack)) caps.add('read-sensitive');
  if (WRITE_PAT.test(haystack)) caps.add('write');
  if (EXECUTE_PAT.test(haystack)) caps.add('execute');
  if (EGRESS_PAT.test(haystack)) caps.add('egress');
  return [...caps];
}

// ─────────────────────────────────────────────────────────────────────────
// Build graph from various config shapes
// ─────────────────────────────────────────────────────────────────────────

interface RawConfig {
  mcpServers?: Record<string, McpServerEntry>;
  servers?: Record<string, McpServerEntry>;
  permissions?: { allow?: string[]; deny?: string[]; ask?: string[] };
  tools?: Array<{ name?: string; description?: string }>;
}

function pushTool(out: ToolNode[], node: ToolNode): void {
  out.push(node);
}

function fromMcpServer(name: string, server: McpServerEntry, out: ToolNode[]): void {
  const tools = server.tools ?? [];
  if (tools.length === 0) {
    // Server with no declared tools — still represent as a node.
    pushTool(out, {
      id: `mcp:${name}`,
      label: name,
      origin: 'mcp',
      capabilities: classify(name, ''),
      detail: server.url ? `Remote MCP at ${server.url}` : `Stdio MCP — ${server.command ?? ''}`.trim(),
    });
    return;
  }
  tools.forEach((t, i) => {
    const id = `mcp:${name}:${t.name ?? i}`;
    pushTool(out, {
      id,
      label: t.name ?? `tool[${i}]`,
      origin: name,
      capabilities: classify(t.name ?? '', t.description ?? ''),
      detail: (t.description ?? '').slice(0, 220),
    });
  });
}

function fromClaudeCodePermission(rule: string, out: ToolNode[]): void {
  // Bash(git status) → name "Bash", target "git status"
  // WebFetch(domain:github.com) → name "WebFetch", target "domain:github.com"
  const m = rule.match(/^([A-Za-z]+)\(([^)]*)\)$/);
  const name = m?.[1] ?? rule;
  const target = m?.[2] ?? '';

  const lower = name.toLowerCase();
  const caps = new Set<Capability>();
  if (lower === 'bash' || lower === 'shell' || lower === 'exec') {
    caps.add('execute');
    if (target === '*' || /(curl|wget)/i.test(target)) caps.add('egress');
    if (/(rm|mv|cp|chmod)/i.test(target)) caps.add('write');
  } else if (lower === 'read') {
    caps.add('ingest');
    if (SENSITIVE_PAT.test(target)) caps.add('read-sensitive');
  } else if (lower === 'write' || lower === 'edit') {
    caps.add('write');
  } else if (lower === 'webfetch' || lower === 'webrequest') {
    caps.add('ingest');
    caps.add('egress');
  } else if (lower === 'websearch') {
    caps.add('ingest');
  }

  pushTool(out, {
    id: `cc:${rule}`,
    label: rule,
    origin: 'claude-code',
    capabilities: [...caps],
    detail: `Claude Code allow rule: ${rule}`,
  });
}

export function buildGraph(raw: unknown): GraphResult {
  const tools: ToolNode[] = [];
  if (raw && typeof raw === 'object') {
    const cfg = raw as RawConfig;

    const servers = cfg.mcpServers ?? cfg.servers;
    if (servers) {
      for (const [name, entry] of Object.entries(servers)) {
        if (entry && typeof entry === 'object') fromMcpServer(name, entry, tools);
      }
    }

    if (cfg.permissions?.allow) {
      for (const rule of cfg.permissions.allow) {
        if (typeof rule === 'string') fromClaudeCodePermission(rule, tools);
      }
    }

    // Top-level tools[] (used by some agent/PoC configs)
    if (cfg.tools && Array.isArray(cfg.tools)) {
      cfg.tools.forEach((t, i) => {
        pushTool(tools, {
          id: `top:${t.name ?? i}`,
          label: t.name ?? `tool[${i}]`,
          origin: 'agent',
          capabilities: classify(t.name ?? '', t.description ?? ''),
          detail: (t.description ?? '').slice(0, 220),
        });
      });
    }
  }

  const risks = findRisks(tools);

  const capCounts: Record<Capability, number> = {
    ingest: 0,
    'read-sensitive': 0,
    write: 0,
    execute: 0,
    egress: 0,
  };
  for (const t of tools) for (const c of t.capabilities) capCounts[c]++;

  return { tools, risks, capCounts };
}

// ─────────────────────────────────────────────────────────────────────────
// Risk-path detection
// ─────────────────────────────────────────────────────────────────────────

function has(t: ToolNode, c: Capability): boolean {
  return t.capabilities.includes(c);
}

function findRisks(tools: ToolNode[]): RiskPath[] {
  const out: RiskPath[] = [];

  const ingestNodes = tools.filter((t) => has(t, 'ingest'));
  const sensitiveNodes = tools.filter((t) => has(t, 'read-sensitive'));
  const egressNodes = tools.filter((t) => has(t, 'egress'));
  const executeNodes = tools.filter((t) => has(t, 'execute'));

  // Exfil chain — ingest → sensitive → egress (within the same agent context).
  if (ingestNodes.length && sensitiveNodes.length && egressNodes.length) {
    out.push({
      id: 'exfil-chain',
      kind: 'exfil-chain',
      severity: 'critical',
      title: 'Indirect-injection exfiltration chain',
      detail:
        'The agent has at least one ingest tool (which can be poisoned with attacker-authored content), at least one tool that reads sensitive data, and at least one tool with network egress. This is the textbook indirect-injection exfil shape.',
      nodes: [ingestNodes[0]!.id, sensitiveNodes[0]!.id, egressNodes[0]!.id].filter((v, i, a) => a.indexOf(v) === i),
      remediation:
        'Break the chain — sandbox ingest tools, remove sensitive-read scopes, or block egress from the agent runtime. Where possible, rewrite ingested content to strip embedded instructions before model sees it.',
    });
  }

  // RCE chain — ingest → execute.
  if (ingestNodes.length && executeNodes.length) {
    out.push({
      id: 'rce-chain',
      kind: 'rce-chain',
      severity: 'critical',
      title: 'Indirect-injection → execution',
      detail:
        'The agent both ingests external content and has shell / exec primitives. Indirect injection in the ingested content can pivot directly to arbitrary command execution on the host.',
      nodes: [ingestNodes[0]!.id, executeNodes[0]!.id].filter((v, i, a) => a.indexOf(v) === i),
      remediation:
        "Move execute primitives out of the agent's default tool set, or scope them to a vetted allow-list. Never combine open-ended bash with web/fetch tools in the same context.",
    });
  }

  // Over-privilege — broad-permission shells (Bash(*) etc.)
  for (const t of tools) {
    if (t.label === 'Bash(*)' || t.label === 'Bash' || t.label.match(/^Bash\(\*\)$/)) {
      out.push({
        id: `overpriv:${t.id}`,
        kind: 'over-privilege',
        severity: 'high',
        title: `Over-privileged tool: ${t.label}`,
        detail:
          'A blank-cheque shell rule auto-approves any command. Combined with any ingest path, this is silent RCE.',
        nodes: [t.id],
        remediation: 'Replace with task-specific Bash(<command>) allow rules. Move open-ended Bash to "ask".',
      });
    }
  }

  // High counts of sensitive without monitoring — info-only
  if (sensitiveNodes.length >= 2 && egressNodes.length === 0 && ingestNodes.length === 0) {
    out.push({
      id: 'sensitive-only',
      kind: 'over-privilege',
      severity: 'medium',
      title: 'Sensitive-read tools with no observed ingest/egress path',
      detail:
        'The agent can read sensitive material but no ingest or egress tools were classified. A future tool addition could turn this into an exfil chain — track these as latent risk.',
      nodes: sensitiveNodes.slice(0, 3).map((t) => t.id),
      remediation:
        'Confirm no other tools provide ingest. Periodically re-audit when new MCP servers or permission rules are added.',
    });
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// Layout — simple ring layout for SVG rendering
// ─────────────────────────────────────────────────────────────────────────

export interface NodePos {
  id: string;
  x: number;
  y: number;
}

export function layoutRing(tools: ToolNode[], radius = 200, cx = 250, cy = 250): NodePos[] {
  const n = tools.length || 1;
  return tools.map((t, i) => {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    return {
      id: t.id,
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    };
  });
}

export const CAPABILITY_COLORS: Record<Capability, string> = {
  ingest: '#0ea5e9', // sky-500
  'read-sensitive': '#f43f5e', // rose-500
  write: '#f97316', // orange-500
  execute: '#a855f7', // violet-500
  egress: '#10b981', // emerald-500
};

export const CAPABILITY_LABELS: Record<Capability, string> = {
  ingest: 'Ingest',
  'read-sensitive': 'Read sensitive',
  write: 'Write',
  execute: 'Execute',
  egress: 'Egress',
};
