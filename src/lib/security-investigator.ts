/**
 * Typed client for the Security Investigator REST surface
 * (`/api/v1/si/*`). Mirrors the MCP tool shapes so a frontend that
 * already speaks to the si_* MCP tools can fall back to HTTP without
 * re-typing payloads.
 *
 * Routing prompt reminder: this client is the same code path the MCP
 * server uses on the Worker side. If a field is null here, the same
 * field is null when fetched via MCP. Don't add client-side
 * fallbacks — the edge is the source of truth.
 *
 * Usage:
 *   import { createSiClient } from '@/lib/security-investigator';
 *   const si = createSiClient();
 *   const idx = await si.index();
 *   const pulse = await si.getSkill('threat-pulse');
 *   const svg = await si.renderSvg({ slug: 'threat-pulse' });
 */

const DEFAULT_BASE = '/api/v1/si';

export interface SiIndex {
  source: string;
  license: string;
  replicatedAt: string;
  counts: {
    skills: number;
    queries: number;
    automations: number;
    docs: number;
    ref: number;
    scripts: number;
    [k: string]: number;
  };
  skills: SiSkillSummary[];
  queries: SiQuerySummary[];
  automations: SiAutomationSummary[];
  [k: string]: unknown;
}

export interface SiSkillSummary {
  slug: string;
  name: string;
  category: string;
  description?: string;
  triggerKeywords?: string[];
  hasAssets: boolean;
  sizeBytes: number;
  [k: string]: unknown;
}

export interface SiQuerySummary {
  slug: string;
  domain: string;
  subdomain?: string | null;
  title: string;
  filename: string;
  sizeBytes: number;
  [k: string]: unknown;
}

export interface SiAutomationSummary {
  slug: string;
  name: string;
  description?: string;
  triggerKeywords?: string[];
  sizeBytes: number;
  [k: string]: unknown;
}

export interface SiSkillBody extends SiSkillSummary {
  bodyMarkdown: string;
  domain: string;
  svgWidgetsYaml?: string;
  [k: string]: unknown;
}

export interface SiQueryBody extends SiQuerySummary {
  bodyMarkdown: string;
  [k: string]: unknown;
}

export interface SiAutomationBody extends SiAutomationSummary {
  bodyMarkdown: string;
  [k: string]: unknown;
}

export interface SiDocSummary {
  slug: string;
  title: string;
  sizeBytes: number;
  [k: string]: unknown;
}

export interface SiDoc extends SiDocSummary {
  bodyMarkdown: string;
  [k: string]: unknown;
}

export interface SiRefSummary {
  name: string;
  description?: string;
  sizeBytes: number;
  [k: string]: unknown;
}

export interface SiScriptSummary {
  name: string;
  sizeBytes: number;
  language?: string;
  [k: string]: unknown;
}

export interface SiSkillsListResponse {
  total: number;
  returned: number;
  skills: SiSkillSummary[];
}

export interface SiQueriesListResponse {
  total: number;
  returned: number;
  queries: SiQuerySummary[];
}

export interface SiRenderSvgResponse {
  svg: string;
  bytes: number;
  widgetCount: number;
}

export interface SiRenderPalette {
  primary?: string;
  secondary?: string;
  accent?: string;
  danger?: string;
  warning?: string;
  success?: string;
  text?: string;
  background?: string;
  [k: string]: string | undefined;
}

export interface SiRenderWidget {
  type: string;
  name: string;
  [k: string]: unknown;
}

export interface SiRenderManifest {
  canvas?: { width?: number; height?: number; background?: string; padding?: number; [k: string]: unknown };
  palette?: SiRenderPalette;
  widgets?: SiRenderWidget[];
  [k: string]: unknown;
}

export interface SiRenderOptions {
  slug?: string;
  manifest?: SiRenderManifest;
  manifestYaml?: string;
  data?: Record<string, unknown>;
  width?: number;
  /** When true, returns image/svg+xml (or image/png) Response directly. */
  raw?: boolean;
}

export interface SiRoutingPromptResponse {
  bytes: number;
  promptMarkdown: string;
}

export interface ClientOptions {
  /** Base path for the SI API. Default `/api/v1/si`. Override for
   *  cross-origin SSR fetches during local dev (e.g. `http://127.0.0.1:8787/api/v1/si`). */
  baseUrl?: string;
  /** Optional AbortSignal for cancellation. */
  signal?: AbortSignal;
  /** Custom fetch impl (defaults to global fetch). */
  fetch?: typeof fetch;
}

export class SiClientError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
    this.name = 'SiClientError';
  }
}

export interface SiStreamMeta {
  startLine: number;
  endLine: number;
  totalLines: number;
  bytes: number;
  /** Title (docs only). */
  title?: string;
  /** Slug echoed back (docs only). */
  slug?: string;
}

export interface SiStreamResult {
  /** The streamed markdown body, fully buffered. */
  text: string;
  /** Metadata extracted from X-SI-* response headers. */
  meta: SiStreamMeta;
}

export interface SecurityInvestigatorClient {
  index(): Promise<SiIndex>;
  listSkills(opts?: { category?: string; keyword?: string; limit?: number }): Promise<SiSkillsListResponse>;
  getSkill(slug: string): Promise<SiSkillBody>;
  listQueries(opts?: { domain?: string; keyword?: string; limit?: number }): Promise<SiQueriesListResponse>;
  getQuery(domain: string, file: string): Promise<SiQueryBody>;
  getQueryBySlug(slug: string): Promise<SiQueryBody>;
  listAutomations(): Promise<{ total: number; returned: number; automations: SiAutomationSummary[] }>;
  getAutomation(slug: string): Promise<SiAutomationBody>;
  listDocs(): Promise<{ total: number; returned: number; docs: SiDocSummary[] }>;
  getDoc(slug: string): Promise<SiDoc>;
  listRef(): Promise<{ total: number; returned: number; ref: SiRefSummary[] }>;
  getRef<T = unknown>(name: string): Promise<{ name: string; data: T; bytes: number }>;
  routingPrompt(): Promise<SiRoutingPromptResponse>;
  listScripts(): Promise<{ total: number; returned: number; scripts: SiScriptSummary[] }>;
  getScript(name: string): Promise<{ name: string; body: string; bytes: number }>;
  renderSvg(opts: SiRenderOptions): Promise<string | SiRenderSvgResponse>;
  renderPng(opts: SiRenderOptions): Promise<Blob>;
  /** Stream a skill body as text/markdown with optional line-range slicing.
   *  Always uses ?stream=true; the response is buffered to a string but
   *  travels as text/markdown (no JSON envelope). For partial reads
   *  (from_line / max_lines) this avoids pulling the full ~100KB body
   *  when the caller only needs the first 200 lines. */
  streamSkill(slug: string, opts?: { fromLine?: number; maxLines?: number }): Promise<SiStreamResult>;
  streamQuery(slug: string, opts?: { fromLine?: number; maxLines?: number }): Promise<SiStreamResult>;
  streamDoc(slug: string, opts?: { fromLine?: number; maxLines?: number }): Promise<SiStreamResult>;
}

async function jsonRequest<T>(url: string, init: RequestInit, fetcher: typeof fetch): Promise<T> {
  const res = await fetcher(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const msg = (body && typeof body === 'object' && 'error' in body) ? String((body as { error: unknown }).error) : `HTTP ${res.status}`;
    throw new SiClientError(res.status, msg, body);
  }
  return res.json() as Promise<T>;
}

export function createSiClient(opts: ClientOptions = {}): SecurityInvestigatorClient {
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE;
  const fetcher = opts.fetch ?? globalThis.fetch.bind(globalThis);
  const baseInit: RequestInit = { headers: { accept: 'application/json' }, signal: opts.signal };

  function url(path: string): string {
    return `${baseUrl}${path}`;
  }

  return {
    async index() {
      return jsonRequest<SiIndex>(url('/index'), baseInit, fetcher);
    },
    async listSkills(o = {}) {
      const q = new URLSearchParams();
      if (o.category) q.set('category', o.category);
      if (o.keyword) q.set('keyword', o.keyword);
      if (o.limit) q.set('limit', String(o.limit));
      const qs = q.toString();
      return jsonRequest<SiSkillsListResponse>(url(`/skills${qs ? '?' + qs : ''}`), baseInit, fetcher);
    },
    async getSkill(slug) {
      return jsonRequest<SiSkillBody>(url(`/skills/${encodeURIComponent(slug)}`), baseInit, fetcher);
    },
    async listQueries(o = {}) {
      const q = new URLSearchParams();
      if (o.domain) q.set('domain', o.domain);
      if (o.keyword) q.set('keyword', o.keyword);
      if (o.limit) q.set('limit', String(o.limit));
      const qs = q.toString();
      return jsonRequest<SiQueriesListResponse>(url(`/queries${qs ? '?' + qs : ''}`), baseInit, fetcher);
    },
    async getQuery(domain, file) {
      return jsonRequest<SiQueryBody>(url(`/queries/${encodeURIComponent(domain)}/${encodeURIComponent(file)}`), baseInit, fetcher);
    },
    async getQueryBySlug(slug) {
      return jsonRequest<SiQueryBody>(url(`/query?slug=${encodeURIComponent(slug)}`), baseInit, fetcher);
    },
    async listAutomations() {
      return jsonRequest(url('/automations'), baseInit, fetcher);
    },
    async getAutomation(slug) {
      return jsonRequest<SiAutomationBody>(url(`/automations/${encodeURIComponent(slug)}`), baseInit, fetcher);
    },
    async listDocs() {
      return jsonRequest(url('/docs'), baseInit, fetcher);
    },
    async getDoc(slug) {
      return jsonRequest<SiDoc>(url(`/docs/${encodeURIComponent(slug)}`), baseInit, fetcher);
    },
    async listRef() {
      return jsonRequest(url('/ref'), baseInit, fetcher);
    },
    async getRef(name) {
      return jsonRequest(url(`/ref/${encodeURIComponent(name)}`), baseInit, fetcher);
    },
    async routingPrompt() {
      return jsonRequest<SiRoutingPromptResponse>(url('/routing-prompt'), baseInit, fetcher);
    },
    async listScripts() {
      return jsonRequest(url('/scripts'), baseInit, fetcher);
    },
    async getScript(name) {
      const res = await fetcher(url(`/scripts/${encodeURIComponent(name)}`), { signal: opts.signal });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new SiClientError(res.status, `script_failed: ${body.slice(0, 100)}`);
      }
      const body = await res.text();
      return {
        name,
        body,
        bytes: Number(res.headers.get('X-SI-Bytes') ?? body.length),
      };
    },
    async renderSvg(o) {
      if (o.slug) {
        const res = await fetcher(url(`/render?slug=${encodeURIComponent(o.slug)}&format=svg${o.data ? `&data=${encodeURIComponent(JSON.stringify(o.data))}` : ''}`), { signal: opts.signal });
        if (!res.ok) throw new SiClientError(res.status, `render_failed: HTTP ${res.status}`);
        if (o.raw) return res as unknown as string;
        return res.text() as Promise<string>;
      }
      // POST manifest + data
      const body: Record<string, unknown> = { data: o.data ?? {} };
      if (o.manifest) body.manifest = o.manifest;
      else if (o.manifestYaml) body.manifestYaml = o.manifestYaml;
      else throw new SiClientError(400, 'renderSvg: must provide slug, manifest, or manifestYaml');
      const res = await fetcher(url('/render'), {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
        signal: opts.signal,
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new SiClientError(res.status, `render_failed`, errBody);
      }
      if (o.raw) return res as unknown as SiRenderSvgResponse;
      return res.json() as Promise<SiRenderSvgResponse>;
    },
    async renderPng(o) {
      if (o.slug) {
        const w = o.width ?? 1400;
        const res = await fetcher(url(`/render?slug=${encodeURIComponent(o.slug)}&format=png&width=${w}`), { signal: opts.signal });
        if (!res.ok) throw new SiClientError(res.status, `render_png_failed: HTTP ${res.status}`);
        return res.blob();
      }
      throw new SiClientError(400, 'renderPng: slug is required (POST manifests render to SVG only on the API; use si_render_png MCP tool or POST via the YAML route for that path)');
    },
    async streamSkill(slug, o = {}) {
      return streamMarkdown(url(`/skills/${encodeURIComponent(slug)}?stream=true&from_line=${o.fromLine ?? 0}${o.maxLines ? `&max_lines=${o.maxLines}` : ''}`), fetcher, opts.signal);
    },
    async streamQuery(slug, o = {}) {
      return streamMarkdown(url(`/query?slug=${encodeURIComponent(slug)}&stream=true&from_line=${o.fromLine ?? 0}${o.maxLines ? `&max_lines=${o.maxLines}` : ''}`), fetcher, opts.signal);
    },
    async streamDoc(slug, o = {}) {
      return streamMarkdown(url(`/docs/${encodeURIComponent(slug)}?stream=true&from_line=${o.fromLine ?? 0}${o.maxLines ? `&max_lines=${o.maxLines}` : ''}`), fetcher, opts.signal);
    },
  };
}

async function streamMarkdown(url: string, fetcher: typeof fetch, signal: AbortSignal | undefined): Promise<SiStreamResult> {
  const res = await fetcher(url, { signal });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new SiClientError(res.status, `stream_failed: ${body.slice(0, 100)}`);
  }
  const text = await res.text();
  const headers = res.headers;
  return {
    text,
    meta: {
      startLine: Number(headers.get('X-SI-Start-Line') ?? 0),
      endLine: Number(headers.get('X-SI-End-Line') ?? 0),
      totalLines: Number(headers.get('X-SI-Total-Lines') ?? 0),
      bytes: Number(headers.get('X-SI-Bytes') ?? text.length),
      title: headers.get('X-SI-Title') ?? undefined,
      slug: headers.get('X-SI-Slug') ?? undefined,
    },
  };
}

/** Default singleton — uses the same `/api/v1/si` base as the Worker route. */
export const siClient: SecurityInvestigatorClient = createSiClient();
