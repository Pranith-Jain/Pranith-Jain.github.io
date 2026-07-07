export type CampaignStatus = 'active' | 'dormant' | 'concluded';
export type CampaignCategory = 'ransomware' | 'apt' | 'malware' | 'phishing' | 'c2' | 'supply-chain' | 'cyber-espionage' | 'hacktivism' | 'other';

export interface CampaignEntry {
  slug: string;
  name: string;
  status: CampaignStatus;
  category: CampaignCategory;
  actor?: string;
  firstSeen: string;
  lastUpdated: string;
  description: string;
  writeups: { title: string; url: string }[];
  targets?: string[];
  geography?: string[];
  ttps?: string[];
  tags: string[];
  sizeBytes: number;
}

export interface CampaignsIndex {
  source: string;
  license: string;
  replicatedAt: string;
  count: number;
  entries: CampaignEntry[];
}

const DATA_PREFIX = '/data/campaigns';

let cachedIndex: CampaignsIndex | null = null;
let cachedIndexAt: number | null = null;

async function fetchJson<T>(assets: Fetcher, path: string): Promise<T | null> {
  const url = `https://campaigns.local${path}`;
  const res = await assets.fetch(new Request(url));
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export async function loadCampaignsIndex(assets: Fetcher, opts: { forceRefresh?: boolean } = {}): Promise<CampaignsIndex> {
  if (cachedIndex && !opts.forceRefresh) return cachedIndex;
  const idx = await fetchJson<CampaignsIndex>(assets, `${DATA_PREFIX}/index.json`);
  if (!idx) {
    throw new Error(
      `Campaigns index not found at ${DATA_PREFIX}/index.json — run 'node scripts/build-campaigns-manifest.mjs' first.`
    );
  }
  cachedIndex = idx;
  cachedIndexAt = Date.now();
  return idx;
}

export interface CampaignListOptions {
  status?: CampaignStatus;
  category?: CampaignCategory;
  keyword?: string;
  limit?: number;
}

export function listCampaigns(idx: CampaignsIndex, opts: CampaignListOptions = {}): CampaignEntry[] {
  const { status, category, keyword, limit = 50 } = opts;
  const needle = keyword?.toLowerCase();
  const out: CampaignEntry[] = [];
  for (const c of idx.entries) {
    if (status && c.status !== status) continue;
    if (category && c.category !== category) continue;
    if (needle) {
      const hay = `${c.slug} ${c.name} ${c.description} ${c.tags.join(' ')} ${c.actor ?? ''}`.toLowerCase();
      if (!hay.includes(needle)) continue;
    }
    out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}

export function getCampaign(idx: CampaignsIndex, slug: string): CampaignEntry | undefined {
  return idx.entries.find((c) => c.slug === slug);
}

export function campaignsCacheStats(): {
  indexLoaded: boolean;
  indexAgeMs: number | null;
} {
  return {
    indexLoaded: cachedIndex !== null,
    indexAgeMs: cachedIndexAt ? Date.now() - cachedIndexAt : null,
  };
}

export function _resetCampaignsCacheForTests(): void {
  cachedIndex = null;
  cachedIndexAt = null;
}
