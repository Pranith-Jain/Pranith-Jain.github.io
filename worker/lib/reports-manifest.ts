export type ReportCategory = 'annual-threat-report' | 'reference' | 'framework' | 'standard' | 'learning' | 'whitepaper' | 'research';

export interface ReportEntry {
  slug: string;
  title: string;
  url: string;
  category: ReportCategory;
  publisher: string;
  year: number;
  description: string;
  tags: string[];
  sizeBytes: number;
}

export interface ReportsIndex {
  source: string;
  license: string;
  replicatedAt: string;
  count: number;
  entries: ReportEntry[];
}

const DATA_PREFIX = '/data/reports';

let cachedIndex: ReportsIndex | null = null;
let cachedIndexAt: number | null = null;

async function fetchJson<T>(assets: Fetcher, path: string): Promise<T | null> {
  const url = `https://reports.local${path}`;
  const res = await assets.fetch(new Request(url));
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export async function loadReportsIndex(assets: Fetcher, opts: { forceRefresh?: boolean } = {}): Promise<ReportsIndex> {
  if (cachedIndex && !opts.forceRefresh) return cachedIndex;
  const idx = await fetchJson<ReportsIndex>(assets, `${DATA_PREFIX}/index.json`);
  if (!idx) {
    throw new Error(
      `Reports index not found at ${DATA_PREFIX}/index.json — run 'node scripts/build-reports-manifest.mjs' first.`
    );
  }
  cachedIndex = idx;
  cachedIndexAt = Date.now();
  return idx;
}

export interface ReportsListOptions {
  category?: ReportCategory;
  keyword?: string;
  year?: number;
  publisher?: string;
  limit?: number;
}

export function listReports(idx: ReportsIndex, opts: ReportsListOptions = {}): ReportEntry[] {
  const { category, keyword, year, publisher, limit = 50 } = opts;
  const needle = keyword?.toLowerCase();
  const pubNeedle = publisher?.toLowerCase();
  const out: ReportEntry[] = [];
  for (const r of idx.entries) {
    if (category && r.category !== category) continue;
    if (year && r.year !== year) continue;
    if (pubNeedle && !r.publisher.toLowerCase().includes(pubNeedle)) continue;
    if (needle) {
      const hay = `${r.slug} ${r.title} ${r.publisher} ${r.description} ${r.tags.join(' ')}`.toLowerCase();
      if (!hay.includes(needle)) continue;
    }
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}

export function getReport(idx: ReportsIndex, slug: string): ReportEntry | undefined {
  return idx.entries.find((r) => r.slug === slug);
}

export function reportsCacheStats(): {
  indexLoaded: boolean;
  indexAgeMs: number | null;
} {
  return {
    indexLoaded: cachedIndex !== null,
    indexAgeMs: cachedIndexAt ? Date.now() - cachedIndexAt : null,
  };
}

export function _resetReportsCacheForTests(): void {
  cachedIndex = null;
  cachedIndexAt = null;
}
