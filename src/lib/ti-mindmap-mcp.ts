/**
 * Browser-side client for the TI Mindmap HUB MCP server
 * (https://mcp.ti-mindmap-hub.com/mcp, JSON-RPC over HTTPS + SSE).
 *
 * Mirrors the official mcp-bridge.js stdio script
 * (https://github.com/TI-Mindmap-HUB-Org/ti-mindmap-hub-research/blob/main/mcp-integration/mcp-bridge.js)
 * but runs in the browser, keeps the API key in localStorage, and exposes a
 * typed surface for the /threatintel/ai-report page. Server is the source of
 * truth on auth (`X-API-Key` or `Authorization: Bearer <token>`), session id
 * (`Mcp-Session-Id` header returned by `initialize` and re-sent on every
 * subsequent request), and transport (`Accept: application/json, text/event-stream`
 * with the actual response being either plain JSON or an SSE `data:` frame).
 *
 * 25 tools across 7 categories: reports (5), briefings (3), IOC search (1),
 * CVE intelligence (5), STIX bundles (3), statistics & submissions (2),
 * knowledge graph (6). We wrap the ones the AI Report page needs.
 */

const MCP_URL = 'https://mcp.ti-mindmap-hub.com/mcp';
const KEY_STORAGE = 'ti-mindmap:api-key';
const SESSION_STORAGE = 'ti-mindmap:session-id';
const PROBE_TIMEOUT_MS = 8_000;
const CALL_TIMEOUT_MS = 25_000;

export interface McpConfig {
  apiKey: string;
  endpoint?: string;
}

/** Read the persisted API key, or empty string if not set. */
export function getStoredApiKey(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

/** Persist the API key in localStorage. */
export function setStoredApiKey(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (key) window.localStorage.setItem(KEY_STORAGE, key);
    else window.localStorage.removeItem(KEY_STORAGE);
    // Any new key invalidates the previous session id.
    window.localStorage.removeItem(SESSION_STORAGE);
  } catch {
    /* private mode / blocked storage — accept the loss, key still works for this session */
  }
}

let sessionId = '';
function loadSession(): string {
  if (sessionId) return sessionId;
  if (typeof window === 'undefined') return '';
  try {
    sessionId = window.localStorage.getItem(SESSION_STORAGE) ?? '';
  } catch {
    sessionId = '';
  }
  return sessionId;
}
function saveSession(id: string): void {
  sessionId = id;
  if (typeof window === 'undefined') return;
  try {
    if (id) window.localStorage.setItem(SESSION_STORAGE, id);
    else window.localStorage.removeItem(SESSION_STORAGE);
  } catch {
    /* ignore */
  }
}

export class McpError extends Error {
  code: number;
  hint?: string;
  constructor(message: string, code: number, hint?: string) {
    super(message);
    this.name = 'McpError';
    this.code = code;
    this.hint = hint;
  }
}

interface JsonRpcResponse<T> {
  jsonrpc: '2.0';
  id?: number | string;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

/** Initialize (or re-initialize) the MCP session. Returns the session id. */
export async function initSession(apiKey: string, endpoint = MCP_URL): Promise<string> {
  const existing = loadSession();
  if (existing) return existing;
  const res = await callRaw<{ serverInfo?: { name?: string; version?: string } }>(
    'initialize',
    {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'pranithjain-qzz-io', version: '1.0.0' },
    },
    apiKey,
    endpoint,
    /* fresh */ true
  );
  const id = res.headers.get('mcp-session-id') ?? '';
  if (id) saveSession(id);
  return id;
}

/** Low-level JSON-RPC POST. Handles SSE-or-JSON response, session header, timeout. */
async function callRaw<T>(
  method: string,
  params: Record<string, unknown> | undefined,
  apiKey: string,
  endpoint: string,
  fresh = false
): Promise<{ data: JsonRpcResponse<T>; headers: Headers }> {
  const id = method === 'initialize' ? 1 : Math.floor(Math.random() * 1e9);
  const body = { jsonrpc: '2.0', id, method, params: params ?? {} };
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    'X-API-Key': apiKey,
  };
  const sid = fresh ? '' : loadSession();
  if (sid) headers['Mcp-Session-Id'] = sid;

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), method === 'initialize' ? PROBE_TIMEOUT_MS : CALL_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal: ctl.signal });
  } catch (e) {
    clearTimeout(timer);
    const msg = e instanceof Error ? e.message : String(e);
    throw new McpError(
      msg.includes('aborted')
        ? `MCP request timed out after ${Math.round(CALL_TIMEOUT_MS / 1000)}s`
        : `Network error: ${msg}`,
      -32000,
      'Check your network connection and try again.'
    );
  }
  clearTimeout(timer);

  if (res.status === 401 || res.status === 403) {
    saveSession('');
    throw new McpError(
      'TI-Mindmap-Hub rejected the API key',
      res.status,
      'Open My Profile -> MCP Server API Keys at ti-mindmap-hub.com and generate a new key.'
    );
  }
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 200);
    throw new McpError(`MCP ${method} failed: HTTP ${res.status} ${detail}`, res.status);
  }

  // 202/204 = notification acknowledged, no body.
  if (res.status === 202 || res.status === 204) {
    return { data: { jsonrpc: '2.0', id } as JsonRpcResponse<T>, headers: res.headers };
  }

  const ct = res.headers.get('content-type') ?? '';
  let parsed: JsonRpcResponse<T>;
  if (ct.includes('text/event-stream')) {
    const text = await res.text();
    parsed = parseSseFrame<T>(text, id);
  } else {
    const text = await res.text();
    if (!text.trim()) {
      parsed = { jsonrpc: '2.0', id } as JsonRpcResponse<T>;
    } else {
      try {
        parsed = JSON.parse(text) as JsonRpcResponse<T>;
      } catch {
        throw new McpError(`MCP returned non-JSON response: ${text.slice(0, 120)}`, -32700);
      }
    }
  }

  if (parsed.error) {
    throw new McpError(parsed.error.message, parsed.error.code);
  }
  return { data: parsed, headers: res.headers };
}

function parseSseFrame<T>(text: string, _id: number | string): JsonRpcResponse<T> {
  for (const line of text.split('\n')) {
    if (line.startsWith('data: ')) {
      try {
        return JSON.parse(line.substring(6)) as JsonRpcResponse<T>;
      } catch {
        /* keep scanning */
      }
    }
  }
  // Fallback -- try the whole blob as JSON.
  try {
    return JSON.parse(text) as JsonRpcResponse<T>;
  } catch {
    throw new McpError(`MCP SSE response could not be parsed: ${text.slice(0, 120)}`, -32700);
  }
}

interface McpToolResult {
  /** MCP spec: a list of typed content blocks. We only need text. */
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

async function callTool<T>(name: string, args: Record<string, unknown>, apiKey: string): Promise<T> {
  if (!apiKey) {
    throw new McpError('API key not set', -32000, 'Add your TI-Mindmap-Hub API key in the page header.');
  }
  // Always (re-)use an existing session; initialize lazily on the first call.
  if (!loadSession()) await initSession(apiKey);
  try {
    const { data, headers } = await callRaw<McpToolResult>('tools/call', { name, arguments: args }, apiKey, MCP_URL);
    // Some servers return a fresh session id on the first call -- pick it up.
    const newSid = headers.get('mcp-session-id');
    if (newSid && newSid !== loadSession()) saveSession(newSid);
    const result = data.result;
    if (!result) throw new McpError(`MCP ${name} returned empty result`, -32000);
    if (result.isError) {
      const msg =
        result.content
          ?.map((c) => c.text)
          .filter(Boolean)
          .join('\n') || 'tool reported an error';
      throw new McpError(msg, -32000);
    }
    // The TI-Mindmap-Hub tools return a single JSON-encoded text block.
    // Concatenate all text blocks (defensive against future multi-block results)
    // and JSON.parse the union.
    const text = (result.content ?? [])
      .filter((c) => c.type === 'text' && typeof c.text === 'string')
      .map((c) => c.text ?? '')
      .join('\n');
    if (!text) throw new McpError(`MCP ${name} returned no text content`, -32000);
    try {
      return JSON.parse(text) as T;
    } catch {
      // If the tool returned a plain string (e.g. raw text content), pass it through.
      return text as unknown as T;
    }
  } catch (e) {
    // 401 wipes the session; on the next call we re-initialize.
    if (e instanceof McpError && (e.code === 401 || e.code === 403)) {
      saveSession('');
    }
    throw e;
  }
}

// ── Typed wrappers for the tools the AI Report page actually uses ─────

export interface TiReportSummary {
  report_id: string;
  title?: string;
  source?: string;
  published_at?: string;
  url?: string;
  tags?: string[];
  summary?: string;
  actor?: string;
  malware?: string[];
  cves?: string[];
  ioc_count?: number;
  ttp_count?: number;
  cve_count?: number;
}

export interface ListReportsResult {
  reports?: TiReportSummary[];
  total?: number;
}

export async function listReports(
  apiKey: string,
  opts: { search?: string; tags?: string[]; source?: string; timeRange?: string; limit?: number } = {}
): Promise<ListReportsResult> {
  const args: Record<string, unknown> = {};
  if (opts.search) args.search = opts.search;
  if (opts.tags?.length) args.tags = opts.tags;
  if (opts.source) args.source = opts.source;
  if (opts.timeRange) args.time_range = opts.timeRange;
  if (opts.limit) args.limit = opts.limit;
  return callTool<ListReportsResult>('list_reports', args, apiKey);
}

// ── Report content fetchers (used by the AI Report showcase to load
//    any of the 1,628+ reports on ti-mindmap-hub.com on demand) ──────

export type ReportContentType =
  | 'summary'
  | 'raw'
  | 'mindmap'
  | 'ttps_table'
  | 'ttps_execution'
  | 'five_whats'
  | 'stix'
  | 'iocs';

export interface ReportDetailsResult {
  report_id: string;
  title?: string;
  source?: string;
  published_at?: string;
  url?: string;
  tags?: string[];
  summary?: string;
  actor?: string;
  malware?: string[];
  cves?: string[];
  iocs?: Array<{ type?: string; value: string }>;
  ttps?: Array<{ id?: string; name?: string; tactic?: string }>;
  cvss?: number;
  severity?: string;
  epss?: number;
}

/** Detailed metadata for a single report. */
export async function getReportDetails(apiKey: string, reportId: string): Promise<ReportDetailsResult> {
  return callTool<ReportDetailsResult>('get_report_details', { report_id: reportId }, apiKey);
}

/**
 * Fetch one of the eight content slices for a report. The MCP server
 * returns each slice as a JSON-encoded text block; for the `raw` text
 * the payload is just the article body, so we return a string.
 */
export async function getReportContent(
  apiKey: string,
  reportId: string,
  contentType: ReportContentType
): Promise<unknown> {
  return callTool<unknown>('get_report_content', { report_id: reportId, content_type: contentType }, apiKey);
}

export interface SourcesListResult {
  sources?: Array<{ name: string; count?: number }>;
}

export async function listAvailableSources(apiKey: string): Promise<SourcesListResult> {
  return callTool<SourcesListResult>('get_available_sources', {}, apiKey);
}

export interface TagsListResult {
  tags?: Array<{ name: string; count?: number }>;
}

export async function listAvailableTags(apiKey: string): Promise<TagsListResult> {
  return callTool<TagsListResult>('get_available_tags', {}, apiKey);
}

export interface IocSearchResult {
  ioc_value: string;
  ioc_type?: string;
  reports?: TiReportSummary[];
  total_reports?: number;
  first_seen?: string;
  last_seen?: string;
}

export async function searchIoc(apiKey: string, iocValue: string): Promise<IocSearchResult> {
  return callTool<IocSearchResult>('search_ioc', { ioc_value: iocValue }, apiKey);
}

export interface CveSearchResult {
  cve_id: string;
  cvss_score?: number;
  severity?: string;
  epss_score?: number;
  exploited?: boolean;
  description?: string;
  affected_products?: string[];
  references?: string[];
}

export async function searchCve(apiKey: string, cveId: string): Promise<CveSearchResult> {
  return callTool<CveSearchResult>('search_cve', { cve_id: cveId }, apiKey);
}

export interface BriefingSummary {
  briefing_id: string;
  date?: string;
  type?: 'daily' | 'weekly';
  title?: string;
  summary?: string;
}

export interface BriefingListResult {
  briefings?: BriefingSummary[];
}

export async function getLatestBriefing(apiKey: string): Promise<BriefingSummary | null> {
  const res = await callTool<BriefingListResult>('get_latest_briefing', {}, apiKey);
  return res.briefings?.[0] ?? null;
}

export async function listBriefings(apiKey: string, limit = 10): Promise<BriefingSummary[]> {
  const res = await callTool<BriefingListResult>('list_briefings', { limit }, apiKey);
  return res.briefings ?? [];
}

export interface PlatformStats {
  total_reports?: number;
  total_iocs?: number;
  total_cves?: number;
  total_briefings?: number;
  sources_count?: number;
  last_report_at?: string;
}

export async function getStats(apiKey: string): Promise<PlatformStats> {
  return callTool<PlatformStats>('get_statistics', {}, apiKey);
}

/** One-shot probe: validates the key by initializing a session.
 *  Returns `{ ok, error? }` -- never throws. */
export async function probeConnection(
  apiKey: string,
  endpoint = MCP_URL
): Promise<{ ok: boolean; serverInfo?: { name?: string; version?: string }; error?: string }> {
  if (!apiKey) return { ok: false, error: 'No API key set' };
  try {
    saveSession('');
    const { headers } = await callRaw<{ serverInfo?: { name?: string; version?: string } }>(
      'initialize',
      {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'pranithjain-qzz-io', version: '1.0.0' },
      },
      apiKey,
      endpoint,
      /* fresh */ true
    );
    const id = headers.get('mcp-session-id');
    if (id) saveSession(id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
