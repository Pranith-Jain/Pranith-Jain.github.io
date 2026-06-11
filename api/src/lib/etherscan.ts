/**
 * Etherscan V2 native-ETH transfer source for the fund-flow tracer.
 *
 * The tracer's EVM path historically pulled ERC-20 token-transfers only (via
 * Blockscout), so native ETH movement was invisible on the graph. This module
 * fills that gap using Etherscan's `account/txlist` (native txs) when an
 * ETHERSCAN_API_KEY is configured. Without a key, the EVM fetcher falls back to
 * Blockscout's keyless native endpoint instead (see chain-sources/evm.ts).
 *
 * Etherscan V2 is single-key/multichain; we pin chainid=1 (Ethereum mainnet) to
 * match the tracer's existing ETH-mainnet scope. Parsing is pure + unit-tested;
 * the fetch wrapper degrades to [] on any failure so the expand still returns
 * its ERC-20 transfers.
 */

import { fmtAmount } from './blockscout';
import type { Transfer } from './chain-sources/types';

const API_BASE = 'https://api.etherscan.io/v2/api';
const CHAIN_ID = 1; // Ethereum mainnet
const TX_LIMIT = 25;
const FETCH_TIMEOUT = 10_000;

/** Parse the leading numeric out of a human amount like "1.23 ETH" → 1.23. */
function leadingNum(amount: string): number {
  const m = amount.match(/^[\d.]+/);
  const n = m ? parseFloat(m[0]) : 0;
  return Number.isFinite(n) ? n : 0;
}

/**
 * Pure: normalise an Etherscan `account/txlist` result array (native ETH txs)
 * into the tracer's `Transfer` shape. Zero-value txs (contract calls carrying no
 * ETH) and rows missing a hash/counterparty are dropped. Direction is derived
 * from `from`/`to` relative to the queried address (case-insensitive).
 */
export function parseEtherscanTxlist(result: unknown, address: string): Transfer[] {
  if (!Array.isArray(result)) return [];
  const lower = address.toLowerCase();
  const out: Transfer[] = [];
  for (const raw of result) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const hash = typeof r.hash === 'string' ? r.hash : '';
    const from = typeof r.from === 'string' ? r.from : '';
    const to = typeof r.to === 'string' ? r.to : '';
    const valueWei = typeof r.value === 'string' ? r.value : '';
    if (!hash || !from || !to) continue;
    // Drop contract calls that move no ETH (value is "0" or all zeros).
    if (!valueWei || /^0*$/.test(valueWei)) continue;

    const isOut = from.toLowerCase() === lower;
    const isIn = to.toLowerCase() === lower;
    const direction: 'in' | 'out' | 'self' = isOut && isIn ? 'self' : isOut ? 'out' : 'in';
    const counterparty = direction === 'in' ? from : to;

    const amount = `${fmtAmount(valueWei, 18)} ETH`;
    const ts = parseInt(typeof r.timeStamp === 'string' ? r.timeStamp : '', 10);
    out.push({
      counterparty,
      direction,
      amount,
      amount_num: leadingNum(amount),
      token: 'ETH',
      tx_hash: hash,
      timestamp: Number.isFinite(ts) ? new Date(ts * 1000).toISOString() : null,
      chain: 'evm',
      explorer_url: `https://etherscan.io/tx/${hash}`,
    });
  }
  return out;
}

/**
 * Fetch recent native ETH transfers for an address from Etherscan V2. Returns []
 * on any failure (bad key, rate limit, network) so the caller still has its
 * ERC-20 transfers. One subrequest.
 */
export async function fetchEtherscanNativeTransfers(address: string, apiKey: string): Promise<Transfer[]> {
  const url =
    `${API_BASE}?chainid=${CHAIN_ID}&module=account&action=txlist` +
    `&address=${encodeURIComponent(address)}&page=1&offset=${TX_LIMIT}&sort=desc&apikey=${encodeURIComponent(apiKey)}`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
    clearTimeout(timer);
    if (!res.ok) return [];
    const body = (await res.json().catch(() => null)) as { status?: string; result?: unknown } | null;
    // Etherscan returns status "0" with a string `result` on error/empty.
    if (!body || body.status === '0') return [];
    return parseEtherscanTxlist(body.result, address);
  } catch {
    return [];
  }
}
