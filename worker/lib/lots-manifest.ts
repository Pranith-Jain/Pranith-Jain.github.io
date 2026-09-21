export interface LotsEntry {
  slug: string;
  website: string;
  provider: string;
  tags: string[];
  description: string;
  url: string;
}

export interface LotsIndex {
  source: string;
  license: string;
  replicatedAt: string;
  count: number;
  tags: string[];
  tagCounts: Record<string, number>;
  entries: LotsEntry[];
}

const DATA_PREFIX = '/data/lots';

let cachedIndex: LotsIndex | null = null;
let cachedIndexAt: number | null = null;

async function fetchJson<T>(assets: Fetcher, path: string): Promise<T | null> {
  const url = `https://lots.local${path}`;
  const res = await assets.fetch(new Request(url));
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export async function loadLotsIndex(assets: Fetcher, opts: { forceRefresh?: boolean } = {}): Promise<LotsIndex> {
  if (cachedIndex && !opts.forceRefresh) return cachedIndex;
  const idx = await fetchJson<LotsIndex>(assets, `${DATA_PREFIX}/index.json`);
  if (!idx) {
    throw new Error(
      `LOTS index not found at ${DATA_PREFIX}/index.json — run 'node scripts/build-lots-manifest.mjs' first.`
    );
  }
  cachedIndex = idx;
  cachedIndexAt = Date.now();
  return idx;
}

export interface LotsListOptions {
  tag?: string;
  provider?: string;
  keyword?: string;
  limit?: number;
}

export function listLots(idx: LotsIndex, opts: LotsListOptions = {}): LotsEntry[] {
  const { tag, provider, keyword, limit = 50 } = opts;
  const needle = keyword?.toLowerCase();
  const out: LotsEntry[] = [];
  for (const e of idx.entries) {
    if (tag && !e.tags.includes(tag)) continue;
    if (provider && e.provider.toLowerCase() !== provider.toLowerCase()) continue;
    if (needle) {
      const hay = `${e.slug} ${e.website} ${e.provider} ${e.description} ${e.tags.join(' ')}`.toLowerCase();
      if (!hay.includes(needle)) continue;
    }
    out.push(e);
    if (out.length >= limit) break;
  }
  return out;
}

export function getLots(idx: LotsIndex, slug: string): LotsEntry | undefined {
  return idx.entries.find((e) => e.slug === slug);
}

export function lotsCacheStats(): {
  indexLoaded: boolean;
  indexAgeMs: number | null;
} {
  return {
    indexLoaded: cachedIndex !== null,
    indexAgeMs: cachedIndexAt ? Date.now() - cachedIndexAt : null,
  };
}

export function _resetLotsCacheForTests(): void {
  cachedIndex = null;
  cachedIndexAt = null;
}
