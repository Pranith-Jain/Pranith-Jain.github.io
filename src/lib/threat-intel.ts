/**
 * Typed client for the Threat Intel REST surface
 * (`/api/v1/threat-intel/*`). Mirrors the MCP tool shapes so a frontend
 * that already speaks to the ti_* MCP tools can fall back to HTTP
 * without re-typing payloads.
 *
 * The edge is the source of truth — if a field is null here, the same
 * field is null when fetched via MCP. Don't add client-side fallbacks.
 *
 * Usage:
 *   import { tiClient } from '@/lib/threat-intel';
 *   const idx = await tiClient.index();
 *   const cves = await tiClient.listCves({ kevOnly: true, limit: 20 });
 *   const body = await tiClient.getCve('CVE-2026-1001');
 */

const DEFAULT_BASE = '/api/v1/threat-intel';

// ─── Types (mirror worker/lib/threat-intel-manifest.ts) ───────────────

export type TiSeverity = 'critical' | 'high' | 'medium' | 'low' | 'unknown';

export interface TiIndexSummary {
  source: string;
  license: string;
  replicatedAt: string;
  lastSyncedAt: string | null;
  counts: { cves: number; iocs: number; sectors: number; kevTotal: number; lists: number };
}

export interface TiCveEntry {
  cveId: string;
  publishedAt: string;
  lastModifiedAt: string;
  cvssV3Score: number | null;
  cvssV3Severity: TiSeverity;
  vendor: string | null;
  product: string | null;
  inKev: boolean;
  inKevSince: string | null;
  priorityScore: number;
  description: string;
  sizeBytes: number;
  argusHypeScore: number | null;
  argusRising: number | null;
}

export interface TiCveBody extends TiCveEntry {
  cvssVector: string | null;
  cweIds: string[];
  references: { url: string; source: string; tags: string[] }[];
  bsiDescription: string | null;
  llmSummary: string | null;
  llmRecommendedAction: string | null;
}

export interface TiKevEntry {
  cveId: string;
  vendor: string;
  product: string;
  name: string;
  dateAdded: string;
  shortDescription: string;
  requiredAction: string;
  dueDate: string;
}

export interface TiIocEntry {
  slug: string;
  family: string;
  category: 'ransomware' | 'malware' | 'apt' | 'c2' | 'phishing' | 'stealer' | 'other';
  aliases: string[];
  firstSeen: string | null;
  mitreTechniques: string[];
  indicatorCount: number;
  description: string;
  sizeBytes: number;
}

export interface TiIocBody extends TiIocEntry {
  indicators: { type: string; value: string; firstSeen: string | null; confidence: 'low' | 'medium' | 'high' }[];
  context: string;
  references: string[];
  llmSummary: string | null;
}

export interface TiSectorEntry {
  sector: 'financial' | 'healthcare' | 'government';
  title: string;
  generatedAt: string;
  topCount: number;
  preview: string;
  sizeBytes: number;
}

export interface TiSectorBody extends TiSectorEntry {
  executiveSummary: string;
  topThreats: {
    cveId?: string;
    iocFamily?: string;
    title: string;
    relevance: 'sector-direct' | 'sector-implied' | 'broadly-critical';
    risk: string;
    recommendedAction: string;
  }[];
}

export interface TiDetectionListEntry {
  slug: string;
  title: string;
  category: string;
  sourceFile: string;
  valueColumn: string;
  entryCount: number;
  sizeBytes: number;
  description: string;
}

export interface TiDetectionListDetail {
  slug: string;
  title: string;
  category: string;
  description: string;
  valueColumn: string;
  totalEntries: number;
  returned: number;
  entries: {
    value: string;
    description?: string;
    tool?: string;
    severity?: string;
    category?: string;
    metadata: Record<string, string>;
  }[];
}

export interface TiStats {
  counts: TiIndexSummary['counts'];
  source: string;
  license: string;
  replicatedAt: string;
  lastSyncedAt: string | null;
  cache: {
    indexLoaded: boolean;
    indexAgeMs: number | null;
    kevLoaded: boolean;
    kevAgeMs: number | null;
    cves: { size: number; hits: number; misses: number };
    iocs: { size: number; hits: number; misses: number };
    sectors: { size: number; hits: number; misses: number };
    lists: { size: number; hits: number; misses: number };
  };
}

// ─── Live search result types ─────────────────────────────────────────

export interface OtxPulse {
  id: string;
  name: string;
  description: string;
  tags: string[];
  indicator_count: number;
  malware_families: string[];
  attack_ids: string[];
}

export interface ThreatFoxIoc {
  ioc_type: string;
  ioc_value: string;
  malware: string;
  confidence: number;
  first_seen: string;
  last_seen: string;
  tags: string[];
  reporter: string;
}

export interface MalwareBazaarSample {
  sha256: string;
  file_name: string;
  signature: string;
  tags: string[];
  first_seen: string;
}

export interface RansomwareGroup {
  name: string;
  description: string;
  onion_urls: string[];
  ttps: string[];
  tools: string[];
  victim_count: number;
}

// ─── List response wrappers ───────────────────────────────────────────

export interface TiListCvesResponse {
  total: number;
  returned: number;
  cves: TiCveEntry[];
}

export interface TiListKevResponse {
  total: number;
  returned: number;
  entries: TiKevEntry[];
}

export interface TiListIocsResponse {
  total: number;
  returned: number;
  iocs: TiIocEntry[];
}

export interface TiListSectorsResponse {
  sectors: TiSectorEntry[];
}

export interface TiListListsResponse {
  total: number;
  returned: number;
  lists: TiDetectionListEntry[];
}

export interface TiSearchResponse<T> {
  query: string;
  total: number;
  [key: string]: unknown;
  pulses?: T[];
  iocs?: T[];
  samples?: T[];
  groups?: T[];
}

// ─── Client options ───────────────────────────────────────────────────

export interface TiClientOptions {
  baseUrl?: string;
  signal?: AbortSignal;
  fetch?: typeof fetch;
}

export class TiClientError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
    this.name = 'TiClientError';
  }
}

// ─── Filter option types ──────────────────────────────────────────────

export interface TiListCvesOptions {
  severity?: TiSeverity;
  kevOnly?: boolean;
  vendor?: string;
  daysBack?: number;
  minPriority?: number;
  minArgusScore?: number;
  keyword?: string;
  limit?: number;
}

export interface TiListKevOptions {
  vendor?: string;
  limit?: number;
}

export interface TiListIocsOptions {
  category?: TiIocEntry['category'];
  keyword?: string;
  limit?: number;
}

export interface TiListListsOptions {
  category?: string;
  keyword?: string;
  limit?: number;
}

export interface TiGetListOptions {
  keyword?: string;
  severity?: string;
  limit?: number;
}

// ─── Client interface ─────────────────────────────────────────────────

export interface ThreatIntelClient {
  index(): Promise<TiIndexSummary>;
  listCves(opts?: TiListCvesOptions): Promise<TiListCvesResponse>;
  getCve(cveId: string): Promise<TiCveBody>;
  listKev(opts?: TiListKevOptions): Promise<TiListKevResponse>;
  listIocs(opts?: TiListIocsOptions): Promise<TiListIocsResponse>;
  getIoc(slug: string): Promise<TiIocBody>;
  listSectors(): Promise<TiListSectorsResponse>;
  getSector(sector: 'financial' | 'healthcare' | 'government'): Promise<TiSectorBody>;
  listLists(opts?: TiListListsOptions): Promise<TiListListsResponse>;
  getList(slug: string, opts?: TiGetListOptions): Promise<TiDetectionListDetail>;
  stats(): Promise<TiStats>;
  searchOtx(q: string): Promise<{ query: string; total: number; pulses: OtxPulse[] }>;
  searchThreatFox(q: string): Promise<{ query: string; total: number; iocs: ThreatFoxIoc[] }>;
  searchMalwareBazaar(q: string): Promise<{ query: string; search_mode: string; total: number; samples: MalwareBazaarSample[] }>;
  searchRansomwareLive(q: string): Promise<{ query: string; total: number; groups: RansomwareGroup[] }>;
  entityGraph(limit?: number): Promise<{
    nodes: { id: string; type: string; label: string; subtitle?: string; weight?: number; data?: Record<string, unknown> }[];
    edges: { id: string; source: string; target: string; label: string }[];
    stats: { total_nodes: number; total_edges: number; by_type: Record<string, number> };
    generated_at: string;
  }>;
}

// ─── Implementation ───────────────────────────────────────────────────

async function jsonRequest<T>(url: string, init: RequestInit, fetcher: typeof fetch): Promise<T> {
  const res = await fetcher(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const msg = body && typeof body === 'object' && 'error' in body
      ? String((body as { error: unknown }).error)
      : `HTTP ${res.status}`;
    throw new TiClientError(res.status, msg, body);
  }
  return res.json() as Promise<T>;
}

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) q.set(k, String(v));
  }
  const qs = q.toString();
  return qs ? `?${qs}` : '';
}

export function createTiClient(opts: TiClientOptions = {}): ThreatIntelClient {
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE;
  const fetcher = opts.fetch ?? globalThis.fetch.bind(globalThis);
  const baseInit: RequestInit = { headers: { accept: 'application/json' }, signal: opts.signal };

  function url(path: string): string {
    return `${baseUrl}${path}`;
  }

  return {
    async index() {
      return jsonRequest<TiIndexSummary>(url('/'), baseInit, fetcher);
    },

    async listCves(o = {}) {
      const qs = buildQuery({
        severity: o.severity,
        kev_only: o.kevOnly ? 'true' : undefined,
        vendor: o.vendor,
        days_back: o.daysBack,
        min_priority: o.minPriority,
        min_argus_score: o.minArgusScore,
        q: o.keyword,
        limit: o.limit,
      });
      return jsonRequest<TiListCvesResponse>(url(`/cves${qs}`), baseInit, fetcher);
    },

    async getCve(cveId) {
      return jsonRequest<TiCveBody>(url(`/cves/${encodeURIComponent(cveId)}`), baseInit, fetcher);
    },

    async listKev(o = {}) {
      const qs = buildQuery({ vendor: o.vendor, limit: o.limit });
      return jsonRequest<TiListKevResponse>(url(`/kev${qs}`), baseInit, fetcher);
    },

    async listIocs(o = {}) {
      const qs = buildQuery({ category: o.category, q: o.keyword, limit: o.limit });
      return jsonRequest<TiListIocsResponse>(url(`/iocs${qs}`), baseInit, fetcher);
    },

    async getIoc(slug) {
      return jsonRequest<TiIocBody>(url(`/iocs/${encodeURIComponent(slug)}`), baseInit, fetcher);
    },

    async listSectors() {
      return jsonRequest<TiListSectorsResponse>(url('/sectors'), baseInit, fetcher);
    },

    async getSector(sector) {
      return jsonRequest<TiSectorBody>(url(`/sectors/${encodeURIComponent(sector)}`), baseInit, fetcher);
    },

    async listLists(o = {}) {
      const qs = buildQuery({ category: o.category, q: o.keyword, limit: o.limit });
      return jsonRequest<TiListListsResponse>(url(`/lists${qs}`), baseInit, fetcher);
    },

    async getList(slug, o = {}) {
      const qs = buildQuery({ q: o.keyword, severity: o.severity, limit: o.limit });
      return jsonRequest<TiDetectionListDetail>(url(`/lists/${encodeURIComponent(slug)}${qs}`), baseInit, fetcher);
    },

    async stats() {
      return jsonRequest<TiStats>(url('/stats'), baseInit, fetcher);
    },

    async searchOtx(q) {
      return jsonRequest(url(`/search/otx?q=${encodeURIComponent(q)}`), baseInit, fetcher);
    },

    async searchThreatFox(q) {
      return jsonRequest(url(`/search/threatfox?q=${encodeURIComponent(q)}`), baseInit, fetcher);
    },

    async searchMalwareBazaar(q) {
      return jsonRequest(url(`/search/malwarebazaar?q=${encodeURIComponent(q)}`), baseInit, fetcher);
    },

    async searchRansomwareLive(q) {
      return jsonRequest(url(`/search/ransomware-live?q=${encodeURIComponent(q)}`), baseInit, fetcher);
    },

    async entityGraph(limit = 150) {
      return jsonRequest(url(`/entity-graph?limit=${limit}`), baseInit, fetcher);
    },
  };
}

export const tiClient: ThreatIntelClient = createTiClient();
