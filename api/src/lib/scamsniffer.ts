/**
 * ScamSniffer phishing / wallet-drainer address lookup.
 *
 * Source: https://github.com/scamsniffer/scam-database
 *   - blacklist/address.json — flat array of EVM addresses observed in
 *     phishing kits, wallet drainers, fake-airdrop sites, malicious
 *     contracts. Updated continuously by ScamSniffer's crawler.
 *
 * Complementary to OFAC sanctions — different threat model:
 *   - OFAC = "transacting with this address may be a sanctions violation"
 *   - ScamSniffer = "this address has been seen in active phishing /
 *     wallet-drainer operations; users sending to it usually lose funds"
 *
 * Cached 6h via Cache API. Address comparison is normalised (lowercase).
 */

const CACHE_TTL = 6 * 3600;
const CACHE_KEY = 'https://scamsniffer-cache.internal/v1/addresses';
const FETCH_TIMEOUT = 10_000;
const SOURCE_URL = 'https://raw.githubusercontent.com/scamsniffer/scam-database/main/blacklist/address.json';

interface CachedList {
  fetched_at: string;
  addresses: string[];
}

async function loadList(): Promise<Set<string>> {
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(CACHE_KEY);
  const cached = await cache.match(cacheKey);
  if (cached) {
    const body = (await cached.json()) as CachedList;
    return new Set(body.addresses.map((a) => a.toLowerCase()));
  }

  let addresses: string[] = [];
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
    const res = await fetch(SOURCE_URL, { signal: ctrl.signal });
    clearTimeout(timer);
    if (res.ok) {
      const body = (await res.json()) as string[];
      if (Array.isArray(body)) addresses = body.filter((s) => typeof s === 'string');
    }
  } catch {
    /* upstream unreachable — return empty set, don't cache */
  }

  if (addresses.length > 0) {
    const cached: CachedList = { fetched_at: new Date().toISOString(), addresses };
    const stored = new Response(JSON.stringify(cached), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${CACHE_TTL}`,
      },
    });
    void cache.put(cacheKey, stored);
  }

  return new Set(addresses.map((a) => a.toLowerCase()));
}

export interface ScamSnifferCheck {
  flagged: boolean;
  source: string;
  source_url: string;
  list_size?: number;
}

/**
 * Exposes the lowercase address set so callers (e.g. the crypto-trace handler)
 * can cross-reference token-transfer counterparties without re-fetching.
 */
export async function loadScamSnifferSet(): Promise<Set<string>> {
  return loadList();
}

export async function checkScamSniffer(address: string): Promise<ScamSnifferCheck> {
  // ScamSniffer's database is EVM-only — bail out early on non-EVM shapes.
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return {
      flagged: false,
      source: 'ScamSniffer scam-database',
      source_url: 'https://github.com/scamsniffer/scam-database',
    };
  }
  const set = await loadList();
  const flagged = set.has(address.toLowerCase());
  return {
    flagged,
    source: 'ScamSniffer scam-database',
    source_url: 'https://github.com/scamsniffer/scam-database',
    list_size: set.size,
  };
}
