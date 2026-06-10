/**
 * Manifold Markets prediction client (read-only).
 *
 * Pulls open binary markets from the public Manifold API
 * (https://api.manifold.markets/v0/search-markets — free, no auth) for three
 * topic buckets relevant to this platform: cyber-threat, tech, and AI. The
 * bucket is decided by WHICH curated search term surfaced the market (no
 * fragile keyword re-classification), deduped across buckets by precedence
 * (cyber > ai > tech), ranked by liquidity, capped per bucket.
 *
 * Fail-soft by contract: any upstream/parse failure yields empty buckets, so
 * the route returns 200 rather than a 500.
 *
 * (Replaces the earlier Polymarket integration — Polymarket's public data is
 * ~all politics/sports and has effectively no cyber/tech/AI markets. Manifold
 * is play-money but genuinely covers AI-safety, cyber, and tech forecasting.)
 */

const SEARCH = 'https://api.manifold.markets/v0/search-markets';
const PER_BUCKET = 15;
const PER_TERM_LIMIT = 25;
const MIN_LIQUIDITY = 50; // drop dead/no-stakes markets
const TIMEOUT_MS = 12_000;

export type Bucket = 'cyber' | 'tech' | 'ai';

export interface PredictionOutcome {
  name: string;
  price: number;
}

export interface PredictionMarket {
  question: string;
  slug: string;
  url: string;
  probability: number; // 0..1
  outcomes: PredictionOutcome[];
  volume: number;
  liquidity: number;
  end_date: string | null;
  bucket: Bucket;
  tags: string[];
}

export interface PredictionBuckets {
  cyber: PredictionMarket[];
  tech: PredictionMarket[];
  ai: PredictionMarket[];
}

// Curated search terms per bucket. Precedence on a cross-bucket dup: cyber > ai > tech.
const BUCKET_TERMS: Record<Bucket, string[]> = {
  cyber: ['cybersecurity', 'ransomware', 'data breach'],
  ai: ['AI', 'OpenAI', 'AGI'],
  tech: ['semiconductor', 'SpaceX', 'quantum computing'],
};
const BUCKET_ORDER: Bucket[] = ['cyber', 'ai', 'tech'];

/** Raw Manifold market — only the fields we read. */
interface RawMarket {
  id?: string;
  question?: string;
  slug?: string;
  url?: string;
  probability?: number;
  volume?: number;
  totalLiquidity?: number;
  closeTime?: number; // ms epoch
  outcomeType?: string;
  isResolved?: boolean;
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function normalizeMarket(m: RawMarket, bucket: Bucket): PredictionMarket | null {
  const question = (m.question ?? '').trim();
  const url = (m.url ?? (m.slug ? `https://manifold.markets/market/${m.slug}` : '')).trim();
  if (!question || !url) return null;
  const probability = Math.min(1, Math.max(0, num(m.probability)));
  return {
    question,
    slug: m.slug ?? '',
    url,
    probability,
    outcomes: [
      { name: 'Yes', price: probability },
      { name: 'No', price: 1 - probability },
    ],
    volume: Math.round(num(m.volume)),
    liquidity: Math.round(num(m.totalLiquidity)),
    end_date: m.closeTime ? new Date(m.closeTime).toISOString() : null,
    bucket,
    tags: [],
  };
}

/** A market is eligible if it's an open, unresolved binary market with real liquidity. */
function eligible(m: RawMarket): boolean {
  return (
    m.outcomeType === 'BINARY' &&
    m.isResolved !== true &&
    typeof m.probability === 'number' &&
    num(m.totalLiquidity) >= MIN_LIQUIDITY
  );
}

async function searchTerm(term: string): Promise<RawMarket[]> {
  const url = `${SEARCH}?term=${encodeURIComponent(term)}&filter=open&sort=liquidity&limit=${PER_TERM_LIMIT}`;
  try {
    const res = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'pranithjain-dfir/1.0' },
      cf: { cacheTtl: 600, cacheEverything: true },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as RawMarket[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** Fetch all buckets from Manifold and assemble. Fail-soft → empty buckets. */
export async function fetchPredictions(): Promise<PredictionBuckets> {
  // One search per (bucket, term), all in parallel. Cheap + KV/edge-cached.
  const jobs = BUCKET_ORDER.flatMap((bucket) =>
    BUCKET_TERMS[bucket].map(async (term) => ({ bucket, markets: await searchTerm(term) }))
  );
  const results = await Promise.all(jobs);

  const claimed = new Set<string>(); // market id → first bucket wins (precedence order)
  const buckets: PredictionBuckets = { cyber: [], tech: [], ai: [] };

  // Process in precedence order so a cyber-matched market isn't also added to tech/ai.
  for (const bucket of BUCKET_ORDER) {
    const raws = results.filter((r) => r.bucket === bucket).flatMap((r) => r.markets);
    for (const m of raws) {
      const id = m.id ?? m.slug ?? m.url ?? '';
      if (!id || claimed.has(id) || !eligible(m)) continue;
      const market = normalizeMarket(m, bucket);
      if (!market) continue;
      claimed.add(id);
      buckets[bucket].push(market);
    }
  }

  const rank = (a: PredictionMarket, b: PredictionMarket) => b.liquidity - a.liquidity || b.volume - a.volume;
  buckets.cyber = buckets.cyber.sort(rank).slice(0, PER_BUCKET);
  buckets.ai = buckets.ai.sort(rank).slice(0, PER_BUCKET);
  buckets.tech = buckets.tech.sort(rank).slice(0, PER_BUCKET);
  return buckets;
}

// Exposed for unit tests (pure assembly without network).
export { normalizeMarket, eligible, type RawMarket };
