import type { Context } from 'hono';
import type { Env } from '../env';
import { fetchResilient } from '../lib/fetch-resilient';
import { shouldWriteLastGood } from '../lib/lastgood-debounce';

/**
 * GET /api/v1/ransomwhere
 *
 * Mirrors the Ransomwhere crowdsourced ransom-payment tracker — wallet
 * addresses attributed to ransomware families, with on-chain balances (USD),
 * transaction counts, and first/last-seen timestamps. One upstream fetch of
 * the full export per refresh, normalized to snake_case, dual-cached (Cache-API
 * L1 + KV last-good with debounced writes) exactly like supply-chain-attacks.ts.
 * Public, key-gated read (NOT admin-gated).
 *
 * Attribution: Ransomwhere is open data (MIT / public). We echo `source`,
 * `source_url`, and `license` in every response so attribution is structural,
 * and the UI credits + links back to the source (and cites the Zenodo dataset).
 * Neutral framing only (no endorsement).
 *
 * Footguns honored: ONE upstream subrequest (never fan out per-record); KV
 * read only on miss; KV write debounced via shouldWriteLastGood in waitUntil;
 * NOT added to the /api/v1/snapshot composer (already near the 50-subrequest
 * cap). Facet value sets (families / blockchains) are derived at ingest, never
 * hardcoded. Every upstream field is treated defensively (untrusted): strings
 * are length-capped, numbers are coerced + bounded, timestamps coerced to a
 * stable ISO string. The upstream `result` array is hard-capped before mapping.
 *
 * Upstream shape (documented; egress to api.ransomwhe.re may be blocked from
 * some Worker pools — confirm prod-egress reachability before relying on live
 * refresh, the KV last-good path covers transient outages):
 *   { result: [ { address, blockchain, family, balance, balanceUSD,
 *                 transactions, createdAt, updatedAt } ] }
 */

const UPSTREAM = 'https://api.ransomwhe.re/export';

/**
 * OpenSanctions mirrors the raw Ransomwhere export as-is in source.json,
 * updated weekly. Used as fallback when the primary upstream is unreachable.
 * The data is the same Ransomwhere dataset, just redistributed by OpenSanctions.
 * @see https://www.opensanctions.org/datasets/ransomwhere/
 */
const FALLBACK_UPSTREAM =
  'https://data.opensanctions.org/datasets/latest/ransomwhere/source.json';

const SOURCE = 'Ransomwhere';
const SOURCE_URL = 'https://ransomwhe.re/';
const DATASET_URL = 'https://doi.org/10.5281/zenodo.6512123';
const DEFAULT_LICENSE = 'Open data (MIT) — attribute "Ransomwhere"; dataset on Zenodo.';

const CACHE_TTL_SECONDS = 3600; // 1 hour — on-chain balances drift slowly
const KV_LAST_GOOD_KEY = 'ransomwhere:lastgood:v1';
const KV_LAST_GOOD_TTL_SECONDS = 7 * 24 * 60 * 60;

const MAX_WALLETS = 20000; // defensive cap on an untrusted upstream array
const MAX_LIMIT = 1000;
const DEFAULT_LIMIT = 500;

interface Wallet {
  address: string;
  blockchain: string;
  family: string;
  balance_usd: number;
  transactions: number;
  first_seen: string;
  last_seen: string;
}
interface Facets {
  families: Record<string, number>;
  blockchains: Record<string, number>;
}
interface RansomwhereResponse {
  source: string;
  source_url: string;
  dataset_url: string;
  license: string;
  generated_at: string;
  /** Number of wallets AFTER any query filter (i.e. wallets.length). */
  count: number;
  /** Total wallets in the dataset BEFORE filtering. */
  total: number;
  /** Sum of balance_usd across the FULL dataset (never filtered). */
  total_balance_usd: number;
  /** Counts across the full dataset (never filtered) so UI chips stay stable. */
  facets: Facets;
  wallets: Wallet[];
  stale?: boolean;
  upstream_error?: string;
}

function asString(v: unknown, max = 4000): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

/** Coerce an untrusted numeric field to a finite, non-negative, bounded number. */
function asNumber(v: unknown, max = Number.MAX_SAFE_INTEGER): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN;
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, max);
}

/** Coerce an untrusted timestamp (ISO string, epoch seconds, or epoch ms) to a
 *  stable ISO string. Returns '' when it can't be parsed. */
function asTimestamp(v: unknown): string {
  if (typeof v === 'string' && v) {
    const t = Date.parse(v);
    if (Number.isFinite(t)) return new Date(t).toISOString();
    return '';
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    // Heuristic: < 1e12 is epoch SECONDS, otherwise epoch MILLISECONDS.
    const ms = v < 1e12 ? v * 1000 : v;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString();
  }
  return '';
}

function normalizeWallet(raw: Record<string, unknown>): Wallet {
  return {
    address: asString(raw.address, 200),
    blockchain: asString(raw.blockchain, 40).toLowerCase(),
    family: asString(raw.family, 200),
    balance_usd: asNumber(raw.balanceUSD, 1e15),
    transactions: Math.floor(asNumber(raw.transactions, 1e9)),
    first_seen: asTimestamp(raw.createdAt),
    last_seen: asTimestamp(raw.updatedAt),
  };
}

function bump(map: Record<string, number>, key: string): void {
  if (!key) return;
  map[key] = (map[key] ?? 0) + 1;
}

function buildFacets(wallets: Wallet[]): Facets {
  const facets: Facets = { families: {}, blockchains: {} };
  for (const w of wallets) {
    bump(facets.families, w.family);
    bump(facets.blockchains, w.blockchain);
  }
  return facets;
}

/** Apply the optional query filters to a normalized full response. */
function applyFilters(
  full: RansomwhereResponse,
  q: { family?: string; blockchain?: string; limit?: number }
): RansomwhereResponse {
  let wallets = full.wallets;
  if (q.family) {
    const f = q.family.toLowerCase();
    wallets = wallets.filter((w) => w.family.toLowerCase() === f);
  }
  if (q.blockchain) {
    const b = q.blockchain.toLowerCase();
    wallets = wallets.filter((w) => w.blockchain.toLowerCase() === b);
  }
  if (typeof q.limit === 'number') wallets = wallets.slice(0, q.limit);
  return { ...full, wallets, count: wallets.length };
}

export async function ransomwhereHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const family = c.req.query('family')?.trim();
  const blockchain = c.req.query('blockchain')?.trim();
  const limitRaw = c.req.query('limit');
  const limit = limitRaw
    ? Math.min(parseInt(limitRaw, 10) || DEFAULT_LIMIT, MAX_LIMIT)
    : DEFAULT_LIMIT;
  const filterQ = { family, blockchain, limit };

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(
    `https://ransomwhere-cache.internal/v1?f=${family ?? ''}&b=${blockchain ?? ''}&l=${limit}`
  );
  const cached = await cache.match(cacheKey);
  if (cached) return new Response(cached.body, cached);

  const kv = c.env.KV_CACHE;
  let full: RansomwhereResponse | null = null;
  let upstreamError = '';

  const upstreams = [
    { url: UPSTREAM, label: 'primary' },
    { url: FALLBACK_UPSTREAM, label: 'fallback' },
  ];
  for (const { url, label } of upstreams) {
    if (full) break;
    try {
      const res = await fetchResilient(
        url,
        {
          headers: { 'User-Agent': 'pranithjain-dfir/1.0', accept: 'application/json' },
          cf: { cacheTtl: CACHE_TTL_SECONDS, cacheEverything: true },
        } as RequestInit,
        { attempts: 2, timeoutMs: 15_000 }
      );
      if (res.ok) {
        const data = (await res.json()) as { result?: unknown };
        const rawWallets = Array.isArray(data.result) ? data.result.slice(0, MAX_WALLETS) : [];
        const wallets = rawWallets
          .map((r) => normalizeWallet((r ?? {}) as Record<string, unknown>))
          .filter((w) => w.address);
        const total_balance_usd = wallets.reduce((sum, w) => sum + w.balance_usd, 0);
        full = {
          source: SOURCE,
          source_url: SOURCE_URL,
          dataset_url: DATASET_URL,
          license: DEFAULT_LICENSE,
          generated_at: new Date().toISOString(),
          count: wallets.length,
          total: wallets.length,
          total_balance_usd,
          facets: buildFacets(wallets),
          wallets,
        };
      } else {
        upstreamError = `${label} ${res.status}`;
      }
    } catch (err) {
      console.error('handler failed:', err instanceof Error ? err.message : String(err));
      upstreamError = err instanceof Error ? err.message : `${label} fetch failed`;
    }
  }

  // Upstream failed → serve KV last-good (full dataset), filtered, marked stale.
  if (!full) {
    if (kv) {
      try {
        const staleRaw = await kv.get(KV_LAST_GOOD_KEY);
        if (staleRaw) {
          const staleFull = JSON.parse(staleRaw) as RansomwhereResponse;
          const out = applyFilters(staleFull, filterQ);
          return c.json({ ...out, stale: true, upstream_error: upstreamError }, 200, {
            'Cache-Control': 'public, max-age=300',
          });
        }
      } catch (_catchErr) {
        console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
        /* stale read failed; fall through to error */
      }
    }
    return c.json(
      {
        error: 'Ransomwhere unavailable',
        message: upstreamError || 'no data',
        source: SOURCE,
        source_url: SOURCE_URL,
      },
      502,
      { 'Cache-Control': 'no-store' }
    );
  }

  const body = applyFilters(full, filterQ);
  const response = c.json(body, 200, { 'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}` });
  c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));

  // Refresh KV last-good with the FULL (unfiltered) dataset so any filter combo
  // can degrade gracefully. Debounced so we don't write on every cache miss.
  if (kv) {
    const fullForKv = full;
    c.executionCtx.waitUntil(
      (async () => {
        if (await shouldWriteLastGood('ransomwhere')) {
          await kv.put(KV_LAST_GOOD_KEY, JSON.stringify(fullForKv), {
            expirationTtl: KV_LAST_GOOD_TTL_SECONDS,
          });
        }
      })()
    );
  }

  return response;
}