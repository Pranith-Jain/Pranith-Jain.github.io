/**
 * Ransomwhere known-ransom-payment-wallet lookup for the fund-flow tracer.
 *
 * Source: https://api.ransomwhe.re/export — the crowdsourced Ransomwhere tracker
 * (https://ransomwhe.re/), wallet addresses attributed to ransomware families.
 *
 * This is the tracer-side counterpart to the `/api/v1/ransomwhere` PAGE route:
 * the page lists/aggregates the dataset; this module turns it into a fast
 * in-memory address→family map so an `/expand` can flag a counterparty as a
 * known ransom wallet without per-address fetches. Mirrors the load+cache shape
 * of ofac-sanctions.ts / scamsniffer.ts (one upstream fetch, Cache-API cached).
 *
 * Threat model differs from the other two checkers:
 *   - OFAC        = "transacting with this may be a sanctions violation"
 *   - ScamSniffer = "active phishing / wallet-drainer; senders lose funds"
 *   - Ransomwhere = "this wallet has received ransomware extortion payments"
 *
 * Only BTC + EVM are kept — Ransomwhere's `bitcoin`→btc and `ethereum`→evm map
 * onto traceable tracer chains; Monero (untraceable) and any other chain are
 * dropped. Cached 24h via Cache API. Keys normalised (lowercase hex / bech32).
 */

import type { TracerChain } from './chain-sources/types';

export type RansomMap = Map<string, string>; // normalizedAddress -> family ('' when upstream omitted it)

const CACHE_TTL = 24 * 3600;
const CACHE_KEY = 'https://ransomwhere-set-cache.internal/v1/map';
const FETCH_TIMEOUT = 20_000;
const SOURCE_URL = 'https://api.ransomwhe.re/export';

/** Upstream `blockchain` value → tracer chain. Anything absent here is dropped. */
const CHAIN_MAP: Record<string, TracerChain> = { bitcoin: 'btc', ethereum: 'evm' };

/** Normalise the same way ofac-sanctions does: lowercase hex (EVM) and bech32
 *  (`bc1…`), exact otherwise. Build and lookup must use the SAME function. */
function normalize(addr: string): string {
  if (/^0x[a-fA-F0-9]{40}$/.test(addr)) return addr.toLowerCase();
  if (/^bc1/i.test(addr)) return addr.toLowerCase();
  return addr;
}

/**
 * Pure: build an address→family map from the upstream `result` array. Only
 * traceable chains survive (bitcoin→btc, ethereum→evm); rows without a string
 * address are skipped. Family is length-capped (untrusted upstream field).
 */
export function buildRansomMap(result: unknown): RansomMap {
  const map: RansomMap = new Map();
  if (!Array.isArray(result)) return map;
  for (const raw of result) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const blockchain = typeof r.blockchain === 'string' ? r.blockchain.toLowerCase() : '';
    if (!(blockchain in CHAIN_MAP)) continue;
    const address = typeof r.address === 'string' ? r.address : '';
    if (!address) continue;
    const family = typeof r.family === 'string' ? r.family.slice(0, 200) : '';
    map.set(normalize(address), family);
  }
  return map;
}

export interface RansomCheck {
  flagged: boolean;
  /** Attributed family, or null when flagged but upstream gave no family. */
  family: string | null;
}

/**
 * Pure lookup against a loaded map. Ransomwhere only attributes BTC + EVM
 * wallets, so any other tracer chain (e.g. tron) never matches. The address is
 * normalised the same way as the map keys.
 */
export function checkRansomwhere(map: RansomMap, chain: TracerChain, address: string): RansomCheck {
  if (chain !== 'btc' && chain !== 'evm') return { flagged: false, family: null };
  const family = map.get(normalize(address));
  if (family === undefined) return { flagged: false, family: null };
  return { flagged: true, family: family || null };
}

interface CachedMap {
  fetched_at: string;
  entries: [string, string][];
}

/**
 * Load the ransom wallet map ONCE (cached 24h via Cache API), so a caller can do
 * many in-memory `checkRansomwhere` lookups without per-address subrequests.
 * Returns an empty map (and does not cache) when upstream is unreachable.
 */
export async function loadRansomwhereMap(): Promise<RansomMap> {
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(CACHE_KEY);
  const cached = await cache.match(cacheKey);
  if (cached) {
    const body = (await cached.json()) as CachedMap;
    return new Map(body.entries);
  }

  let map: RansomMap = new Map();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
    const res = await fetch(SOURCE_URL, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'pranithjain-dfir/1.0', accept: 'application/json' },
    });
    clearTimeout(timer);
    if (res.ok) {
      const data = (await res.json()) as { result?: unknown };
      map = buildRansomMap(data.result);
    }
  } catch {
    /* upstream unreachable — return empty map, don't cache */
  }

  if (map.size > 0) {
    const payload: CachedMap = { fetched_at: new Date().toISOString(), entries: [...map] };
    const stored = new Response(JSON.stringify(payload), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${CACHE_TTL}`,
      },
    });
    // Don't await — non-fatal if cache write fails.
    void cache.put(cacheKey, stored);
  }

  return map;
}
