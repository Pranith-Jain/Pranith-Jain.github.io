/**
 * TI-Mindmap MCP server-side bridge for the investigator agent.
 *
 * The TI-Mindmap-Hub MCP server (https://mcp.ti-mindmap-hub.com/mcp) exposes
 * 25 tools (reports, briefings, IOC search, CVE intelligence, STIX bundles,
 * knowledge graph). It's user-keyed — the user provides their own API key.
 *
 * The frontend uses a CORS proxy (/api/v1/mcp/proxy) because the upstream
 * doesn't send CORS headers. The agent runs server-side (in the Worker), so
 * it can call the upstream directly with the X-API-Key header — no proxy.
 *
 * This module provides:
 *   - tiMindmapCall(): low-level JSON-RPC call to the upstream MCP
 *   - bridgeTiMindmapTools(): builds AgentTool[] entries for the high-value
 *     TI-Mindmap tools, so the agent can use them during investigations
 *
 * The user's API key is passed per-investigation (stored on the AgentState,
 * never persisted). If no key is provided, the tools are not bridged.
 */
import type { AgentTool } from '../../api/src/lib/agent/types';

const MCP_URL = 'https://mcp.ti-mindmap-hub.com/mcp';
const CALL_TIMEOUT_MS = 30_000;

/** Per-session MCP session IDs (the upstream requires initialize → session). */
const sessionCache = new Map<string, string>(); // apiKey → sessionId

interface JsonRpcResponse<T> {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

/** Low-level JSON-RPC call to the TI-Mindmap MCP upstream. */
async function tiMindmapCall<T>(
  method: string,
  params: Record<string, unknown> | undefined,
  apiKey: string
): Promise<T> {
  // Initialize a session if we don't have one for this key yet.
  let sessionId = sessionCache.get(apiKey);
  if (!sessionId && method !== 'initialize') {
    sessionId = await initializeSession(apiKey);
  }

  const id = Math.floor(Math.random() * 1e9);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    'X-API-Key': apiKey,
  };
  if (sessionId) headers['Mcp-Session-Id'] = sessionId;

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), CALL_TIMEOUT_MS);

  try {
    const res = await fetch(MCP_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params: params ?? {} }),
      signal: ctl.signal,
    });

    // Update session ID if the upstream returned one
    const newSid = res.headers.get('mcp-session-id');
    if (newSid) sessionCache.set(apiKey, newSid);

    if (!res.ok) {
      throw new Error(`TI-Mindmap MCP ${res.status}: ${await res.text().catch(() => res.statusText)}`);
    }

    const contentType = res.headers.get('content-type') ?? '';
    let json: JsonRpcResponse<T>;

    if (contentType.includes('text/event-stream')) {
      // SSE response — parse the last `data:` line as the JSON-RPC result
      const text = await res.text();
      const lines = text.split('\n').filter((l) => l.startsWith('data:'));
      const last = lines[lines.length - 1]?.slice(5).trim();
      if (!last) throw new Error('TI-Mindmap MCP: empty SSE response');
      json = JSON.parse(last);
    } else {
      json = (await res.json()) as JsonRpcResponse<T>;
    }

    if (json.error) {
      throw new Error(`TI-Mindmap MCP error ${json.error.code}: ${json.error.message}`);
    }
    return json.result as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Initialize an MCP session (required before tools/call). */
async function initializeSession(apiKey: string): Promise<string> {
  const result = await tiMindmapCallRaw<{ serverInfo?: { name?: string } }>(
    'initialize',
    {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'pranithjain-agent', version: '1.0.0' },
    },
    apiKey,
    /* skipInit */ true
  );
  return result.sessionId ?? '';
}

/** Raw call that returns the session ID (used by initializeSession). */
async function tiMindmapCallRaw<T>(
  method: string,
  params: Record<string, unknown> | undefined,
  apiKey: string,
  skipInit: boolean
): Promise<T & { sessionId?: string }> {
  if (!skipInit) {
    const sid = sessionCache.get(apiKey);
    if (!sid) await initializeSession(apiKey);
  }
  const id = method === 'initialize' ? 1 : Math.floor(Math.random() * 1e9);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    'X-API-Key': apiKey,
  };
  const existingSid = sessionCache.get(apiKey);
  if (existingSid) headers['Mcp-Session-Id'] = existingSid;

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), CALL_TIMEOUT_MS);
  try {
    const res = await fetch(MCP_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params: params ?? {} }),
      signal: ctl.signal,
    });
    const sessionId = res.headers.get('mcp-session-id') ?? undefined;
    if (sessionId) sessionCache.set(apiKey, sessionId);
    if (!res.ok) throw new Error(`TI-Mindmap MCP ${res.status}`);
    const contentType = res.headers.get('content-type') ?? '';
    let json: JsonRpcResponse<T>;
    if (contentType.includes('text/event-stream')) {
      const text = await res.text();
      const lines = text.split('\n').filter((l) => l.startsWith('data:'));
      const last = lines[lines.length - 1]?.slice(5).trim();
      if (!last) throw new Error('empty SSE');
      json = JSON.parse(last);
    } else {
      json = (await res.json()) as JsonRpcResponse<T>;
    }
    if (json.error) throw new Error(`MCP error ${json.error.code}: ${json.error.message}`);
    return { ...(json.result as T), sessionId };
  } finally {
    clearTimeout(timer);
  }
}

/** Call a TI-Mindmap MCP tool by name. */
export async function callTiMindmapTool<T = unknown>(
  toolName: string,
  args: Record<string, unknown>,
  apiKey: string
): Promise<T> {
  return tiMindmapCall<T>('tools/call', { name: toolName, arguments: args }, apiKey);
}

/**
 * Build AgentTool[] entries for the high-value TI-Mindmap MCP tools.
 * Returns an empty array if no API key is provided (the tools are user-keyed).
 *
 * Only bridges the tools most useful for investigations — the full 25-tool
 * set is available via the frontend MCP search; the agent gets the 8 that
 * matter for CTI reports (IOC search, CVE intel, reports, briefings, STIX).
 */
export function bridgeTiMindmapTools(apiKey: string | undefined): AgentTool[] {
  if (!apiKey) return []; // user-keyed — no key, no tools

  const tools: AgentTool[] = [
    {
      name: 'timindmap_search_ioc',
      description:
        'Search the TI-Mindmap-Hub knowledge graph for an IOC (IP, domain, hash, URL). Returns linked reports, CVEs, actors, and campaigns. Requires a TI-Mindmap API key (user-provided).',
      params: [{ name: 'ioc_value', type: 'string', description: 'IOC value (IP, domain, hash, URL)', required: true }],
      execute: async (args) => callTiMindmapTool('search_ioc', { ioc_value: String(args.ioc_value) }, apiKey),
    },
    {
      name: 'timindmap_search_cve',
      description:
        'Search the TI-Mindmap-Hub knowledge graph for a CVE. Returns linked reports, affected products, exploits, and threat actors. Requires a TI-Mindmap API key.',
      params: [{ name: 'cve_id', type: 'string', description: 'CVE ID (CVE-YYYY-NNNN)', required: true }],
      execute: async (args) => callTiMindmapTool('search_cve', { cve_id: String(args.cve_id) }, apiKey),
    },
    {
      name: 'timindmap_search_cves_by_keyword',
      description:
        'Search CVEs by keyword in the TI-Mindmap-Hub knowledge graph. Returns matching CVEs with CVSS, products, and exploit status. Requires a TI-Mindmap API key.',
      params: [
        { name: 'query', type: 'string', description: 'Keyword search query', required: true },
        { name: 'limit', type: 'number', description: 'Max results (default 20)', required: false },
      ],
      execute: async (args) =>
        callTiMindmapTool(
          'search_cves_by_keyword',
          { query: String(args.query), limit: (args.limit as number) ?? 20 },
          apiKey
        ),
    },
    {
      name: 'timindmap_list_reports',
      description:
        'List CTI reports in the TI-Mindmap-Hub knowledge graph. Filter by source, tag, or date. Each report links to CVEs, IOCs, actors, and campaigns. Requires a TI-Mindmap API key.',
      params: [
        { name: 'source', type: 'string', description: 'Filter by report source', required: false },
        { name: 'tag', type: 'string', description: 'Filter by tag', required: false },
        { name: 'limit', type: 'number', description: 'Max results (default 20)', required: false },
      ],
      execute: async (args) =>
        callTiMindmapTool(
          'list_reports',
          { source: args.source, tag: args.tag, limit: (args.limit as number) ?? 20 },
          apiKey
        ),
    },
    {
      name: 'timindmap_get_report',
      description:
        'Get full details of a CTI report from the TI-Mindmap-Hub knowledge graph (CVEs, IOCs, actors, campaigns, references). Use timindmap_list_reports first to find the report ID. Requires a TI-Mindmap API key.',
      params: [{ name: 'report_id', type: 'string', description: 'Report ID (from list_reports)', required: true }],
      execute: async (args) => callTiMindmapTool('get_report_details', { report_id: String(args.report_id) }, apiKey),
    },
    {
      name: 'timindmap_list_briefings',
      description:
        'List daily threat briefings from the TI-Mindmap-Hub. Each briefing covers CVEs, IOCs, and actors for a date. Requires a TI-Mindmap API key.',
      params: [{ name: 'limit', type: 'number', description: 'Max results (default 10)', required: false }],
      execute: async (args) => callTiMindmapTool('list_briefings', { limit: (args.limit as number) ?? 10 }, apiKey),
    },
    {
      name: 'timindmap_get_briefing_by_date',
      description:
        'Get a daily threat briefing for a specific date from the TI-Mindmap-Hub. Returns CVEs, IOCs, actors, and campaigns for that day. Requires a TI-Mindmap API key.',
      params: [{ name: 'date', type: 'string', description: 'Date (YYYY-MM-DD)', required: true }],
      execute: async (args) => callTiMindmapTool('get_briefing_by_date', { date: String(args.date) }, apiKey),
    },
    {
      name: 'timindmap_get_stix_bundle',
      description:
        'Get a STIX 2.1 bundle for a TI-Mindmap-Hub article (report). Returns the full STIX bundle with observables, indicators, relationships. Requires a TI-Mindmap API key.',
      params: [{ name: 'article_id', type: 'string', description: 'Article/report ID', required: true }],
      execute: async (args) => callTiMindmapTool('get_stix_bundle', { article_id: String(args.article_id) }, apiKey),
    },
    {
      name: 'timindmap_kg_search',
      description:
        'Search the TI-Mindmap-Hub knowledge graph (entities, relationships, observables). Cross-report correlation: finds linked CVEs, IOCs, actors, campaigns across all reports. Requires a TI-Mindmap API key.',
      params: [
        { name: 'query', type: 'string', description: 'Search query (IOC, CVE, actor, campaign name)', required: true },
        { name: 'limit', type: 'number', description: 'Max results (default 20)', required: false },
      ],
      execute: async (args) =>
        callTiMindmapTool('kg_search', { query: String(args.query), limit: (args.limit as number) ?? 20 }, apiKey),
    },
  ];

  return tools;
}
