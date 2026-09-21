export interface CarTechniqueCoverage {
  technique: string;
  tactics: string[];
  subtechniques: string[];
  coverage: string;
}

export interface CarEntry {
  slug: string;
  carId: string;
  title: string;
  description: string;
  domain: string;
  platforms: string[];
  analyticTypes: string[];
  techniques: CarTechniqueCoverage[];
  techniqueIds: string[];
  d3fend: { id: string; label: string }[];
  implementations: string[];
  references: string[];
  url: string;
}

export interface CarIndex {
  source: string;
  license: string;
  replicatedAt: string;
  count: number;
  techniqueCount: number;
  entries: CarEntry[];
}

const DATA_PREFIX = '/data/car';

let cachedIndex: CarIndex | null = null;
let cachedIndexAt: number | null = null;

async function fetchJson<T>(assets: Fetcher, path: string): Promise<T | null> {
  const url = `https://car.local${path}`;
  const res = await assets.fetch(new Request(url));
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export async function loadCarIndex(assets: Fetcher, opts: { forceRefresh?: boolean } = {}): Promise<CarIndex> {
  if (cachedIndex && !opts.forceRefresh) return cachedIndex;
  const idx = await fetchJson<CarIndex>(assets, `${DATA_PREFIX}/index.json`);
  if (!idx) {
    throw new Error(
      `CAR index not found at ${DATA_PREFIX}/index.json — run 'node scripts/build-car-manifest.mjs' first.`
    );
  }
  cachedIndex = idx;
  cachedIndexAt = Date.now();
  return idx;
}

export interface CarListOptions {
  technique?: string;
  platform?: string;
  keyword?: string;
  limit?: number;
}

export function listCar(idx: CarIndex, opts: CarListOptions = {}): CarEntry[] {
  const { technique, platform, keyword, limit = 50 } = opts;
  const needle = keyword?.toLowerCase();
  const out: CarEntry[] = [];
  for (const e of idx.entries) {
    if (technique && !e.techniqueIds.includes(technique.toUpperCase())) continue;
    if (platform && !e.platforms.some((p) => p.toLowerCase() === platform.toLowerCase())) continue;
    if (needle) {
      const hay =
        `${e.slug} ${e.carId} ${e.title} ${e.description} ${e.techniqueIds.join(' ')} ${e.implementations.join(' ')}`.toLowerCase();
      if (!hay.includes(needle)) continue;
    }
    out.push(e);
    if (out.length >= limit) break;
  }
  return out;
}

export function getCar(idx: CarIndex, slug: string): CarEntry | undefined {
  return idx.entries.find((e) => e.slug === slug);
}

export function carCacheStats(): {
  indexLoaded: boolean;
  indexAgeMs: number | null;
} {
  return {
    indexLoaded: cachedIndex !== null,
    indexAgeMs: cachedIndexAt ? Date.now() - cachedIndexAt : null,
  };
}

export function _resetCarCacheForTests(): void {
  cachedIndex = null;
  cachedIndexAt = null;
}
