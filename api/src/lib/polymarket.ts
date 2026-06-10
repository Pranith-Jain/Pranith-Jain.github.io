/**
 * Polymarket prediction-market client (read-only).
 *
 * Pulls active markets from the public Polymarket Gamma API
 * (https://gamma-api.polymarket.com/markets — free, no auth) and classifies
 * them into three topic buckets relevant to this platform: cyber-threat,
 * tech, and AI. Selection is hybrid — a market lands in a bucket via either
 * its Polymarket tag labels (native) OR a curated keyword match on the
 * question text. Ranked by volume + liquidity, capped per bucket.
 *
 * Fail-soft by contract: any upstream/parse failure yields empty buckets, so
 * the route returns 200 with whatever succeeded rather than a 500. (The dev
 * machine's ISP blocks Polymarket; the deployed Worker fetches from CF edge,
 * which reaches it. Parsing is deliberately tolerant of field-name variants.)
 */

const GAMMA_MARKETS = 'https://gamma-api.polymarket.com/markets';
const FETCH_LIMIT = 500; // one subrequest; top active markets by volume
const PER_BUCKET = 18; // cap ~15-20 per bucket
const TIMEOUT_MS = 12_000;

export type Bucket = 'cyber' | 'tech' | 'ai';

export interface PredictionOutcome {
  name: string;
  price: number; // implied probability 0..1
}

export interface PredictionMarket {
  question: string;
  slug: string;
  url: string;
  probability: number; // top-outcome implied probability 0..1
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

// ── Keyword sets (word-boundary matched, case-insensitive). Precedence on a
// multi-match is cyber > ai > tech. Tunable. ───────────────────────────────
const CYBER_WORDS = [
  'breach',
  'data leak',
  'ransomware',
  'hack',
  'hacked',
  'cyber',
  'cyberattack',
  'cyberwar',
  'cve',
  'cisa',
  'zero-day',
  'zero day',
  'exploit',
  'ddos',
  'malware',
  'phishing',
  'spyware',
  'pegasus',
  'outage',
];
const AI_WORDS = [
  'ai',
  'a\\.i',
  'openai',
  'chatgpt',
  'gpt',
  'gpt-5',
  'gpt-6',
  'anthropic',
  'claude',
  'gemini',
  'llm',
  'agi',
  'artificial intelligence',
  'deepmind',
  'grok',
  'llama',
  'sora',
  'superintelligence',
];
const TECH_WORDS = [
  'apple',
  'google',
  'microsoft',
  'meta',
  'tesla',
  'spacex',
  'starship',
  'chip',
  'semiconductor',
  'nvidia',
  'tiktok',
  'antitrust',
  'iphone',
  'amazon',
  'quantum',
  'satellite',
  'self-driving',
  'robot',
  'technology',
];

function wordRegex(words: string[]): RegExp {
  // Word-boundary match so short tokens (ai, cve, llm) don't match substrings.
  return new RegExp(`\\b(?:${words.join('|')})\\b`, 'i');
}
const CYBER_RE = wordRegex(CYBER_WORDS);
const AI_RE = wordRegex(AI_WORDS);
const TECH_RE = wordRegex(TECH_WORDS);

const AI_TAGS = new Set(['ai', 'artificial intelligence']);
const TECH_TAGS = new Set(['tech', 'technology', 'science', 'science and technology']);
const CYBER_TAGS = new Set(['cyber', 'cybersecurity', 'security', 'hacks']);

/** Raw Gamma market — only the fields we read, all optional/tolerant. */
interface RawMarket {
  id?: string;
  question?: string;
  slug?: string;
  outcomes?: string | string[];
  outcomePrices?: string | string[];
  volumeNum?: number;
  volume?: string | number;
  liquidityNum?: number;
  liquidity?: string | number;
  endDate?: string;
  active?: boolean;
  closed?: boolean;
  archived?: boolean;
  tags?: Array<{ label?: string; slug?: string }>;
  events?: Array<{ tags?: Array<{ label?: string; slug?: string }> }>;
}

function num(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** Gamma encodes outcomes/prices as JSON strings ("[\"Yes\",\"No\"]"); be tolerant. */
function parseJsonArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function marketTagLabels(m: RawMarket): string[] {
  const out: string[] = [];
  for (const t of m.tags ?? []) if (t?.label) out.push(t.label);
  for (const e of m.events ?? []) for (const t of e?.tags ?? []) if (t?.label) out.push(t.label);
  return out;
}

/** Hybrid classify: tag labels (native) first, then keyword. Precedence cyber>ai>tech. */
export function classifyMarket(m: RawMarket): Bucket | null {
  const tagLabels = marketTagLabels(m).map((t) => t.toLowerCase());
  const q = m.question ?? '';

  const tagHit = (set: Set<string>) => tagLabels.some((t) => set.has(t));

  if (tagHit(CYBER_TAGS) || CYBER_RE.test(q)) return 'cyber';
  if (tagHit(AI_TAGS) || AI_RE.test(q)) return 'ai';
  if (tagHit(TECH_TAGS) || TECH_RE.test(q)) return 'tech';
  return null;
}

export function normalizeMarket(m: RawMarket, bucket: Bucket): PredictionMarket | null {
  const question = (m.question ?? '').trim();
  const slug = (m.slug ?? '').trim();
  if (!question || !slug) return null;

  const names = parseJsonArray(m.outcomes);
  const prices = parseJsonArray(m.outcomePrices).map((p) => num(p));
  const outcomes: PredictionOutcome[] = names.map((name, i) => ({ name, price: prices[i] ?? 0 }));
  const probability = outcomes.length ? Math.max(...outcomes.map((o) => o.price)) : 0;

  return {
    question,
    slug,
    url: `https://polymarket.com/market/${slug}`,
    probability,
    outcomes,
    volume: num(m.volumeNum ?? m.volume),
    liquidity: num(m.liquidityNum ?? m.liquidity),
    end_date: m.endDate ?? null,
    bucket,
    tags: marketTagLabels(m),
  };
}

/** Pure pipeline: raw markets → ranked, capped, classified buckets. Testable without network. */
export function bucketize(raw: RawMarket[]): PredictionBuckets {
  const buckets: PredictionBuckets = { cyber: [], tech: [], ai: [] };
  for (const m of raw) {
    if (m.closed || m.archived || m.active === false) continue;
    const bucket = classifyMarket(m);
    if (!bucket) continue;
    const market = normalizeMarket(m, bucket);
    if (market) buckets[bucket].push(market);
  }
  const rank = (a: PredictionMarket, b: PredictionMarket) =>
    b.volume + b.liquidity - (a.volume + a.liquidity);
  buckets.cyber = buckets.cyber.sort(rank).slice(0, PER_BUCKET);
  buckets.tech = buckets.tech.sort(rank).slice(0, PER_BUCKET);
  buckets.ai = buckets.ai.sort(rank).slice(0, PER_BUCKET);
  return buckets;
}

/** Fetch active markets from Gamma and bucketize. Fail-soft → empty buckets. */
export async function fetchPredictions(): Promise<PredictionBuckets> {
  const url = `${GAMMA_MARKETS}?active=true&closed=false&order=volumeNum&ascending=false&limit=${FETCH_LIMIT}`;
  try {
    const res = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'pranithjain-dfir/1.0' },
      cf: { cacheTtl: 600, cacheEverything: true },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { cyber: [], tech: [], ai: [] };
    const data = (await res.json()) as RawMarket[] | { markets?: RawMarket[] };
    const raw = Array.isArray(data) ? data : (data.markets ?? []);
    return bucketize(raw);
  } catch {
    return { cyber: [], tech: [], ai: [] };
  }
}
