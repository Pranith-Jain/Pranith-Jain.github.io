import type { Context } from 'hono';
import type { Env } from '../env';
import { fetchResilient } from '../lib/fetch-resilient';

/**
 * Ransomwhere — crowdsourced, on-chain ransomware payment tracker
 * (https://ransomwhe.re, MIT data). Unlike leak-site victim trackers, this is
 * *actual ransom payments* observed on-chain (mostly BTC), attributed to
 * ransomware families.
 *
 *   GET /api/v1/ransomwhere                 → totals + per-family leaderboard
 *   GET /api/v1/ransomwhere?family=<name>   → addresses for one family
 *   GET /api/v1/ransomwhere?address=<addr>  → single address record
 *
 * One free upstream export (no key); we fetch it edge-cached and aggregate
 * server-side. Cached 6h — payment data accretes slowly.
 */

const EXPORT_URL = 'https://api.ransomwhe.re/export';
const CACHE_TTL = 6 * 60 * 60;
const FETCH_TIMEOUT_MS = 25_000;
const MAX_ADDRESSES = 500;

interface RwTx {
  hash?: string;
  time?: number;
  amount?: number;
  amountUSD?: number;
}
interface RwRecord {
  address?: string;
  balance?: number;
  balanceUSD?: number;
  blockchain?: string;
  family?: string;
  createdAt?: string;
  updatedAt?: string;
  transactions?: RwTx[];
}

async function fetchExport(): Promise<RwRecord[] | null> {
  try {
    const res = await fetchResilient(
      EXPORT_URL,
      {
        headers: { accept: 'application/json', 'user-agent': 'pranithjain-dfir/1.0' },
        cf: { cacheTtl: CACHE_TTL, cacheEverything: true },
      },
      { attempts: 3, timeoutMs: FETCH_TIMEOUT_MS }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: unknown };
    return Array.isArray(json.result) ? (json.result as RwRecord[]) : null;
  } catch {
    return null;
  }
}

function lastPayment(r: RwRecord): number {
  let t = 0;
  for (const tx of r.transactions ?? []) if (typeof tx.time === 'number' && tx.time > t) t = tx.time;
  return t;
}

export async function ransomwhereHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const family = (c.req.query('family') ?? '').trim();
  const address = (c.req.query('address') ?? '').trim();

  const cacheKey = `https://ransomwhere-cache.internal/v1/${family ? 'fam:' + encodeURIComponent(family.toLowerCase()) : address ? 'addr:' + encodeURIComponent(address) : 'overview'}`;
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheReq = new Request(cacheKey);
  const cached = await cache.match(cacheReq);
  if (cached) return new Response(cached.body, cached);

  const records = await fetchExport();
  if (!records) {
    return c.json({ error: 'upstream_unavailable', detail: 'ransomwhe.re export unreachable' }, 502, {
      'cache-control': 'no-store',
    });
  }

  let body: unknown;

  if (address) {
    const rec = records.find((r) => r.address === address) ?? null;
    body = { address, generated_at: new Date().toISOString(), found: rec !== null, record: rec };
  } else if (family) {
    const fl = family.toLowerCase();
    const matches = records.filter((r) => (r.family ?? '').toLowerCase() === fl);
    const addresses = matches
      .map((r) => ({
        address: r.address ?? '',
        blockchain: r.blockchain ?? 'bitcoin',
        balance_usd: r.balanceUSD ?? 0,
        payment_count: r.transactions?.length ?? 0,
        last_payment: lastPayment(r),
      }))
      .sort((a, b) => b.balance_usd - a.balance_usd)
      .slice(0, MAX_ADDRESSES);
    const totalUsd = matches.reduce((s, r) => s + (r.balanceUSD ?? 0), 0);
    body = {
      family,
      generated_at: new Date().toISOString(),
      total_usd: totalUsd,
      address_count: matches.length,
      addresses,
    };
  } else {
    const byFamily = new Map<string, { total_usd: number; address_count: number; payment_count: number }>();
    let totalUsd = 0;
    let paymentCount = 0;
    for (const r of records) {
      const fam = r.family || 'Unknown';
      const usd = r.balanceUSD ?? 0;
      const txc = r.transactions?.length ?? 0;
      totalUsd += usd;
      paymentCount += txc;
      const cur = byFamily.get(fam) ?? { total_usd: 0, address_count: 0, payment_count: 0 };
      cur.total_usd += usd;
      cur.address_count += 1;
      cur.payment_count += txc;
      byFamily.set(fam, cur);
    }
    const families = [...byFamily.entries()]
      .map(([name, v]) => ({ family: name, ...v }))
      .sort((a, b) => b.total_usd - a.total_usd);
    body = {
      generated_at: new Date().toISOString(),
      total_usd: totalUsd,
      address_count: records.length,
      payment_count: paymentCount,
      family_count: families.length,
      families,
    };
  }

  const response = new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${CACHE_TTL}` },
  });
  c.executionCtx.waitUntil(cache.put(cacheReq, response.clone()));
  return response;
}
