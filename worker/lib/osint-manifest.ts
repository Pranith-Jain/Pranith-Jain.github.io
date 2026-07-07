export type OsintCategory = 'threat-intel' | 'paste-monitoring' | 'dark-web' | 'reputation' | 'certificate' | 'dns' | 'domain' | 'ip' | 'hash' | 'email' | 'username' | 'social-media' | 'phone' | 'crypto' | 'breach' | 'whois' | 'forensics' | 'misc';

export interface OsintPortalEntry {
  slug: string;
  name: string;
  url: string;
  category: OsintCategory;
  description: string;
  isFree: boolean;
  requiresRegistration: boolean;
  apiAvailable: boolean;
  tags: string[];
  sizeBytes: number;
}

export interface OsintIndex {
  source: string;
  license: string;
  replicatedAt: string;
  count: number;
  entries: OsintPortalEntry[];
}

const DATA_PREFIX = '/data/osint';

let cachedIndex: OsintIndex | null = null;
let cachedIndexAt: number | null = null;

async function fetchJson<T>(assets: Fetcher, path: string): Promise<T | null> {
  const url = `https://osint.local${path}`;
  const res = await assets.fetch(new Request(url));
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export async function loadOsintIndex(assets: Fetcher, opts: { forceRefresh?: boolean } = {}): Promise<OsintIndex> {
  if (cachedIndex && !opts.forceRefresh) return cachedIndex;
  const idx = await fetchJson<OsintIndex>(assets, `${DATA_PREFIX}/index.json`);
  if (!idx) {
    throw new Error(
      `OSINT index not found at ${DATA_PREFIX}/index.json — run 'node scripts/build-osint-manifest.mjs' first.`
    );
  }
  cachedIndex = idx;
  cachedIndexAt = Date.now();
  return idx;
}

export interface OsintListOptions {
  category?: OsintCategory;
  keyword?: string;
  freeOnly?: boolean;
  limit?: number;
}

export function listPortals(idx: OsintIndex, opts: OsintListOptions = {}): OsintPortalEntry[] {
  const { category, keyword, freeOnly, limit = 50 } = opts;
  const needle = keyword?.toLowerCase();
  const out: OsintPortalEntry[] = [];
  for (const p of idx.entries) {
    if (category && p.category !== category) continue;
    if (freeOnly && !p.isFree) continue;
    if (needle) {
      const hay = `${p.slug} ${p.name} ${p.description} ${p.tags.join(' ')}`.toLowerCase();
      if (!hay.includes(needle)) continue;
    }
    out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}

export function getPortal(idx: OsintIndex, slug: string): OsintPortalEntry | undefined {
  return idx.entries.find((p) => p.slug === slug);
}

export function osintCacheStats(): {
  indexLoaded: boolean;
  indexAgeMs: number | null;
} {
  return {
    indexLoaded: cachedIndex !== null,
    indexAgeMs: cachedIndexAt ? Date.now() - cachedIndexAt : null,
  };
}

export function _resetOsintCacheForTests(): void {
  cachedIndex = null;
  cachedIndexAt = null;
}
