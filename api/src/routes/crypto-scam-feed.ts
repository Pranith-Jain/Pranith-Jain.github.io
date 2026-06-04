import type { Context } from 'hono';
import type { Env } from '../env';
import { fetchResilient } from '../lib/fetch-resilient';
import { shouldWriteLastGood } from '../lib/lastgood-debounce';
import { readLastGood } from '../lib/lastgood';

/**
 * Crypto-scam / crypto-phishing domain feed.
 *
 * Source: spmedia's "Crypto Scam and Crypto Phishing Threat Intel Feed"
 * (https://github.com/spmedia/Crypto-Scam-and-Crypto-Phishing-Threat-Intel-Feed,
 * MIT). A curated list of fresh crypto phishing / scam / drainer / pig-butchering
 * domains, refreshed daily. All entries are ≤ 1 year old at inclusion.
 *
 * The raw JSON is small (~700 domain strings) so a plain live fetch with a 1h
 * server-side cache + last-good fallback is plenty — same shape as
 * phishing-urls.ts. The parsed domains also feed the unified /live-iocs
 * firehose via `fetchCryptoScamCached` (tagged source `crypto-scam`).
 */

const SOURCE_JSON_URL =
  'https://raw.githubusercontent.com/spmedia/Crypto-Scam-and-Crypto-Phishing-Threat-Intel-Feed/main/detected_urls.json';

/** Exported so /api/v1/feed-status (and live-iocs) can read the same cached payload. */
export const CRYPTO_SCAM_CACHE_KEY = 'https://crypto-scam-feed-cache.internal/v1';
const CACHE_TTL_SECONDS = 3600;
/** Short-TTL fallback when upstream returned nothing — avoids locking in an empty snapshot for 1h. */
const DEGRADED_TTL_SECONDS = 60;
const FETCH_TIMEOUT_MS = 15_000;

const LASTGOOD_KEY = 'crypto-scam-feed/lastgood/v1';
const LASTGOOD_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface CryptoScamItem {
  domain: string;
  tld: string;
}

export interface CryptoScamResponse {
  generated_at: string;
  /** True when items were restored from last-good because upstream failed. */
  stale: boolean;
  total: number;
  tld_breakdown: Record<string, number>;
  metadata: {
    title?: string;
    description?: string;
    author?: string;
    source?: string;
  };
  items: CryptoScamItem[];
}

interface RawFeed {
  metadata?: Record<string, unknown>;
  detected_urls?: unknown;
}

interface LastGoodSlice {
  items: CryptoScamItem[];
  refreshed_at: string;
}

/** Strip scheme/path/port and lowercase so we end up with a bare hostname. */
function toDomain(raw: string): string | null {
  let s = raw.trim().toLowerCase();
  if (!s) return null;
  if (s.includes('://')) {
    try {
      s = new URL(s).hostname;
    } catch {
      s = s.split('://')[1] ?? s;
    }
  }
  // Drop any leftover path / query / port.
  s = s.split('/')[0]!.split('?')[0]!.split(':')[0]!;
  // Must look like a hostname (contains a dot, no spaces).
  if (!s.includes('.') || /\s/.test(s)) return null;
  return s;
}

function tldOf(domain: string): string {
  const parts = domain.split('.');
  return parts.length > 1 ? parts[parts.length - 1]! : '';
}

async function fetchRaw(): Promise<RawFeed | null> {
  try {
    const res = await fetchResilient(
      SOURCE_JSON_URL,
      {
        headers: { 'user-agent': 'pranithjain-dfir/1.0', accept: 'application/json,*/*' },
        cf: { cacheTtl: 1800, cacheEverything: true },
        redirect: 'follow',
      },
      { attempts: 3, timeoutMs: FETCH_TIMEOUT_MS }
    );
    if (!res.ok) return null;
    return (await res.json()) as RawFeed;
  } catch {
    return null;
  }
}

function parseItems(raw: RawFeed): CryptoScamItem[] {
  const list = Array.isArray(raw.detected_urls) ? raw.detected_urls : [];
  const seen = new Set<string>();
  const out: CryptoScamItem[] = [];
  for (const entry of list) {
    if (typeof entry !== 'string') continue;
    const domain = toDomain(entry);
    if (!domain || seen.has(domain)) continue;
    seen.add(domain);
    out.push({ domain, tld: tldOf(domain) });
  }
  return out;
}

async function readLastGoodSlice(env: Env): Promise<CryptoScamItem[] | null> {
  const parsed = await readLastGood<LastGoodSlice>(env, LASTGOOD_KEY, { keyPrefix: '' });
  if (!parsed) return null;
  return Array.isArray(parsed.items) && parsed.items.length > 0 ? parsed.items : null;
}

function writeLastGood(
  kv: KVNamespace | undefined,
  items: CryptoScamItem[],
  executionCtx?: { waitUntil: (p: Promise<unknown>) => void }
): void {
  if (!kv || items.length === 0) return;
  const body = JSON.stringify({ items, refreshed_at: new Date().toISOString() } satisfies LastGoodSlice);
  const guarded = async () => {
    if (await shouldWriteLastGood('crypto-scam-feed')) {
      await kv.put(LASTGOOD_KEY, body, { expirationTtl: LASTGOOD_TTL_SECONDS });
    }
  };
  if (executionCtx) executionCtx.waitUntil(guarded());
  else void guarded();
}

function buildResponse(raw: RawFeed | null, items: CryptoScamItem[], stale: boolean): CryptoScamResponse {
  const tldBreakdown: Record<string, number> = {};
  for (const it of items) {
    if (it.tld) tldBreakdown[it.tld] = (tldBreakdown[it.tld] ?? 0) + 1;
  }
  const md = (raw?.metadata ?? {}) as Record<string, unknown>;
  const str = (k: string): string | undefined => (typeof md[k] === 'string' ? (md[k] as string) : undefined);
  return {
    generated_at: new Date().toISOString(),
    stale,
    total: items.length,
    tld_breakdown: tldBreakdown,
    metadata: {
      title: str('title'),
      description: str('description'),
      author: str('author'),
      source: str('source'),
    },
    items,
  };
}

export async function fetchCryptoScam(
  executionCtx?: { waitUntil: (p: Promise<unknown>) => void },
  kv?: KVNamespace
): Promise<CryptoScamResponse> {
  const raw = await fetchRaw();
  let items = raw ? parseItems(raw) : [];
  let stale = false;

  if (items.length > 0) {
    writeLastGood(kv, items, executionCtx);
  } else {
    const restored = await readLastGoodSlice({ KV_CACHE: kv } as unknown as Env);
    if (restored) {
      items = restored;
      stale = true;
    }
  }
  return buildResponse(raw, items, stale);
}

/**
 * Cache-aware variant — reads CRYPTO_SCAM_CACHE_KEY first (1h TTL) so internal
 * callers (live-iocs) share the standalone handler's view instead of hitting
 * upstream again. Falls through to a fresh fetch on cold cache.
 */
export async function fetchCryptoScamCached(
  executionCtx?: { waitUntil: (p: Promise<unknown>) => void },
  kv?: KVNamespace
): Promise<CryptoScamResponse> {
  const cache = (caches as unknown as { default: Cache }).default;
  const cached = await cache.match(new Request(CRYPTO_SCAM_CACHE_KEY));
  if (cached) return (await cached.json()) as CryptoScamResponse;

  const body = await fetchCryptoScam(executionCtx, kv);
  if (executionCtx) {
    const ttl = body.total === 0 ? DEGRADED_TTL_SECONDS : CACHE_TTL_SECONDS;
    const resp = new Response(JSON.stringify(body), {
      headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${ttl}` },
    });
    executionCtx.waitUntil(cache.put(new Request(CRYPTO_SCAM_CACHE_KEY), resp));
  }
  return body;
}

export async function cryptoScamFeedHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheReq = new Request(CRYPTO_SCAM_CACHE_KEY);
  const cached = await cache.match(cacheReq);
  if (cached) return new Response(cached.body, cached);

  const body = await fetchCryptoScam(c.executionCtx, c.env.KV_CACHE);
  const ttl = body.total === 0 ? DEGRADED_TTL_SECONDS : CACHE_TTL_SECONDS;
  const response = new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${ttl}` },
  });
  c.executionCtx.waitUntil(cache.put(cacheReq, response.clone()));
  return response;
}
