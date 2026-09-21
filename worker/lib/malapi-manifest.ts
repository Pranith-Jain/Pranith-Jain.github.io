export interface MalapiEntry {
  slug: string;
  name: string;
  library: string;
  categories: string[];
  associatedAttacks: string[];
  description: string;
  documentation: string;
  url: string;
}

export interface MalapiIndex {
  source: string;
  license: string;
  replicatedAt: string;
  count: number;
  categories: string[];
  entries: MalapiEntry[];
}

const DATA_PREFIX = '/data/malapi';

let cachedIndex: MalapiIndex | null = null;
let cachedIndexAt: number | null = null;

async function fetchJson<T>(assets: Fetcher, path: string): Promise<T | null> {
  const url = `https://malapi.local${path}`;
  const res = await assets.fetch(new Request(url));
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export async function loadMalapiIndex(assets: Fetcher, opts: { forceRefresh?: boolean } = {}): Promise<MalapiIndex> {
  if (cachedIndex && !opts.forceRefresh) return cachedIndex;
  const idx = await fetchJson<MalapiIndex>(assets, `${DATA_PREFIX}/index.json`);
  if (!idx) {
    throw new Error(
      `MalAPI index not found at ${DATA_PREFIX}/index.json — run 'node scripts/build-malapi-manifest.mjs' first.`
    );
  }
  cachedIndex = idx;
  cachedIndexAt = Date.now();
  return idx;
}

export interface MalapiListOptions {
  category?: string;
  library?: string;
  keyword?: string;
  limit?: number;
}

export function listMalapi(idx: MalapiIndex, opts: MalapiListOptions = {}): MalapiEntry[] {
  const { category, library, keyword, limit = 50 } = opts;
  const needle = keyword?.toLowerCase();
  const out: MalapiEntry[] = [];
  for (const e of idx.entries) {
    if (category && !e.categories.includes(category)) continue;
    if (library && e.library.toLowerCase() !== library.toLowerCase()) continue;
    if (needle) {
      const hay =
        `${e.slug} ${e.name} ${e.library} ${e.description} ${e.categories.join(' ')} ${e.associatedAttacks.join(' ')}`.toLowerCase();
      if (!hay.includes(needle)) continue;
    }
    out.push(e);
    if (out.length >= limit) break;
  }
  return out;
}

export function getMalapi(idx: MalapiIndex, slug: string): MalapiEntry | undefined {
  return idx.entries.find((e) => e.slug === slug);
}

export function malapiCacheStats(): {
  indexLoaded: boolean;
  indexAgeMs: number | null;
} {
  return {
    indexLoaded: cachedIndex !== null,
    indexAgeMs: cachedIndexAt ? Date.now() - cachedIndexAt : null,
  };
}

export function _resetMalapiCacheForTests(): void {
  cachedIndex = null;
  cachedIndexAt = null;
}
