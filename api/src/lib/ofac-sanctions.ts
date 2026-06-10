/**
 * OFAC SDN sanctioned digital-currency address lookup.
 *
 * Source: https://github.com/0xB10C/ofac-sanctioned-digital-currency-addresses
 * Lists branch publishes daily-refreshed JSON arrays of addresses scraped
 * from the U.S. Treasury OFAC SDN advanced XML, broken down by currency:
 *
 *   - sanctioned_addresses_ETH.json   (ERC-20 ecosystem; covers most EVM)
 *   - sanctioned_addresses_XBT.json   (Bitcoin — note: XBT, not BTC)
 *   - sanctioned_addresses_USDT.json  (Tether-specific; usually overlaps ETH)
 *   - …and ~12 other chains (XMR, ZEC, LTC, DASH, BCH, ETC, TRX, ARB, BSC…)
 *
 * Cache for 24 h via Cache API. Address comparison is normalised
 * (lowercased for EVM, exact for BTC and Solana).
 */

const CACHE_TTL = 24 * 3600;
const CACHE_BASE = 'https://ofac-sanctions-cache.internal/v1/';
const FETCH_TIMEOUT = 10_000;
const RAW_BASE =
  'https://raw.githubusercontent.com/0xB10C/ofac-sanctioned-digital-currency-addresses/lists/sanctioned_addresses_';

export type SanctionsChain =
  | 'ETH'
  | 'XBT'
  | 'USDT'
  | 'USDC'
  | 'BCH'
  | 'LTC'
  | 'TRX'
  | 'XMR'
  | 'ZEC'
  | 'DASH'
  | 'ARB'
  | 'BSC'
  | 'ETC';

interface CachedList {
  fetched_at: string;
  addresses: string[];
}

async function loadList(chain: SanctionsChain): Promise<Set<string>> {
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(`${CACHE_BASE}${chain}`);
  const cached = await cache.match(cacheKey);
  if (cached) {
    const body = (await cached.json()) as CachedList;
    return new Set(body.addresses.map(normalize));
  }

  let addresses: string[] = [];
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
    const res = await fetch(`${RAW_BASE}${chain}.json`, { signal: ctrl.signal });
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
    // Don't await — non-fatal if cache write fails.
    void cache.put(cacheKey, stored);
  }

  return new Set(addresses.map(normalize));
}

function normalize(addr: string): string {
  // EVM addresses are case-insensitive; Bitcoin / Solana are case-sensitive (sort of).
  // For Bitcoin base58, case matters. For Bech32 (`bc1…`), lowercase form is canonical.
  // For Solana base58, case matters.
  // To keep matching robust, we lowercase *only* when the value is hex-ish (EVM).
  if (/^0x[a-fA-F0-9]{40}$/.test(addr)) return addr.toLowerCase();
  if (/^bc1/.test(addr)) return addr.toLowerCase();
  return addr;
}

export interface SanctionsCheck {
  listed: boolean;
  /** Which list (e.g. 'ETH', 'XBT') matched. */
  matched_in?: SanctionsChain;
  /** Source attribution. */
  source: string;
  source_url: string;
  /** When the cached list was fetched. */
  list_fetched_at?: string;
}

export async function checkAddress(address: string, chains: SanctionsChain[]): Promise<SanctionsCheck> {
  const norm = normalize(address);
  // Check each chain list in parallel.
  const checks = await Promise.all(
    chains.map(async (chain) => {
      const set = await loadList(chain);
      return { chain, hit: set.has(norm) };
    })
  );
  const hit = checks.find((c) => c.hit);
  return {
    listed: !!hit,
    matched_in: hit?.chain,
    source: 'OFAC SDN (via 0xB10C/ofac-sanctioned-digital-currency-addresses)',
    source_url: 'https://github.com/0xB10C/ofac-sanctioned-digital-currency-addresses',
  };
}

/**
 * Load and merge the sanctioned-address sets for the given chains ONCE, so a
 * caller can do many in-memory `.has()` checks without per-address Cache-API ops
 * (which count toward the Worker subrequest budget). Values are normalised the
 * same way as `checkAddress` (lowercased for EVM/bech32, exact otherwise).
 */
export async function loadSanctionedSet(chains: SanctionsChain[]): Promise<Set<string>> {
  const merged = new Set<string>();
  const sets = await Promise.all(chains.map((c) => loadList(c)));
  for (const s of sets) for (const a of s) merged.add(a);
  return merged;
}
