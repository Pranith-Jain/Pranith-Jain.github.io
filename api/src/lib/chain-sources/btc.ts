import { applyFilter } from './filter';
import type { Transfer, TransferFilter, FetchResult } from './types';

const FETCH_TIMEOUT = 10_000;

interface EsploraTx {
  txid: string;
  status: { confirmed: boolean; block_time?: number };
  vin: Array<{ prevout?: { scriptpubkey_address?: string; value?: number } }>;
  vout: Array<{ scriptpubkey_address?: string; value: number }>;
}

function fmtBtc(sat: number): string {
  return `${(Math.abs(sat) / 1e8).toFixed(8).replace(/0+$/, '').replace(/\.$/, '')} BTC`;
}

/**
 * Pure tx→Transfer extraction (no network), so it's unit-testable.
 * Direction is the net sat flow for `address`; counterparty is the largest
 * other-side address (top vout for outgoing, top vin for incoming).
 */
export function extractBtcTransfers(address: string, txs: EsploraTx[]): Transfer[] {
  const out: Transfer[] = [];
  for (const tx of txs) {
    const inputSum = tx.vin
      .filter((v) => v.prevout?.scriptpubkey_address === address)
      .reduce((n, v) => n + (v.prevout?.value ?? 0), 0);
    const outputSum = tx.vout.filter((v) => v.scriptpubkey_address === address).reduce((n, v) => n + v.value, 0);
    const net = outputSum - inputSum;
    const direction: 'in' | 'out' | 'self' = net === 0 ? 'self' : net > 0 ? 'in' : 'out';

    let counterparty = '';
    if (direction === 'out') {
      const top = tx.vout
        .filter((v) => v.scriptpubkey_address && v.scriptpubkey_address !== address)
        .sort((a, b) => b.value - a.value)[0];
      counterparty = top?.scriptpubkey_address ?? '';
    } else {
      const top = tx.vin
        .filter((v) => v.prevout?.scriptpubkey_address && v.prevout.scriptpubkey_address !== address)
        .sort((a, b) => (b.prevout?.value ?? 0) - (a.prevout?.value ?? 0))[0];
      counterparty = top?.prevout?.scriptpubkey_address ?? '';
    }
    if (!counterparty) continue;

    const amtSat = Math.abs(net);
    out.push({
      counterparty,
      direction,
      amount: fmtBtc(amtSat),
      amount_num: amtSat / 1e8,
      token: 'BTC',
      tx_hash: tx.txid,
      timestamp: tx.status.block_time ? new Date(tx.status.block_time * 1000).toISOString() : null,
      chain: 'btc',
      explorer_url: `https://mempool.space/tx/${tx.txid}`,
    });
  }
  return out;
}

/** Fetch the address's raw Esplora txs once. Never throws. */
export async function fetchBtcTxsRaw(address: string): Promise<EsploraTx[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(`https://blockstream.info/api/address/${encodeURIComponent(address)}/txs`, {
      signal: ctrl.signal,
    });
    if (!res.ok) return [];
    const txs = (await res.json().catch(() => [])) as EsploraTx[];
    return Array.isArray(txs) ? txs : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchBtcTransfers(address: string, filter: TransferFilter): Promise<FetchResult> {
  const txs = await fetchBtcTxsRaw(address);
  return applyFilter(extractBtcTransfers(address, txs), filter);
}

export interface CoInputCluster {
  address: string;
  shared_tx_count: number;
}

/**
 * Common-input-ownership heuristic: addresses co-spent as inputs alongside
 * `address` in the same tx are inferred same-owner. Aggregated by co-input
 * address, sorted desc, capped at 20. Pure (no network).
 */
export function clusterCommonInputs(txs: EsploraTx[], address: string): CoInputCluster[] {
  const counts = new Map<string, number>();
  for (const tx of txs) {
    const inputs = tx.vin.map((v) => v.prevout?.scriptpubkey_address).filter((a): a is string => Boolean(a));
    if (!inputs.includes(address)) continue;
    for (const a of new Set(inputs)) {
      if (a === address) continue;
      counts.set(a, (counts.get(a) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([addr, shared_tx_count]) => ({ address: addr, shared_tx_count }))
    .sort((x, y) => y.shared_tx_count - x.shared_tx_count)
    .slice(0, 20);
}
