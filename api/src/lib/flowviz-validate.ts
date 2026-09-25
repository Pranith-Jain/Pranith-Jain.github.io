/**
 * FlowViz validation + edge-safe SSRF guard.
 *
 * Ports davidljohnson/flowviz security-utils.js (MIT) to the Workers
 * runtime: no node-fetch, no DNS lookups (same documented limitation as
 * upstream — DNS-rebinding to a private IP passes; compensate with short
 * timeouts + manual redirect handling + per-hop re-validation).
 *
 * Also ports the FlowViz node/edge shape checks + the tolerant
 * balanced-brace JSON extractor (same idea as extract-llm.ts parseLlmJson).
 */

export const FLOWVIZ_NODE_TYPES = [
  'action',
  'tool',
  'malware',
  'asset',
  'infrastructure',
  'url',
  'vulnerability',
  'AND_operator',
  'OR_operator',
] as const;

export type FlowvizNodeType = (typeof FLOWVIZ_NODE_TYPES)[number];

export const FLOWVIZ_EDGE_LABELS = [
  'Uses',
  'Targets',
  'Communicates with',
  'Connects to',
  'Affects',
  'Leads to',
] as const;

export interface FlowvizNode {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

export interface FlowvizEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
  label?: string;
}

const PRIVATE_IPV4_RE =
  /^(10\.|127\.|0\.|192\.168\.|169\.254\.|100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\.|192\.0\.0\.|224\.|225\.|226\.|227\.|228\.|229\.|23\d\.)/;
const CGNAT_172_RE = /^172\.(1[6-9]|2\d|3[0-1])\./;

function isPrivateHostname(host: string): boolean {
  const h = host.toLowerCase().trim();
  if (h === 'localhost' || h.endsWith('.localhost') || h === '[::1]' || h === '[::]') return true;
  // Strip brackets for IPv6 literals.
  const bare = h.startsWith('[') && h.endsWith(']') ? h.slice(1, -1) : h;
  if (bare.includes(':')) {
    // IPv6: loopback, unspecified, ULA, link-local, IPv4-mapped private.
    if (bare === '::1' || bare === '::') return true;
    const lb = bare.toLowerCase();
    if (lb.startsWith('fc') || lb.startsWith('fd')) return true;
    if (lb.startsWith('fe80')) return true;
    if (lb.startsWith('::ffff:')) {
      const v4 = lb.slice('::ffff:'.length);
      if (v4.includes('.')) return isPrivateHostname(v4);
      return true; // hex form — treat as private (upstream does the same)
    }
    return false;
  }
  if (PRIVATE_IPV4_RE.test(bare)) return true;
  if (CGNAT_172_RE.test(bare)) return true;
  // Multicast / reserved 240+/225+ handled by prefix above (224.); 240-255:
  const first = parseInt(bare.split('.')[0] ?? '', 10);
  if (Number.isFinite(first) && first >= 224) return true;
  return false;
}

/** Throw on non-http(s) or private-target URLs. Returns the parsed URL. */
export function validateFlowvizUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error('invalid-url');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('invalid-scheme');
  if (isPrivateHostname(u.hostname)) throw new Error('private-host');
  if (u.username || u.password) throw new Error('credentials-in-url');
  return u;
}

export interface SecureFetchOpts {
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  accept?: string;
}

/**
 * SSRF-guarded fetch: manual redirects with per-hop re-validation,
 * streaming byte cap, abort timeout. Workers-native (global fetch).
 */
export async function flowvizSecureFetch(url: string, opts: SecureFetchOpts = {}): Promise<Response> {
  const maxBytes = opts.maxBytes ?? 5_000_000;
  const timeoutMs = opts.timeoutMs ?? 15000;
  const maxRedirects = opts.maxRedirects ?? 5;
  let current = validateFlowvizUrl(url).toString();

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(current, {
        headers: {
          'User-Agent': 'pranithjain-dfir/1.0 (+flowviz-port)',
          ...(opts.accept ? { accept: opts.accept } : {}),
        },
        redirect: 'manual',
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) throw new Error('redirect-without-location');
      // Resolve relative Location against the current URL, then re-validate.
      current = validateFlowvizUrl(new URL(loc, current).toString()).toString();
      continue;
    }
    // Enforce the byte cap: fast-path via content-length, then stream-count.
    const lenHeader = parseInt(res.headers.get('content-length') ?? '', 10);
    if (Number.isFinite(lenHeader) && lenHeader > maxBytes) throw new Error('response-too-large');
    if (!res.body) return res;
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          /* ignore */
        }
        throw new Error('response-too-large');
      }
      chunks.push(value);
    }
    const merged = new Uint8Array(total);
    let off = 0;
    for (const ch of chunks) {
      merged.set(ch, off);
      off += ch.byteLength;
    }
    return new Response(merged, { status: res.status, headers: res.headers });
  }
  throw new Error('too-many-redirects');
}

/** Extract the first balanced `{...}` substring and JSON.parse it. */
export function parseFlowvizJson(text: string): unknown {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1)) as unknown;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function asStr(v: unknown, max = 500): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

export interface FlowvizGraphValidation {
  ok: boolean;
  nodeCount: number;
  edgeCount: number;
  errors: string[];
  warnings: string[];
}

/** Structural validation for an AI-produced FlowViz graph. Pure. */
export function validateFlowvizGraph(
  raw: unknown,
  opts: { articleText?: string; maxNodes?: number; maxEdges?: number } = {}
): FlowvizGraphValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!raw || typeof raw !== 'object') return { ok: false, nodeCount: 0, edgeCount: 0, errors: ['not-an-object'], warnings };
  const rec = raw as { nodes?: unknown; edges?: unknown };
  const nodes = Array.isArray(rec.nodes) ? (rec.nodes as FlowvizNode[]) : null;
  const edges = Array.isArray(rec.edges) ? (rec.edges as FlowvizEdge[]) : null;
  if (!nodes) errors.push('nodes-missing');
  if (!edges) errors.push('edges-missing');
  const nodeList = nodes ?? [];
  const edgeList = edges ?? [];
  const maxNodes = opts.maxNodes ?? 500;
  const maxEdges = opts.maxEdges ?? 1000;
  if (nodeList.length > maxNodes) errors.push(`too-many-nodes:${nodeList.length}`);
  if (edgeList.length > maxEdges) errors.push(`too-many-edges:${edgeList.length}`);

  const ids = new Set<string>();
  for (const n of nodeList) {
    const id = asStr((n as FlowvizNode)?.id, 120);
    const type = asStr((n as FlowvizNode)?.type, 40);
    if (!id) {
      errors.push('node-missing-id');
      continue;
    }
    if (ids.has(id)) errors.push(`duplicate-node-id:${id}`);
    ids.add(id);
    if (!(FLOWVIZ_NODE_TYPES as readonly string[]).includes(type)) errors.push(`bad-node-type:${id}:${type || '?'}`);
    const data = (n as FlowvizNode)?.data;
    if (!data || typeof data !== 'object') {
      errors.push(`node-missing-data:${id}`);
      continue;
    }
    if (!asStr((data as Record<string, unknown>).name, 300)) warnings.push(`node-missing-name:${id}`);
    const excerpt = asStr((data as Record<string, unknown>).source_excerpt, 2000);
    if (!excerpt) {
      warnings.push(`node-missing-excerpt:${id}`);
    } else if (opts.articleText && !opts.articleText.includes(excerpt.slice(0, 60))) {
      warnings.push(`excerpt-not-grounded:${id}`);
    }
    if (type === 'action') {
      const tid = asStr((data as Record<string, unknown>).technique_id, 20);
      if (tid && !/^T\d{4}(\.\d{3})?$/.test(tid)) errors.push(`bad-technique-id:${id}:${tid}`);
    }
    if (type === 'vulnerability') {
      const cve = asStr(
        (data as Record<string, unknown>).cve_id ?? (data as Record<string, unknown>).name,
        30
      );
      if (cve && !/CVE-\d{4}-\d{4,7}/i.test(cve)) warnings.push(`vuln-without-cve:${id}`);
    }
  }
  for (const e of edgeList) {
    const id = asStr((e as FlowvizEdge)?.id, 120);
    const s = asStr((e as FlowvizEdge)?.source, 120);
    const t = asStr((e as FlowvizEdge)?.target, 120);
    if (!s || !t) {
      errors.push(`edge-missing-endpoints:${id || '?'}`);
      continue;
    }
    if (!ids.has(s)) errors.push(`edge-dangling-source:${id || '?'}:${s}`);
    if (!ids.has(t)) errors.push(`edge-dangling-target:${id || '?'}:${t}`);
    const label = asStr((e as FlowvizEdge)?.label, 60);
    if (label && !(FLOWVIZ_EDGE_LABELS as readonly string[]).includes(label)) {
      warnings.push(`edge-unexpected-label:${id || '?'}:${label}`);
    }
  }
  return { ok: errors.length === 0, nodeCount: nodeList.length, edgeCount: edgeList.length, errors, warnings };
}
