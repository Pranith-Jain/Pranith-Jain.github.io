export type CtiBookmarkLevel = 'Operational' | 'Tactical' | 'Strategic' | 'Tools';

export type CtiBookmarkStatus = 'live' | 'reference' | 'missing';

export interface CtiBookmarkEntry {
  slug: string;
  name: string;
  url: string;
  host: string;
  level: string;
  category: string;
  description: string;
  status: CtiBookmarkStatus;
  platformRef: string | null;
  tags: string[];
}

export interface CtiBookmarksCategory {
  level: string;
  category: string;
  count: number;
}

export interface CtiBookmarksIndex {
  source: string;
  license: string;
  replicatedAt: string;
  count: number;
  levels: string[];
  categories: CtiBookmarksCategory[];
  statusCounts: Record<CtiBookmarkStatus, number>;
  entries: CtiBookmarkEntry[];
}

const DATA_PREFIX = '/data/cti-bookmarks';

let cachedIndex: CtiBookmarksIndex | null = null;
let cachedIndexAt: number | null = null;

async function fetchJson<T>(assets: Fetcher, path: string): Promise<T | null> {
  const url = `https://cti-bookmarks.local${path}`;
  const res = await assets.fetch(new Request(url));
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export async function loadCtiBookmarksIndex(
  assets: Fetcher,
  opts: { forceRefresh?: boolean } = {}
): Promise<CtiBookmarksIndex> {
  if (cachedIndex && !opts.forceRefresh) return cachedIndex;
  const idx = await fetchJson<CtiBookmarksIndex>(assets, `${DATA_PREFIX}/index.json`);
  if (!idx) {
    throw new Error(
      `CTI bookmarks index not found at ${DATA_PREFIX}/index.json — run 'node scripts/build-cti-bookmarks.mjs' first.`
    );
  }
  cachedIndex = idx;
  cachedIndexAt = Date.now();
  return idx;
}

export interface CtiBookmarksListOptions {
  level?: string;
  category?: string;
  status?: CtiBookmarkStatus;
  keyword?: string;
  limit?: number;
}

export function listBookmarks(idx: CtiBookmarksIndex, opts: CtiBookmarksListOptions = {}): CtiBookmarkEntry[] {
  const { level, category, status, keyword, limit = 50 } = opts;
  const needle = keyword?.toLowerCase();
  const out: CtiBookmarkEntry[] = [];
  for (const e of idx.entries) {
    if (level && e.level !== level) continue;
    if (category && e.category !== category) continue;
    if (status && e.status !== status) continue;
    if (needle) {
      const hay = `${e.slug} ${e.name} ${e.description} ${e.host} ${e.tags.join(' ')}`.toLowerCase();
      if (!hay.includes(needle)) continue;
    }
    out.push(e);
    if (out.length >= limit) break;
  }
  return out;
}

export function getBookmark(idx: CtiBookmarksIndex, slug: string): CtiBookmarkEntry | undefined {
  return idx.entries.find((e) => e.slug === slug);
}

export function ctiBookmarksCacheStats(): {
  indexLoaded: boolean;
  indexAgeMs: number | null;
} {
  return {
    indexLoaded: cachedIndex !== null,
    indexAgeMs: cachedIndexAt ? Date.now() - cachedIndexAt : null,
  };
}

export function _resetCtiBookmarksCacheForTests(): void {
  cachedIndex = null;
  cachedIndexAt = null;
}
