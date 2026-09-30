/**
 * Manifest loader for the AI Security Playbook taxonomy index.
 *
 * Scope: STRUCTURE ONLY. Upstream (aisecurity.zone) declares no reuse licence,
 * so this vertical replicates the 8-layer system structure, the 20 risk
 * identifiers (OWASP LLM01-10 + the author's ASI01-10) and public CVE
 * identifiers — and nothing else. No chapter prose, no diagrams, no bodies.
 * Every record deep-links to the original. See scripts/build-ai-playbook.mjs
 * for the full licensing rationale.
 *
 * Companion verticals: `cairn`, `nova` and `denali` carry executable detection
 * logic (their engines). This one is the taxonomy layer — how a finding gets
 * named, which division of the stack it belongs to, and where to read more.
 */

const DATA_PREFIX = '/data/ai-playbook';
const MANIFEST_PATH = `${DATA_PREFIX}/index.json`;

export interface AiPlaybookLayer {
  id: string;
  name: string;
  slug: string;
  chapters: number;
  summary: string;
  url: string;
  riskIds: string[];
}

export interface AiPlaybookRiskId {
  id: string;
  name: string;
  /** 'owasp-llm' = OWASP Top 10 for LLM Applications; 'agentic-asi' = the author's agentic taxonomy. */
  scheme: 'owasp-llm' | 'agentic-asi';
  /** Which of the 8 divisions defines this identifier. */
  layer: string;
  layerName: string | null;
  url: string;
}

export interface AiPlaybookIndex {
  source: string;
  sourceUrl: string;
  author: string;
  license: string;
  licenseNote: string;
  replicatedAt: string;
  scope: string;
  structureVerifiedAt: string | null;
  counts: {
    layers: number;
    chapters: number;
    riskIds: number;
    owaspLlm: number;
    agenticAsi: number;
    cveRefs: number;
  };
  layers: AiPlaybookLayer[];
  riskIds: AiPlaybookRiskId[];
  cveRefs: string[];
}

/** A CVE reference enriched from our own synced CISA KEV feed, never from upstream. */
export interface EnrichedCveRef {
  cveId: string;
  /** True when the CVE is in our local KEV snapshot (public/data/threat-intel/cves/kev.json). */
  kev: boolean;
  vendor: string | null;
  product: string | null;
  name: string | null;
  dateAdded: string | null;
  dueDate: string | null;
}

let cached: AiPlaybookIndex | null = null;
let cachedAt = 0;
const TTL_MS = 10 * 60 * 1000;

export function aiPlaybookCacheStats(): { loaded: boolean; ageMs: number } {
  return { loaded: cached !== null, ageMs: cached ? Date.now() - cachedAt : -1 };
}

/** Test hook — forces the next load to refetch. */
export function resetAiPlaybookCache(): void {
  cached = null;
  cachedAt = 0;
}

export async function loadAiPlaybookIndex(
  assets: Fetcher,
  opts: { forceRefresh?: boolean } = {}
): Promise<AiPlaybookIndex> {
  if (cached && !opts.forceRefresh && Date.now() - cachedAt < TTL_MS) return cached;
  const res = await assets.fetch(new Request(`https://ai-playbook.local${MANIFEST_PATH}`));
  if (!res.ok) {
    throw new Error(
      `AI Security Playbook index not found at ${MANIFEST_PATH} — run 'node scripts/build-ai-playbook.mjs' first.`
    );
  }
  const idx = (await res.json()) as AiPlaybookIndex;
  cached = idx;
  cachedAt = Date.now();
  return idx;
}

/** The 8 system layers, in order I..VIII. */
export async function listAiPlaybookLayers(assets: Fetcher): Promise<AiPlaybookLayer[]> {
  return (await loadAiPlaybookIndex(assets)).layers;
}

export async function getAiPlaybookLayer(
  assets: Fetcher,
  idOrSlug: string
): Promise<AiPlaybookLayer | null> {
  const { layers } = await loadAiPlaybookIndex(assets);
  const key = idOrSlug.toLowerCase();
  return layers.find((l) => l.id.toLowerCase() === key || l.slug.toLowerCase() === key) ?? null;
}

export interface AiPlaybookRiskOptions {
  scheme?: 'owasp-llm' | 'agentic-asi';
  layer?: string;
  q?: string;
  limit?: number;
}

/** Filter the risk identifiers. All filters are ANDed; `q` matches id or name. */
export async function filterAiPlaybookRiskIds(
  assets: Fetcher,
  opts: AiPlaybookRiskOptions = {}
): Promise<AiPlaybookRiskId[]> {
  const { riskIds } = await loadAiPlaybookIndex(assets);
  const q = opts.q?.trim().toLowerCase();
  let out = riskIds;
  if (opts.scheme) out = out.filter((r) => r.scheme === opts.scheme);
  if (opts.layer) {
    const key = opts.layer.toLowerCase();
    out = out.filter((r) => r.layer.toLowerCase() === key);
  }
  if (q) out = out.filter((r) => r.id.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
  if (opts.limit && opts.limit > 0) out = out.slice(0, opts.limit);
  return out;
}

export async function getAiPlaybookRiskId(
  assets: Fetcher,
  id: string
): Promise<AiPlaybookRiskId | null> {
  const { riskIds } = await loadAiPlaybookIndex(assets);
  const key = id.trim().toUpperCase();
  return riskIds.find((r) => r.id.toUpperCase() === key) ?? null;
}

/**
 * Look up our local CISA KEV snapshot. Deliberately NOT fetched from upstream:
 * the playbook's CVE references are public facts, but all enrichment (vendor,
 * dates, due date, KEV status) comes from our own already-synced feed so the two
 * never disagree. Returns null when the manifest itself is unavailable — the
 * caller degrades to "reference only" rather than erroring.
 */
async function loadKevMap(assets: Fetcher): Promise<Map<string, Record<string, string>>> {
  const res = await assets.fetch(new Request('https://ai-playbook.local/data/threat-intel/cves/kev.json'));
  if (!res.ok) return new Map();
  try {
    const raw = (await res.json()) as unknown;
    const arr = Array.isArray(raw)
      ? raw
      : Array.isArray((raw as { vulnerabilities?: unknown[] }).vulnerabilities)
        ? ((raw as { vulnerabilities: unknown[] }).vulnerabilities as Record<string, string>[])
        : [];
    const map = new Map<string, Record<string, string>>();
    for (const v of arr) {
      const id = (v as { cveId?: string }).cveId;
      if (id) map.set(id, v as Record<string, string>);
    }
    return map;
  } catch {
    return new Map();
  }
}

/**
 * Join the observed CVE references against our KEV feed so a reader can see at a
 * glance which referenced vulnerabilities are known-exploited.
 */
export async function getAiPlaybookCveRefs(assets: Fetcher): Promise<EnrichedCveRef[]> {
  const idx = await loadAiPlaybookIndex(assets);
  const kev = await loadKevMap(assets);
  return idx.cveRefs.map((cveId) => {
    const hit = kev.get(cveId);
    return {
      cveId,
      kev: hit !== undefined,
      vendor: hit?.vendor ?? null,
      product: hit?.product ?? null,
      name: hit?.name ?? null,
      dateAdded: hit?.dateAdded ?? null,
      dueDate: hit?.dueDate ?? null,
    };
  });
}

/** Which risk identifiers name this layer — convenience for the layer view. */
export function riskIdsForLayer(idx: AiPlaybookIndex, layerId: string): AiPlaybookRiskId[] {
  const key = layerId.toLowerCase();
  return idx.riskIds.filter((r) => r.layer.toLowerCase() === key);
}

export interface AiPlaybookStats {
  layers: number;
  chapters: number;
  riskIds: number;
  owaspLlm: number;
  agenticAsi: number;
  cveRefs: number;
  kevMatched: number;
  replicatedAt: string;
  structureVerifiedAt: string | null;
  scope: string;
  cached: boolean;
  cacheAgeMs: number;
}

/** Counts + cache state for the MCP `stats` tool and the SPA header. */
export async function aiPlaybookStats(assets: Fetcher): Promise<AiPlaybookStats> {
  const idx = await loadAiPlaybookIndex(assets);
  const refs = await getAiPlaybookCveRefs(assets);
  return {
    ...idx.counts,
    kevMatched: refs.filter((r) => r.kev).length,
    replicatedAt: idx.replicatedAt,
    structureVerifiedAt: idx.structureVerifiedAt,
    scope: idx.scope,
    cached: cached !== null,
    cacheAgeMs: cached ? Date.now() - cachedAt : -1,
  };
}