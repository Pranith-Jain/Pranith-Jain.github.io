export interface EngageGoal {
  name: string;
  phase: string;
  topGoal: string;
}

export interface EngageApproach {
  slug: string;
  name: string;
  goal: string;
  phase: string;
  topGoal: string;
  url: string;
}

export interface EngageIndex {
  source: string;
  license: string;
  replicatedAt: string;
  count: number;
  phases: string[];
  goals: EngageGoal[];
  approaches: EngageApproach[];
}

const DATA_PREFIX = '/data/engage';

let cachedIndex: EngageIndex | null = null;
let cachedIndexAt: number | null = null;

async function fetchJson<T>(assets: Fetcher, path: string): Promise<T | null> {
  const url = `https://engage.local${path}`;
  const res = await assets.fetch(new Request(url));
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export async function loadEngageIndex(assets: Fetcher, opts: { forceRefresh?: boolean } = {}): Promise<EngageIndex> {
  if (cachedIndex && !opts.forceRefresh) return cachedIndex;
  const idx = await fetchJson<EngageIndex>(assets, `${DATA_PREFIX}/index.json`);
  if (!idx) {
    throw new Error(
      `Engage index not found at ${DATA_PREFIX}/index.json — run 'node scripts/build-engage-manifest.mjs' first.`
    );
  }
  cachedIndex = idx;
  cachedIndexAt = Date.now();
  return idx;
}

export interface EngageListOptions {
  goal?: string;
  phase?: string;
  keyword?: string;
  limit?: number;
}

export function listEngage(idx: EngageIndex, opts: EngageListOptions = {}): EngageApproach[] {
  const { goal, phase, keyword, limit = 50 } = opts;
  const needle = keyword?.toLowerCase();
  const out: EngageApproach[] = [];
  for (const a of idx.approaches) {
    if (goal && a.goal.toLowerCase() !== goal.toLowerCase() && a.topGoal.toLowerCase() !== goal.toLowerCase()) continue;
    if (phase && a.phase.toLowerCase() !== phase.toLowerCase()) continue;
    if (needle) {
      const hay = `${a.slug} ${a.name} ${a.goal} ${a.phase} ${a.topGoal}`.toLowerCase();
      if (!hay.includes(needle)) continue;
    }
    out.push(a);
    if (out.length >= limit) break;
  }
  return out;
}

export function getEngage(idx: EngageIndex, slug: string): EngageApproach | undefined {
  return idx.approaches.find((a) => a.slug === slug);
}

export function engageCacheStats(): {
  indexLoaded: boolean;
  indexAgeMs: number | null;
} {
  return {
    indexLoaded: cachedIndex !== null,
    indexAgeMs: cachedIndexAt ? Date.now() - cachedIndexAt : null,
  };
}

export function _resetEngageCacheForTests(): void {
  cachedIndex = null;
  cachedIndexAt = null;
}
