export interface CapecEntry {
  slug: string;
  capecId: string;
  name: string;
  abstraction: string;
  status: string;
  likelihood: string;
  severity: string;
  domains: string[];
  description: string;
  prerequisites: string;
  cweIds: string[];
  attackIds: string[];
  url: string;
}

export interface CapecIndex {
  source: string;
  license: string;
  replicatedAt: string;
  count: number;
  byAbstraction: Record<string, number>;
  byStatus: Record<string, number>;
  entries: CapecEntry[];
}

const DATA_PREFIX = '/data/capec';

let cachedIndex: CapecIndex | null = null;
let cachedIndexAt: number | null = null;

async function fetchJson<T>(assets: Fetcher, path: string): Promise<T | null> {
  const url = `https://capec.local${path}`;
  const res = await assets.fetch(new Request(url));
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export async function loadCapecIndex(assets: Fetcher, opts: { forceRefresh?: boolean } = {}): Promise<CapecIndex> {
  if (cachedIndex && !opts.forceRefresh) return cachedIndex;
  const idx = await fetchJson<CapecIndex>(assets, `${DATA_PREFIX}/index.json`);
  if (!idx) {
    throw new Error(
      `CAPEC index not found at ${DATA_PREFIX}/index.json — run 'node scripts/build-capec-manifest.mjs' first.`
    );
  }
  cachedIndex = idx;
  cachedIndexAt = Date.now();
  return idx;
}

export interface CapecListOptions {
  abstraction?: string;
  status?: string;
  domain?: string;
  cwe?: string;
  technique?: string;
  keyword?: string;
  limit?: number;
}

export function listCapec(idx: CapecIndex, opts: CapecListOptions = {}): CapecEntry[] {
  const { abstraction, status, domain, cwe, technique, keyword, limit = 50 } = opts;
  const needle = keyword?.toLowerCase();
  const out: CapecEntry[] = [];
  for (const e of idx.entries) {
    if (abstraction && e.abstraction.toLowerCase() !== abstraction.toLowerCase()) continue;
    if (status && e.status.toLowerCase() !== status.toLowerCase()) continue;
    if (domain && !e.domains.some((d) => d.toLowerCase() === domain.toLowerCase())) continue;
    if (cwe && !e.cweIds.some((c) => c.toUpperCase() === cwe.toUpperCase())) continue;
    if (technique && !e.attackIds.includes(technique.toUpperCase())) continue;
    if (needle) {
      const hay =
        `${e.slug} ${e.capecId} ${e.name} ${e.description} ${e.prerequisites} ${e.cweIds.join(' ')}`.toLowerCase();
      if (!hay.includes(needle)) continue;
    }
    out.push(e);
    if (out.length >= limit) break;
  }
  return out;
}

export function getCapec(idx: CapecIndex, slug: string): CapecEntry | undefined {
  return idx.entries.find((e) => e.slug === slug);
}

export function capecCacheStats(): {
  indexLoaded: boolean;
  indexAgeMs: number | null;
} {
  return {
    indexLoaded: cachedIndex !== null,
    indexAgeMs: cachedIndexAt ? Date.now() - cachedIndexAt : null,
  };
}

export function _resetCapecCacheForTests(): void {
  cachedIndex = null;
  cachedIndexAt = null;
}
