export interface HijacklibExecutable {
  path: string;
  type: string;
}

export interface HijacklibEntry {
  slug: string;
  dll: string;
  vendor: string;
  cve: string | null;
  hijackTypes: string[];
  executableCount: number;
  executables: HijacklibExecutable[];
  expectedLocations: string[];
  resourceCount: number;
  description: string;
  url: string;
}

export interface HijacklibIndex {
  source: string;
  license: string;
  replicatedAt: string;
  count: number;
  hijackTypes: string[];
  typeCounts: Record<string, number>;
  withCve: number;
  entries: HijacklibEntry[];
}

const DATA_PREFIX = '/data/hijacklibs';

let cachedIndex: HijacklibIndex | null = null;
let cachedIndexAt: number | null = null;

async function fetchJson<T>(assets: Fetcher, path: string): Promise<T | null> {
  const url = `https://hijacklibs.local${path}`;
  const res = await assets.fetch(new Request(url));
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export async function loadHijacklibsIndex(
  assets: Fetcher,
  opts: { forceRefresh?: boolean } = {}
): Promise<HijacklibIndex> {
  if (cachedIndex && !opts.forceRefresh) return cachedIndex;
  const idx = await fetchJson<HijacklibIndex>(assets, `${DATA_PREFIX}/index.json`);
  if (!idx) {
    throw new Error(
      `HijackLibs index not found at ${DATA_PREFIX}/index.json — run 'node scripts/build-hijacklibs-manifest.mjs' first.`
    );
  }
  cachedIndex = idx;
  cachedIndexAt = Date.now();
  return idx;
}

export interface HijacklibsListOptions {
  type?: string;
  vendor?: string;
  cveOnly?: boolean;
  keyword?: string;
  limit?: number;
}

export function listHijacklibs(idx: HijacklibIndex, opts: HijacklibsListOptions = {}): HijacklibEntry[] {
  const { type, vendor, cveOnly, keyword, limit = 50 } = opts;
  const needle = keyword?.toLowerCase();
  const out: HijacklibEntry[] = [];
  for (const e of idx.entries) {
    if (type && !e.hijackTypes.some((t) => t.toLowerCase() === type.toLowerCase())) continue;
    if (vendor && e.vendor.toLowerCase() !== vendor.toLowerCase()) continue;
    if (cveOnly && !e.cve) continue;
    if (needle) {
      const hay =
        `${e.slug} ${e.dll} ${e.vendor} ${e.cve ?? ''} ${e.description} ${e.hijackTypes.join(' ')}`.toLowerCase();
      if (!hay.includes(needle)) continue;
    }
    out.push(e);
    if (out.length >= limit) break;
  }
  return out;
}

export function getHijacklib(idx: HijacklibIndex, slug: string): HijacklibEntry | undefined {
  return idx.entries.find((e) => e.slug === slug);
}

export function hijacklibsCacheStats(): {
  indexLoaded: boolean;
  indexAgeMs: number | null;
} {
  return {
    indexLoaded: cachedIndex !== null,
    indexAgeMs: cachedIndexAt ? Date.now() - cachedIndexAt : null,
  };
}

export function _resetHijacklibsCacheForTests(): void {
  cachedIndex = null;
  cachedIndexAt = null;
}
