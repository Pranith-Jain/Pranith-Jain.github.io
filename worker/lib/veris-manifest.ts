export interface VerisValue {
  value: string;
  label: string;
}

export interface VerisField {
  slug: string;
  path: string;
  section: string;
  category: string;
  field: string;
  values: VerisValue[];
}

export interface VerisSection {
  section: string;
  fieldCount: number;
  valueCount: number;
}

export interface VerisIndex {
  source: string;
  license: string;
  replicatedAt: string;
  count: number;
  sections: VerisSection[];
  entries: VerisField[];
}

const DATA_PREFIX = '/data/veris';

let cachedIndex: VerisIndex | null = null;
let cachedIndexAt: number | null = null;

async function fetchJson<T>(assets: Fetcher, path: string): Promise<T | null> {
  const url = `https://veris.local${path}`;
  const res = await assets.fetch(new Request(url));
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export async function loadVerisIndex(assets: Fetcher, opts: { forceRefresh?: boolean } = {}): Promise<VerisIndex> {
  if (cachedIndex && !opts.forceRefresh) return cachedIndex;
  const idx = await fetchJson<VerisIndex>(assets, `${DATA_PREFIX}/index.json`);
  if (!idx) {
    throw new Error(
      `VERIS index not found at ${DATA_PREFIX}/index.json — run 'node scripts/build-veris-manifest.mjs' first.`
    );
  }
  cachedIndex = idx;
  cachedIndexAt = Date.now();
  return idx;
}

export interface VerisListOptions {
  section?: string;
  keyword?: string;
  limit?: number;
}

export function listVeris(idx: VerisIndex, opts: VerisListOptions = {}): VerisField[] {
  const { section, keyword, limit = 50 } = opts;
  const needle = keyword?.toLowerCase();
  const out: VerisField[] = [];
  for (const e of idx.entries) {
    if (section && e.section.toLowerCase() !== section.toLowerCase()) continue;
    if (needle) {
      const hay =
        `${e.slug} ${e.path} ${e.section} ${e.category} ${e.field} ${e.values.map((v) => `${v.value} ${v.label}`).join(' ')}`.toLowerCase();
      if (!hay.includes(needle)) continue;
    }
    out.push(e);
    if (out.length >= limit) break;
  }
  return out;
}

export function getVeris(idx: VerisIndex, slug: string): VerisField | undefined {
  return idx.entries.find((e) => e.slug === slug);
}

export function verisCacheStats(): {
  indexLoaded: boolean;
  indexAgeMs: number | null;
} {
  return {
    indexLoaded: cachedIndex !== null,
    indexAgeMs: cachedIndexAt ? Date.now() - cachedIndexAt : null,
  };
}

export function _resetVerisCacheForTests(): void {
  cachedIndex = null;
  cachedIndexAt = null;
}
